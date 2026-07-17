/**
 * Push accepted proposals to QuickBooks Online (R4.1).
 *
 * QBO has no low-risk repeating-invoice equivalent (recurring transactions
 * are live billing documents), so QBO parity is: manual proposal push creates
 * a single unpaid invoice from the recurring lines, and paid Stripe invoices
 * are mirrored via accountingPaidInvoiceSync. Idempotency is ActivityLog-based
 * (QBO_PROPOSAL_PUSHED), matching the Xero convention.
 */

import { prisma } from '../config/database.js';
import logger from '../config/logger.js';
import { getAuthenticatedQuickBooksSession, type QuickBooksSession } from './quickbooksService.js';
import {
  createCustomer,
  createInvoice,
  findCustomerByEmail,
  findCustomerByName,
} from './quickbooksApi.js';
import {
  getTenantQuickBooksSettings,
  saveTenantQuickBooksSettings,
} from './tenantQuickbooksSettings.js';

export const QBO_PROPOSAL_PUSHED_ACTION = 'QBO_PROPOSAL_PUSHED';

/** Client.tags carries the QBO link as `qbo:<Id>` (mirrors the `xero:` convention). */
export function extractQboCustomerId(tags: string): string | undefined {
  const match = tags
    .split(',')
    .map((t) => t.trim())
    .find((t) => t.startsWith('qbo:'));
  return match ? match.replace(/^qbo:/, '') : undefined;
}

export async function resolveOrCreateQboCustomer(
  session: QuickBooksSession,
  client: { name: string; contactEmail: string; tags: string }
): Promise<string> {
  const linked = extractQboCustomerId(client.tags);
  if (linked) return linked;

  const email = client.contactEmail?.trim().toLowerCase();
  const name = client.name?.trim();

  if (email) {
    const byEmail = await findCustomerByEmail(session, email);
    if (byEmail?.Id) return byEmail.Id;
  }
  if (name) {
    const byName = await findCustomerByName(session, name);
    if (byName?.Id) return byName.Id;
  }

  const created = await createCustomer(session, {
    displayName: name || email || 'Engage Client',
    email: email || undefined,
  });
  return created.Id!;
}

export interface QuickBooksProposalPushResult {
  proposalId: string;
  reference: string;
  customerId?: string;
  invoiceId?: string;
  linesPushed: number;
  warnings: string[];
  /** True when a prior successful push was found and no new invoice was created */
  skipped?: boolean;
}

/**
 * Create an unpaid QBO invoice from the proposal's recurring lines.
 * Skips when a QBO_PROPOSAL_PUSHED record exists unless force is set.
 */
export async function pushProposalToQuickBooks(
  tenantId: string,
  proposalId: string,
  options?: { force?: boolean }
): Promise<QuickBooksProposalPushResult> {
  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, tenantId },
    include: {
      client: true,
      services: { orderBy: { sortOrder: 'asc' } },
    },
  });

  if (!proposal) {
    throw new Error('Proposal not found');
  }
  if (proposal.status !== 'ACCEPTED') {
    throw new Error('Only accepted proposals can be pushed to QuickBooks');
  }

  if (!options?.force) {
    const prior = await prisma.activityLog.findFirst({
      where: { tenantId, proposalId, action: QBO_PROPOSAL_PUSHED_ACTION },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, metadata: true },
    });
    if (prior) {
      let invoiceId: string | undefined;
      try {
        invoiceId = JSON.parse(prior.metadata || '{}').invoiceId;
      } catch {
        // malformed metadata — treat as a bare success record
      }
      return {
        proposalId,
        reference: proposal.reference,
        invoiceId,
        linesPushed: 0,
        skipped: true,
        warnings: [
          `Already pushed to QuickBooks on ${prior.createdAt.toISOString()} — skipped (use force to re-push).`,
        ],
      };
    }
  }

  const recurring = proposal.services.filter((s) => s.billingFrequency !== 'ONE_TIME');
  if (recurring.length === 0) {
    throw new Error('No recurring service lines to push to QuickBooks');
  }

  const session = await getAuthenticatedQuickBooksSession(tenantId);
  const warnings: string[] = [];

  const customerId = await resolveOrCreateQboCustomer(session, proposal.client);

  const invoice = await createInvoice(session, {
    customerId,
    docNumber: proposal.reference,
    privateNote: `Engage proposal ${proposal.reference} — ${proposal.title}`,
    lines: recurring.map((s) => ({
      description: `${s.name} (${s.billingFrequency})`,
      amount: (s.grossTotalPence ?? Math.round(s.grossTotal * 100)) / 100,
    })),
  });

  const oneTime = proposal.services.length - recurring.length;
  if (oneTime > 0) {
    warnings.push(
      `${oneTime} one-off service line(s) were not included — raise these separately in QuickBooks.`
    );
  }

  try {
    await prisma.activityLog.create({
      data: {
        tenantId,
        action: QBO_PROPOSAL_PUSHED_ACTION,
        entityType: 'PROPOSAL',
        entityId: proposalId,
        proposalId,
        description: `Pushed proposal ${proposal.reference} to QuickBooks`,
        metadata: JSON.stringify({
          proposalId,
          invoiceId: invoice.Id,
          customerId,
          linesPushed: recurring.length,
        }),
      },
    });
  } catch (logErr) {
    logger.warn('Failed to record QuickBooks push activity', logErr);
  }

  try {
    const settings = await getTenantQuickBooksSettings(tenantId);
    if (settings) {
      await saveTenantQuickBooksSettings(tenantId, {
        ...settings,
        lastPushAt: new Date().toISOString(),
      });
    }
  } catch (saveErr) {
    logger.warn('Failed to update QuickBooks lastPushAt', saveErr);
  }

  return {
    proposalId,
    reference: proposal.reference,
    customerId,
    invoiceId: invoice.Id,
    linesPushed: recurring.length,
    warnings,
  };
}
