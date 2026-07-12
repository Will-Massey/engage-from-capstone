/**
 * Mirror paid Stripe recurring invoices into accounting systems (R4.1).
 *
 * Xero: only in xeroSyncMode 'paid_invoices' — creates an AUTHORISED ACCREC
 * invoice (Reference = Stripe invoice id), optionally paid against
 * xeroPaymentAccountCode. QuickBooks: whenever connected (QBO has no draft
 * repeating-invoice mode) — creates an invoice, optionally paid against
 * paymentAccountId.
 *
 * Line policy: if one recurring billing-frequency group's gross total equals
 * the amount Stripe collected, the proposal's lines for that group are used;
 * otherwise a single fallback line for amount_paid ensures the accounting
 * invoice ALWAYS matches the money actually collected.
 *
 * Idempotent via ActivityLog (XERO_INVOICE_SYNCED / QBO_INVOICE_SYNCED records
 * carrying the Stripe invoice id). Never throws — callers sit on the Stripe
 * webhook path, which must always 200.
 */

import { prisma } from '../config/database.js';
import logger from '../config/logger.js';
import { getTenantXeroSettings, isXeroOAuthConfigured } from './tenantXeroSettings.js';
import {
  getTenantQuickBooksSettings,
  isQuickBooksOAuthConfigured,
} from './tenantQuickbooksSettings.js';
import {
  getAuthenticatedXeroSession,
  resolveOrCreateContact,
  createXeroAccRecInvoice,
  createXeroPaymentForInvoice,
  type XeroInvoiceLine,
} from './xeroService.js';
import { getAuthenticatedQuickBooksSession } from './quickbooksService.js';
import { createInvoice, createPayment } from './quickbooksApi.js';
import { resolveOrCreateQboCustomer } from './quickbooksProposalPush.js';

export const XERO_INVOICE_SYNCED_ACTION = 'XERO_INVOICE_SYNCED';
export const QBO_INVOICE_SYNCED_ACTION = 'QBO_INVOICE_SYNCED';

export interface PaidInvoiceServiceLine {
  name: string;
  billingFrequency: string;
  lineTotal: number;
  vatAmount: number;
  grossTotal: number;
  grossTotalPence?: number | null;
}

export interface PaidInvoiceLinePlan {
  /** True when a billing-frequency group's lines matched the collected amount */
  matchedLines: boolean;
  lines: Array<{
    description: string;
    /** Net (VAT-exclusive) GBP for matched lines; gross GBP for the fallback line */
    netAmount: number;
    vatAmount: number;
    grossAmount: number;
  }>;
}

function grossPence(s: PaidInvoiceServiceLine): number {
  return s.grossTotalPence ?? Math.round(s.grossTotal * 100);
}

/**
 * Choose invoice lines for a paid Stripe invoice: the recurring group whose
 * gross total equals amount_paid, else a single fallback line for amount_paid
 * (first invoices with one-off items, discounts, or drift land here).
 */
export function planPaidInvoiceLines(
  services: PaidInvoiceServiceLine[],
  amountPaidPence: number,
  proposalTitle: string
): PaidInvoiceLinePlan {
  const groups = new Map<string, PaidInvoiceServiceLine[]>();
  for (const service of services) {
    if (service.billingFrequency === 'ONE_TIME') continue;
    const key = service.billingFrequency || 'MONTHLY';
    const existing = groups.get(key) || [];
    existing.push(service);
    groups.set(key, existing);
  }

  for (const lines of groups.values()) {
    const groupPence = lines.reduce((acc, s) => acc + grossPence(s), 0);
    if (groupPence === amountPaidPence) {
      return {
        matchedLines: true,
        lines: lines.map((s) => ({
          description: s.name,
          netAmount: s.lineTotal,
          vatAmount: s.vatAmount,
          grossAmount: grossPence(s) / 100,
        })),
      };
    }
  }

  const amount = amountPaidPence / 100;
  return {
    matchedLines: false,
    lines: [
      {
        description: `Recurring fees — ${proposalTitle}`,
        netAmount: amount,
        vatAmount: 0,
        grossAmount: amount,
      },
    ],
  };
}

async function hasSyncRecord(
  tenantId: string,
  proposalId: string,
  action: string,
  stripeInvoiceId: string
): Promise<boolean> {
  const record = await prisma.activityLog.findFirst({
    where: {
      tenantId,
      proposalId,
      action,
      metadata: { contains: stripeInvoiceId },
    },
    select: { id: true },
  });
  return Boolean(record);
}

async function writeSyncRecord(
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
    logger.warn(`Failed to log ${action}`, err);
  }
}

interface SyncArgs {
  tenantId: string;
  proposalId: string;
  stripeInvoiceId: string;
  amountPaidPence: number;
}

type ProposalForSync = {
  title: string;
  reference: string;
  client: { name: string; contactEmail: string; contactName: string | null; tags: string };
  services: PaidInvoiceServiceLine[];
};

async function syncToXero(args: SyncArgs, proposal: ProposalForSync): Promise<void> {
  if (!isXeroOAuthConfigured()) return;
  const settings = await getTenantXeroSettings(args.tenantId);
  if (!settings?.connected || settings.xeroSyncMode !== 'paid_invoices') return;

  if (
    await hasSyncRecord(
      args.tenantId,
      args.proposalId,
      XERO_INVOICE_SYNCED_ACTION,
      args.stripeInvoiceId
    )
  ) {
    return;
  }

  const session = await getAuthenticatedXeroSession(args.tenantId);
  const contactId = await resolveOrCreateContact(session, proposal.client, proposal.reference);
  if (!contactId) {
    throw new Error('No Xero contact available for paid-invoice sync');
  }

  const plan = planPaidInvoiceLines(proposal.services, args.amountPaidPence, proposal.title);
  const lines: XeroInvoiceLine[] = plan.matchedLines
    ? plan.lines.map((l) => ({
        description: l.description,
        unitAmount: l.netAmount,
        taxAmount: l.vatAmount,
      }))
    : plan.lines.map((l) => ({
        description: l.description,
        unitAmount: l.grossAmount,
        taxAmount: 0,
        taxType: 'NONE',
      }));

  const invoiceId = await createXeroAccRecInvoice(session, {
    contactId,
    reference: args.stripeInvoiceId,
    lines,
  });

  let paymentApplied = false;
  if (settings.xeroPaymentAccountCode) {
    await createXeroPaymentForInvoice(session, {
      invoiceId,
      accountCode: settings.xeroPaymentAccountCode,
      amount: args.amountPaidPence / 100,
    });
    paymentApplied = true;
  }

  await writeSyncRecord(args.tenantId, args.proposalId, XERO_INVOICE_SYNCED_ACTION, {
    stripeInvoiceId: args.stripeInvoiceId,
    xeroInvoiceId: invoiceId,
    amountPaidPence: args.amountPaidPence,
    matchedLines: plan.matchedLines,
    paymentApplied,
  });

  logger.info(
    `Xero paid-invoice sync: ${args.stripeInvoiceId} → ${invoiceId} (payment: ${paymentApplied})`
  );
}

async function syncToQuickBooks(args: SyncArgs, proposal: ProposalForSync): Promise<void> {
  if (!isQuickBooksOAuthConfigured()) return;
  const settings = await getTenantQuickBooksSettings(args.tenantId);
  if (!settings?.connected) return;

  if (
    await hasSyncRecord(
      args.tenantId,
      args.proposalId,
      QBO_INVOICE_SYNCED_ACTION,
      args.stripeInvoiceId
    )
  ) {
    return;
  }

  const session = await getAuthenticatedQuickBooksSession(args.tenantId);
  const customerId = await resolveOrCreateQboCustomer(session, proposal.client);

  const plan = planPaidInvoiceLines(proposal.services, args.amountPaidPence, proposal.title);
  const invoice = await createInvoice(session, {
    customerId,
    privateNote: `Stripe invoice ${args.stripeInvoiceId} (Engage ${proposal.reference})`,
    lines: plan.lines.map((l) => ({ description: l.description, amount: l.grossAmount })),
  });

  let paymentApplied = false;
  if (settings.paymentAccountId && invoice.Id) {
    await createPayment(session, {
      customerId,
      invoiceId: invoice.Id,
      amount: args.amountPaidPence / 100,
      depositAccountId: settings.paymentAccountId,
    });
    paymentApplied = true;
  }

  await writeSyncRecord(args.tenantId, args.proposalId, QBO_INVOICE_SYNCED_ACTION, {
    stripeInvoiceId: args.stripeInvoiceId,
    qboInvoiceId: invoice.Id,
    amountPaidPence: args.amountPaidPence,
    matchedLines: plan.matchedLines,
    paymentApplied,
  });

  logger.info(
    `QuickBooks paid-invoice sync: ${args.stripeInvoiceId} → ${invoice.Id} (payment: ${paymentApplied})`
  );
}

/**
 * Fire-and-forget from the Stripe invoice.paid webhook — an accounting
 * failure must NEVER fail the webhook; each provider is isolated and logged.
 */
export async function syncPaidStripeInvoice(args: SyncArgs): Promise<void> {
  try {
    if (!args.stripeInvoiceId || args.amountPaidPence <= 0) return;

    const proposal = await prisma.proposal.findFirst({
      where: { id: args.proposalId, tenantId: args.tenantId },
      include: { client: true, services: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!proposal) return;

    try {
      await syncToXero(args, proposal);
    } catch (err) {
      logger.warn(`Xero paid-invoice sync failed for ${args.stripeInvoiceId}:`, err);
    }

    try {
      await syncToQuickBooks(args, proposal);
    } catch (err) {
      logger.warn(`QuickBooks paid-invoice sync failed for ${args.stripeInvoiceId}:`, err);
    }
  } catch (err) {
    logger.warn(`Paid-invoice accounting sync failed for ${args.stripeInvoiceId}:`, err);
  }
}
