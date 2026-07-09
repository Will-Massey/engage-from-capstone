/**
 * R1 — recurring fee collection via Stripe Checkout (subscription mode) on the
 * practice's connected account, with the platform fee taken as
 * `application_fee_percent`. Invoice webhooks record recurring payments (MRR)
 * and payment failures (dunning) to the activity log.
 *
 * v1 scope: one subscription per interval group (a Stripe subscription bills on
 * a single interval). Mixing one-off + recurring in a single client action, and
 * a dedicated recurring ledger/MRR table, are follow-ups (see MARKET_LEADER_ROADMAP).
 */
import { stripe } from '../config/stripe.js';
import { prisma } from '../config/database.js';
import logger from '../config/logger.js';
import type { RecurringGroup } from '../lib/payments/recurringLines.js';

export interface RecurringCheckoutInput {
  proposalId: string;
  tenantId: string;
  reference: string;
  group: RecurringGroup;
  connectedAccountId: string;
  platformFeeBps: number;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export interface RecurringCheckoutResult {
  sessionId: string;
  checkoutUrl: string;
  applicationFeePercent: number;
}

/** Basis points → Stripe application_fee_percent (250 bps → 2.5). */
export function bpsToPercent(bps: number): number {
  return Math.round((bps / 100) * 100) / 100;
}

export async function createRecurringCheckout(
  input: RecurringCheckoutInput
): Promise<RecurringCheckoutResult> {
  if (!stripe) throw new Error('STRIPE_NOT_CONFIGURED');

  const applicationFeePercent = bpsToPercent(input.platformFeeBps);
  const lineItems = input.group.lines.map((l) => ({
    quantity: l.quantity,
    price_data: {
      currency: 'gbp',
      unit_amount: l.unitAmountPence,
      recurring: {
        interval: input.group.interval.interval,
        interval_count: input.group.interval.interval_count,
      },
      product_data: { name: l.name },
    },
  }));

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: input.customerEmail,
    line_items: lineItems,
    subscription_data: {
      application_fee_percent: applicationFeePercent,
      transfer_data: { destination: input.connectedAccountId },
      metadata: { proposalId: input.proposalId, tenantId: input.tenantId },
    },
    metadata: { proposalId: input.proposalId, tenantId: input.tenantId },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });

  return {
    sessionId: session.id,
    checkoutUrl: session.url ?? '',
    applicationFeePercent,
  };
}

interface InvoiceLike {
  id?: string;
  subscription?: string | { id?: string; metadata?: Record<string, string> } | null;
  amount_paid?: number | null;
  amount_due?: number | null;
  subscription_details?: { metadata?: Record<string, string> | null } | null;
}

async function proposalMetaFromInvoice(
  invoice: InvoiceLike
): Promise<{ proposalId?: string; tenantId?: string; subscriptionId?: string }> {
  // Prefer metadata carried on the invoice's subscription_details, else retrieve the subscription.
  let meta = invoice.subscription_details?.metadata || undefined;
  const sub = invoice.subscription;
  const subscriptionId = typeof sub === 'string' ? sub : sub?.id;
  if (!meta && sub && typeof sub === 'object' && sub.metadata) meta = sub.metadata;
  if (!meta && subscriptionId && stripe) {
    try {
      const full = await stripe.subscriptions.retrieve(subscriptionId);
      meta = (full.metadata as Record<string, string>) || undefined;
    } catch (err) {
      logger.warn(`invoice ${invoice.id}: could not retrieve subscription ${subscriptionId}`, err);
    }
  }
  return { proposalId: meta?.proposalId, tenantId: meta?.tenantId, subscriptionId };
}

async function logRecurring(
  tenantId: string,
  proposalId: string,
  action: string,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        tenantId,
        action,
        entityType: 'PROPOSAL',
        entityId: proposalId,
        proposalId,
        description: action.replace(/_/g, ' ').toLowerCase(),
        metadata: JSON.stringify(metadata),
      },
    });
  } catch (err) {
    logger.warn('Failed to log recurring event', err);
  }
}

/** invoice.paid — a recurring payment succeeded (MRR signal). */
export async function handleRecurringInvoicePaid(invoice: InvoiceLike): Promise<void> {
  const { proposalId, tenantId, subscriptionId } = await proposalMetaFromInvoice(invoice);
  if (!proposalId || !tenantId) return;
  await logRecurring(tenantId, proposalId, 'RECURRING_PAYMENT', {
    invoiceId: invoice.id,
    subscriptionId,
    amountPaid: invoice.amount_paid,
  });
}

/** invoice.payment_failed — recurring payment failed (dunning signal). */
export async function handleRecurringInvoiceFailed(invoice: InvoiceLike): Promise<void> {
  const { proposalId, tenantId, subscriptionId } = await proposalMetaFromInvoice(invoice);
  if (!proposalId || !tenantId) return;
  await logRecurring(tenantId, proposalId, 'RECURRING_PAYMENT_FAILED', {
    invoiceId: invoice.id,
    subscriptionId,
    amountDue: invoice.amount_due,
  });
}
