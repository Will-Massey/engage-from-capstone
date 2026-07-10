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
  /** One-off (non-recurring) lines added to the first invoice. */
  oneOffLines?: { name: string; unitAmountPence: number; quantity: number }[];
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

  // Playwright stub — no live Stripe when the connected account is the e2e
  // sentinel (mirrors createStripeProposalCheckout).
  if (input.connectedAccountId === 'acct_e2e_stub') {
    return {
      sessionId: `cs_e2e_${input.proposalId}`,
      checkoutUrl: '',
      applicationFeePercent,
    };
  }

  const lineItems: object[] = input.group.lines.map((l) => ({
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
  // One-off items (no `recurring`) are billed once on the first invoice.
  for (const l of input.oneOffLines ?? []) {
    lineItems.push({
      quantity: l.quantity,
      price_data: {
        currency: 'gbp',
        unit_amount: l.unitAmountPence,
        product_data: { name: l.name },
      },
    });
  }

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

/**
 * Stripe billing portal for the client behind a recurring proposal — card
 * update, invoice history, cancellation (per portal configuration). Returns
 * null when no portal can be created (no Stripe, no customer).
 */
export async function createBillingPortalSession(
  subscriptionId: string,
  returnUrl: string
): Promise<string | null> {
  if (!stripe) return null;
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  if (!customer) return null;
  const session = await stripe.billingPortal.sessions.create({
    customer,
    return_url: returnUrl,
  });
  return session.url;
}

export interface RecurringRevenueSummary {
  activeSubscriptions: number;
  paidLast30DaysPence: number;
  failedLast30Days: number;
}

/**
 * Practice-facing recurring revenue snapshot, driven by the invoice webhook
 * activity log: live subscriptions, pence collected in the last 30 days, and
 * failed payments needing dunning attention.
 */
export async function getRecurringRevenueSummary(
  tenantId: string
): Promise<RecurringRevenueSummary> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [activeSubscriptions, paidEvents, failedLast30Days] = await Promise.all([
    prisma.proposal.count({ where: { tenantId, stripeSubscriptionId: { not: null } } }),
    prisma.activityLog.findMany({
      where: { tenantId, action: 'RECURRING_PAYMENT', createdAt: { gte: since } },
      select: { metadata: true },
    }),
    prisma.activityLog.count({
      where: { tenantId, action: 'RECURRING_PAYMENT_FAILED', createdAt: { gte: since } },
    }),
  ]);

  let paidLast30DaysPence = 0;
  for (const event of paidEvents) {
    try {
      const meta = JSON.parse(event.metadata || '{}');
      if (typeof meta.amountPaid === 'number') paidLast30DaysPence += meta.amountPaid;
    } catch {
      // malformed metadata — skip the row
    }
  }

  return { activeSubscriptions, paidLast30DaysPence, failedLast30Days };
}
