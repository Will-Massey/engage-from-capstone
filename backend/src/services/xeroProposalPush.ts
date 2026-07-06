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

export interface XeroProposalPushResult {
  mode: 'live' | 'stub';
  proposalId: string;
  reference: string;
  xero: Awaited<ReturnType<typeof pushAcceptedProposalToXero>>;
  warnings: string[];
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
  sessionOverride?: XeroSession
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

  let session = sessionOverride;
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

  try {
    const result = await pushAcceptedProposalToXero(session, payload);

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
 */
export async function triggerXeroPushOnAcceptance(
  tenantId: string,
  proposalId: string
): Promise<void> {
  try {
    const result = await pushProposalToXero(tenantId, proposalId);
    if (result.warnings.length) {
      logger.warn(`Xero push warnings for proposal ${proposalId}:`, result.warnings);
    } else {
      logger.info(`Xero push completed for proposal ${proposalId} (${result.mode})`);
    }
  } catch (err) {
    logger.warn(`Xero push skipped after acceptance for proposal ${proposalId}:`, err);
  }
}
