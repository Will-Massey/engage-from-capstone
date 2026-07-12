/**
 * Push accepted proposals to Xero — contact sync + repeating invoices (W1.2)
 */

import { prisma } from '../config/database.js';
import logger from '../config/logger.js';
import {
  getTenantXeroSettings,
  saveTenantXeroSettings,
  isXeroOAuthConfigured,
} from './tenantXeroSettings.js';
import {
  getAuthenticatedXeroSession,
  pushAcceptedProposalToXero,
  type XeroSession,
} from './xeroService.js';

export const XERO_PROPOSAL_PUSHED_ACTION = 'XERO_PROPOSAL_PUSHED';

export interface XeroProposalPushResult {
  mode: 'live' | 'stub';
  proposalId: string;
  reference: string;
  xero: Awaited<ReturnType<typeof pushAcceptedProposalToXero>>;
  warnings: string[];
  /** True when a prior successful push was found and no new artifacts were created */
  skipped?: boolean;
}

export interface XeroProposalPushOptions {
  /** Re-push even when a prior successful push record exists */
  force?: boolean;
  sessionOverride?: XeroSession;
}

/** Prior successful push record for a proposal, or null (ActivityLog-based idempotency). */
async function findPriorPushRecord(tenantId: string, proposalId: string) {
  const record = await prisma.activityLog.findFirst({
    where: { tenantId, proposalId, action: XERO_PROPOSAL_PUSHED_ACTION },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, metadata: true },
  });
  if (!record) return null;
  let repeatingInvoiceIds: string[] = [];
  try {
    const meta = JSON.parse(record.metadata || '{}');
    if (Array.isArray(meta.repeatingInvoiceIds)) repeatingInvoiceIds = meta.repeatingInvoiceIds;
  } catch {
    // malformed metadata — treat as a bare success record
  }
  return { createdAt: record.createdAt, repeatingInvoiceIds };
}

function buildProposalPayload(proposal: {
  reference: string;
  title: string;
  acceptedAt: Date | null;
  total: number;
  subtotal: number;
  vatAmount: number;
  paymentFrequency: string;
  client: {
    name: string;
    contactEmail: string;
    contactName: string | null;
    tags: string;
  };
  services: Array<{
    name: string;
    displayPrice: number;
    billingFrequency: string;
    lineTotal: number;
    vatAmount: number;
  }>;
}) {
  return {
    reference: proposal.reference,
    title: proposal.title,
    acceptedAt: proposal.acceptedAt,
    total: proposal.total,
    subtotal: proposal.subtotal,
    vatAmount: proposal.vatAmount,
    paymentFrequency: proposal.paymentFrequency,
    client: {
      name: proposal.client.name,
      contactEmail: proposal.client.contactEmail,
      contactName: proposal.client.contactName,
      xeroContactId: extractXeroContactId(proposal.client.tags),
    },
    services: proposal.services.map((s) => ({
      name: s.name,
      displayPrice: s.displayPrice,
      billingFrequency: s.billingFrequency,
      lineTotal: s.lineTotal,
      vatAmount: s.vatAmount,
    })),
  };
}

function extractXeroContactId(tags: string): string | undefined {
  const match = tags
    .split(',')
    .map((t) => t.trim())
    .find((t) => t.startsWith('xero:'));
  return match ? match.replace(/^xero:/, '') : undefined;
}

/**
 * Push an accepted proposal to Xero.
 * Returns stub payload when Xero OAuth is not configured or tenant is not connected.
 */
export async function pushProposalToXero(
  tenantId: string,
  proposalId: string,
  options?: XeroProposalPushOptions
): Promise<XeroProposalPushResult> {
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
    throw new Error('Only accepted proposals can be pushed to Xero');
  }

  // Idempotency (no schema changes): a XERO_PROPOSAL_PUSHED activity record
  // marks a prior successful push — skip unless the caller forces a re-push.
  if (!options?.force) {
    const prior = await findPriorPushRecord(tenantId, proposalId);
    if (prior) {
      return {
        mode: 'live',
        proposalId,
        reference: proposal.reference,
        skipped: true,
        xero: {
          contactNote: { implemented: true, updated: false },
          repeatingInvoice: {
            implemented: true,
            stub: false,
            created: 0,
            repeatingInvoiceIds: prior.repeatingInvoiceIds,
            drafts: [],
            errors: [],
            message: `Already pushed to Xero on ${prior.createdAt.toISOString()} — skipped (use force to re-push).`,
          },
        },
        warnings: [],
      };
    }
  }

  const payload = buildProposalPayload(proposal);
  const warnings: string[] = [];

  if (!isXeroOAuthConfigured()) {
    const stub = await pushAcceptedProposalToXero(null, payload);
    return {
      mode: 'stub',
      proposalId,
      reference: proposal.reference,
      xero: stub,
      warnings: ['Xero OAuth is not configured on the server. A draft payload was returned only.'],
    };
  }

  const settings = await getTenantXeroSettings(tenantId);
  if (!settings?.connected) {
    const stub = await pushAcceptedProposalToXero(null, payload);
    return {
      mode: 'stub',
      proposalId,
      reference: proposal.reference,
      xero: stub,
      warnings: [
        'Xero is not connected for this practice. Connect Xero in Settings → Integrations.',
      ],
    };
  }

  let session = options?.sessionOverride;
  if (!session) {
    try {
      session = await getAuthenticatedXeroSession(tenantId);
    } catch (err) {
      logger.warn('Xero session unavailable for proposal push', err);
      const stub = await pushAcceptedProposalToXero(null, payload);
      return {
        mode: 'stub',
        proposalId,
        reference: proposal.reference,
        xero: stub,
        warnings: ['Could not establish a Xero session. Please reconnect Xero and try again.'],
      };
    }
  }

  // paid_invoices mode never creates repeating invoices (Stripe payments are
  // mirrored as they land instead — avoids double-billing in Xero).
  const skipRepeatingInvoices = settings.xeroSyncMode === 'paid_invoices';

  try {
    const result = await pushAcceptedProposalToXero(session, payload, { skipRepeatingInvoices });

    if (!result.contactNote.updated) {
      warnings.push('Contact note was not written to Xero — check contact matching.');
    }
    if (result.repeatingInvoice.errors?.length) {
      warnings.push(...result.repeatingInvoice.errors);
    }

    await saveTenantXeroSettings(tenantId, {
      ...settings,
      lastPushAt: new Date().toISOString(),
    });

    // Success record — the idempotency marker for future pushes.
    const succeeded =
      result.repeatingInvoice.created > 0 || (skipRepeatingInvoices && result.contactNote.updated);
    if (succeeded) {
      try {
        await prisma.activityLog.create({
          data: {
            tenantId,
            action: XERO_PROPOSAL_PUSHED_ACTION,
            entityType: 'PROPOSAL',
            entityId: proposalId,
            proposalId,
            description: `Pushed proposal ${proposal.reference} to Xero`,
            metadata: JSON.stringify({
              proposalId,
              repeatingInvoiceIds: result.repeatingInvoice.repeatingInvoiceIds,
              contactId: result.contactNote.contactId,
              syncMode: skipRepeatingInvoices ? 'paid_invoices' : 'repeating_draft',
            }),
          },
        });
      } catch (logErr) {
        logger.warn('Failed to record Xero push activity', logErr);
      }
    }

    return {
      mode: 'live',
      proposalId,
      reference: proposal.reference,
      xero: result,
      warnings,
    };
  } catch (err) {
    logger.error('Xero proposal push failed', err);
    const message = err instanceof Error ? err.message : 'Unknown Xero error';
    throw new Error(`Xero push failed: ${message}`);
  }
}

/**
 * Fire-and-forget hook after proposal acceptance — never throws to caller.
 * Only pushes when Xero OAuth is configured, the tenant is connected, and
 * auto-push is enabled (autoPushOnAcceptance, default true).
 */
export async function triggerXeroPushOnAcceptance(
  tenantId: string,
  proposalId: string
): Promise<void> {
  try {
    if (!isXeroOAuthConfigured()) return;
    const settings = await getTenantXeroSettings(tenantId);
    if (!settings?.connected || settings.autoPushOnAcceptance === false) return;

    const result = await pushProposalToXero(tenantId, proposalId);
    if (result.skipped) {
      logger.info(`Xero push skipped for proposal ${proposalId} — already pushed`);
    } else if (result.warnings.length) {
      logger.warn(`Xero push warnings for proposal ${proposalId}:`, result.warnings);
    } else {
      logger.info(`Xero push completed for proposal ${proposalId} (${result.mode})`);
    }
  } catch (err) {
    logger.warn(`Xero push skipped after acceptance for proposal ${proposalId}:`, err);
  }
}
