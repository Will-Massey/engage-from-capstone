/**
 * Proposal Sharing, Tracking, and e-Signature Service
 * UK compliant proposal viewing and electronic signature handling
 */

import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../config/database.js';
import { getApiUrl, getFrontendUrl, tenantAppUrl } from '../config/urls.js';
import logger from '../config/logger.js';
import { saveSignaturePng, readSignature } from './fileStorage.js';
import { calculateRenewalDate } from '../jobs/renewalReminders.js';
import {
  parseProposalCustomFields,
  serializeProposalCustomFields,
  mergeProposalCustomFields,
  getRequiredSigners,
  hasPricingTiers,
  findPricingTier,
  calculateTierTotals,
} from '../utils/proposalCustomFields.js';

// Generate unique share token
export function generateShareToken(): string {
  return uuidv4().replace(/-/g, '').substring(0, 32);
}

// Create shareable proposal link
export async function createShareableLink(
  proposalId: string,
  expiryDays: number = 30,
  tenantSubdomain: string
): Promise<{ token: string; shareUrl: string; expiresAt: Date }> {
  try {
    const token = generateShareToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiryDays);

    await prisma.proposal.update({
      where: { id: proposalId },
      data: {
        shareToken: token,
        shareTokenExpiry: expiresAt,
        publicAccessEnabled: true,
      },
    });

    const baseUrl = (process.env.PUBLIC_PROPOSAL_URL || tenantAppUrl(tenantSubdomain)).replace(
      /\/$/,
      ''
    );
    const shareUrl = `${baseUrl}/proposals/view/${token}`;

    logger.info(`Created shareable link for proposal ${proposalId}`);

    return { token, shareUrl, expiresAt };
  } catch (error) {
    logger.error('Failed to create shareable link:', error);
    throw error;
  }
}

// Revoke shareable link
export async function revokeShareableLink(proposalId: string): Promise<void> {
  try {
    await prisma.proposal.update({
      where: { id: proposalId },
      data: {
        shareToken: null,
        shareTokenExpiry: null,
        publicAccessEnabled: false,
      },
    });

    logger.info(`Revoked shareable link for proposal ${proposalId}`);
  } catch (error) {
    logger.error('Failed to revoke shareable link:', error);
    throw error;
  }
}

// Get proposal by share token
export async function getProposalByShareToken(token: string) {
  try {
    const proposal = await prisma.proposal.findFirst({
      where: {
        shareToken: token,
        publicAccessEnabled: true,
        shareTokenExpiry: {
          gt: new Date(),
        },
      },
      include: {
        client: true,
        createdBy: {
          select: {
            firstName: true,
            lastName: true,
            jobTitle: true,
          },
        },
        tenant: {
          select: {
            id: true,
            name: true,
            primaryColor: true,
            logo: true,
            settings: true,
          },
        },
        services: {
          include: {
            serviceTemplate: true,
          },
        },
      },
    });

    return proposal;
  } catch (error) {
    logger.error('Failed to get proposal by share token:', error);
    return null;
  }
}

// Track proposal view
export async function trackProposalView(
  proposalId: string,
  ipAddress: string | null,
  userAgent: string | null,
  userId?: string
): Promise<void> {
  try {
    await prisma.proposalView.create({
      data: {
        proposalId,
        ipAddress,
        userAgent,
        viewedAt: new Date(),
        ...(userId ? { viewerId: userId } : {}),
      },
    });

    // Update proposal viewedAt and status if first view
    const proposal = await prisma.proposal.findUnique({
      where: { id: proposalId },
      select: { status: true, viewedAt: true },
    });

    if (proposal && !proposal.viewedAt) {
      const viewedAt = new Date();
      await prisma.proposal.update({
        where: { id: proposalId },
        data: {
          viewedAt,
          ...(proposal.status === 'SENT' ? { status: 'VIEWED' as const } : {}),
        },
      });

      try {
        const full = await prisma.proposal.findUnique({
          where: { id: proposalId },
          select: { tenantId: true },
        });
        if (full?.tenantId) {
          const { emitIntegrationEvent } = await import('./integrationEvents.js');
          void emitIntegrationEvent(full.tenantId, proposalId, 'proposal.viewed', {
            extra: { viewedAt: viewedAt.toISOString() },
          });
        }
      } catch (e) {
        logger.warn('Integration event emit failed on first view', e);
      }
    } else {
      await prisma.proposal.update({
        where: { id: proposalId },
        data: {
          viewedAt: new Date(),
        },
      });
    }

    logger.info(`Tracked view for proposal ${proposalId}`);
  } catch (error) {
    logger.error('Failed to track proposal view:', error);
  }
}

// Get proposal view statistics
export async function getProposalViewStats(proposalId: string) {
  try {
    const [viewCount, uniqueViews, lastView] = await Promise.all([
      prisma.proposalView.count({
        where: { proposalId },
      }),
      prisma.proposalView.groupBy({
        by: ['ipAddress'],
        where: { proposalId },
      }),
      prisma.proposalView.findFirst({
        where: { proposalId },
        orderBy: { viewedAt: 'desc' },
      }),
    ]);

    return {
      totalViews: viewCount,
      uniqueViews: uniqueViews.length,
      lastViewedAt: lastView?.viewedAt,
      firstViewedAt: await prisma.proposalView
        .findFirst({
          where: { proposalId },
          orderBy: { viewedAt: 'asc' },
        })
        .then((v) => v?.viewedAt),
    };
  } catch (error) {
    logger.error('Failed to get proposal view stats:', error);
    return null;
  }
}

// Electronic Signature Interface
export interface ElectronicSignatureData {
  proposalId: string;
  signedBy: string;
  signedByRole: string;
  signerEmail?: string | null;
  signatureData: string;
  ipAddress: string | null;
  userAgent: string | null;
  deviceInfo: string | null;
  geoLocation: string | null;
  documentHash?: string | null;
  termsHash?: string | null;
  consentText?: string | null;
  signatureType?: string;
  agreementVersion: string;
  tenantId: string;
  userId?: string | null;
  /** Client-selected package tier (Good / Better / Best) */
  selectedTierId?: string | null;
}

export interface ElectronicSignatureResult {
  success: boolean;
  error?: string;
  signatureId?: string;
  /** True when more signatories are still required */
  pendingAdditionalSigner?: boolean;
  signaturesReceived?: number;
  requiredSigners?: number;
  fullyAccepted?: boolean;
}

// Record electronic signature (supports multi-signer + tiered pricing)
export async function recordElectronicSignature(
  data: ElectronicSignatureData
): Promise<ElectronicSignatureResult> {
  try {
    if (!data.signatureData || data.signatureData.length < 100) {
      return { success: false, error: 'Invalid signature data' };
    }

    const proposalMeta = await prisma.proposal.findUnique({
      where: { id: data.proposalId },
      select: {
        contractStartDate: true,
        clientId: true,
        customFields: true,
        subtotal: true,
        vatAmount: true,
        total: true,
        status: true,
        _count: { select: { signatures: true } },
      },
    });

    if (!proposalMeta) {
      return { success: false, error: 'Proposal not found' };
    }

    if (proposalMeta.status === 'ACCEPTED') {
      return { success: false, error: 'Proposal already accepted' };
    }

    const customFields = parseProposalCustomFields(proposalMeta.customFields);
    const requiredSigners = getRequiredSigners(customFields);
    const existingCount = proposalMeta._count.signatures;

    if (existingCount >= requiredSigners) {
      return { success: false, error: 'All required signatures have already been collected' };
    }

    const isFirstSigner = existingCount === 0;
    const tierIdForAccept = data.selectedTierId || customFields.selectedTierId || null;

    if (isFirstSigner && hasPricingTiers(customFields) && !tierIdForAccept) {
      return { success: false, error: 'Please select a package before signing' };
    }

    const signatureFilePath = await saveSignaturePng(
      data.tenantId,
      data.proposalId,
      data.signatureData
    );

    const renewalAnchor = proposalMeta.contractStartDate || new Date();

    const signature = await prisma.proposalSignature.create({
      data: {
        proposalId: data.proposalId,
        signedBy: data.signedBy,
        signedByRole: data.signedByRole,
        signerEmail: data.signerEmail || null,
        signatureData: data.signatureData,
        signatureFilePath: signatureFilePath,
        signedAt: new Date(),
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        deviceInfo: data.deviceInfo,
        geoLocation: data.geoLocation,
        documentHash: data.documentHash || null,
        termsHash: data.termsHash || null,
        consentText: data.consentText || null,
        signatureType: data.signatureType || 'SIMPLE_ELECTRONIC',
        agreementVersion: data.agreementVersion,
        agreementAccepted: true,
      },
    });

    const signaturesReceived = existingCount + 1;
    const pendingAdditionalSigner = signaturesReceived < requiredSigners;

    let customFieldsPatch = mergeProposalCustomFields(customFields, {
      signaturesReceived,
    });

    if (isFirstSigner && tierIdForAccept) {
      const tier = findPricingTier(customFields, tierIdForAccept);
      customFieldsPatch = mergeProposalCustomFields(customFieldsPatch, {
        selectedTierId: tierIdForAccept,
        selectedTierLabel: tier?.label,
      });
    }

    if (pendingAdditionalSigner) {
      await prisma.proposal.update({
        where: { id: data.proposalId },
        data: {
          customFields: serializeProposalCustomFields(customFieldsPatch),
          termsAccepted: true,
          termsAcceptedAt: new Date(),
        },
      });

      await prisma.activityLog.create({
        data: {
          tenantId: data.tenantId,
          userId: data.userId || undefined,
          action: 'PROPOSAL_SIGNED',
          entityType: 'PROPOSAL',
          entityId: data.proposalId,
          description: `Partial signature recorded by ${data.signedBy} (${signaturesReceived}/${requiredSigners})`,
          metadata: JSON.stringify({
            signatureId: signature.id,
            signaturesReceived,
            requiredSigners,
          }),
        },
      });

      logger.info(
        `Partial signature ${signaturesReceived}/${requiredSigners} for proposal ${data.proposalId}`
      );

      return {
        success: true,
        signatureId: signature.id,
        pendingAdditionalSigner: true,
        signaturesReceived,
        requiredSigners,
        fullyAccepted: false,
      };
    }

    // All signers complete — finalise acceptance
    const selectedTier = tierIdForAccept
      ? findPricingTier(customFields, tierIdForAccept)
      : undefined;
    const tierTotals =
      selectedTier &&
      calculateTierTotals(
        {
          subtotal: proposalMeta.subtotal,
          vatAmount: proposalMeta.vatAmount,
          total: proposalMeta.total,
        },
        selectedTier
      );

    const finalCustomFields = mergeProposalCustomFields(customFieldsPatch, {
      signaturesReceived,
    });

    await prisma.proposal.update({
      where: { id: data.proposalId },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
        acceptedBy: data.signedBy,
        acceptedByIp: data.ipAddress,
        signatoryPosition: data.signedByRole,
        signature: data.signatureData,
        termsAccepted: true,
        termsAcceptedAt: new Date(),
        renewalDate: calculateRenewalDate(renewalAnchor),
        renewalReminderSent: false,
        renewalReminderSentAt: null,
        customFields: serializeProposalCustomFields(finalCustomFields),
        ...(tierTotals
          ? {
              subtotal: tierTotals.subtotal,
              vatAmount: tierTotals.vatAmount,
              total: tierTotals.total,
            }
          : {}),
      },
    });

    try {
      if (proposalMeta.clientId) {
        const { triggerProposalAccepted } = await import('../jobs/touchpointEngine.js');
        await triggerProposalAccepted(proposalMeta.clientId, data.tenantId);
      }
    } catch (e) {
      logger.warn('Failed to trigger touchpoint workflow on proposal acceptance', e);
    }

    // Clara post-sign onboarding checklist (stored on proposal customFields + activity log)
    try {
      const { generateAndStoreOnboardingChecklist } =
        await import('./onboardingChecklistService.js');
      await generateAndStoreOnboardingChecklist(data.proposalId, data.tenantId);
    } catch (e) {
      logger.warn('Failed to generate post-sign onboarding checklist', e);
    }

    await prisma.activityLog.create({
      data: {
        tenantId: data.tenantId,
        userId: data.userId || undefined,
        action: 'PROPOSAL_SIGNED',
        entityType: 'PROPOSAL',
        entityId: data.proposalId,
        description: `Proposal signed electronically by ${data.signedBy}`,
        metadata: JSON.stringify({
          signatureId: signature.id,
          documentHash: data.documentHash,
          ipAddress: data.ipAddress,
          selectedTierId: tierIdForAccept,
        }),
      },
    });

    logger.info(`Electronic signature recorded for proposal ${data.proposalId}`);

    try {
      const { emitIntegrationEvent } = await import('./integrationEvents.js');
      void emitIntegrationEvent(data.tenantId, data.proposalId, 'proposal.accepted', {
        extra: {
          signedAt: new Date().toISOString(),
          signedBy: data.signedBy,
          acceptedAt: new Date().toISOString(),
          acceptedBy: data.signedBy,
          ...(tierIdForAccept ? { selectedTierId: tierIdForAccept } : {}),
        } as Record<string, string>,
      });
    } catch (e) {
      logger.warn('Integration event emit failed on signature', e);
    }

    return {
      success: true,
      signatureId: signature.id,
      pendingAdditionalSigner: false,
      signaturesReceived,
      requiredSigners,
      fullyAccepted: true,
    };
  } catch (error: any) {
    logger.error('Failed to record electronic signature:', error);
    return { success: false, error: error.message };
  }
}

// Get signatures for a proposal
export async function getProposalSignatures(proposalId: string) {
  try {
    const signatures = await prisma.proposalSignature.findMany({
      where: { proposalId },
      orderBy: { signedAt: 'desc' },
      select: {
        id: true,
        signedBy: true,
        signedByRole: true,
        signerEmail: true,
        signedAt: true,
        ipAddress: true,
        userAgent: true,
        deviceInfo: true,
        geoLocation: true,
        documentHash: true,
        termsHash: true,
        consentText: true,
        signatureType: true,
        agreementVersion: true,
        agreementAccepted: true,
      },
    });

    return signatures;
  } catch (error) {
    logger.error('Failed to get proposal signatures:', error);
    return [];
  }
}

/** Tenant-scoped forensic audit record for a single electronic signature. */
export async function getSignatureAuditRecord(
  proposalId: string,
  signatureId: string,
  tenantId: string
) {
  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, tenantId },
    select: {
      id: true,
      reference: true,
      title: true,
      status: true,
      acceptedAt: true,
      acceptedBy: true,
    },
  });

  if (!proposal) {
    return null;
  }

  const signature = await prisma.proposalSignature.findFirst({
    where: { id: signatureId, proposalId },
    select: {
      id: true,
      signedBy: true,
      signedByRole: true,
      signerEmail: true,
      signedAt: true,
      ipAddress: true,
      userAgent: true,
      deviceInfo: true,
      geoLocation: true,
      documentHash: true,
      termsHash: true,
      consentText: true,
      signatureType: true,
      agreementVersion: true,
      agreementAccepted: true,
    },
  });

  if (!signature) {
    return null;
  }

  return {
    auditSchemaVersion: '1.0',
    exportedAt: new Date().toISOString(),
    proposal: {
      id: proposal.id,
      reference: proposal.reference,
      title: proposal.title,
      status: proposal.status,
      acceptedAt: proposal.acceptedAt,
      acceptedBy: proposal.acceptedBy,
    },
    signature,
  };
}

// Get signature image (tenant-scoped — prevents cross-tenant IDOR)
export async function getSignatureImage(
  signatureId: string,
  tenantId: string
): Promise<string | null> {
  try {
    const signature = await prisma.proposalSignature.findFirst({
      where: {
        id: signatureId,
        proposal: { tenantId },
      },
      select: { signatureData: true, signatureFilePath: true },
    });

    if (!signature) return null;

    // Prefer file-based storage if available
    if (signature.signatureFilePath) {
      return readSignature(signature.signatureFilePath);
    }

    // Fall back to base64 data
    return signature.signatureData;
  } catch (error) {
    logger.error('Failed to get signature image:', error);
    return null;
  }
}

// UK Compliance Audit Trail
export interface ComplianceAuditEntry {
  timestamp: Date;
  action: string;
  actor: string;
  ipAddress: string | null;
  userAgent: string | null;
  details: Record<string, any>;
}

// Generate compliance audit trail for a proposal
export async function generateComplianceAuditTrail(
  proposalId: string
): Promise<ComplianceAuditEntry[]> {
  const auditTrail: ComplianceAuditEntry[] = [];

  try {
    // Get proposal with related data
    const proposal = await prisma.proposal.findUnique({
      where: { id: proposalId },
      include: {
        views: {
          orderBy: { viewedAt: 'asc' },
        },
        signatures: {
          orderBy: { signedAt: 'asc' },
        },
        activityLogs: {
          where: {
            action: {
              in: ['PROPOSAL_CREATED', 'PROPOSAL_SENT', 'PROPOSAL_VIEWED', 'PROPOSAL_ACCEPTED'],
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!proposal) return auditTrail;

    // Proposal creation
    auditTrail.push({
      timestamp: proposal.createdAt,
      action: 'PROPOSAL_CREATED',
      actor: proposal.createdById,
      ipAddress: null,
      userAgent: null,
      details: {
        reference: proposal.reference,
        title: proposal.title,
      },
    });

    // Proposal sent
    if (proposal.sentAt) {
      auditTrail.push({
        timestamp: proposal.sentAt,
        action: 'PROPOSAL_SENT',
        actor: proposal.createdById,
        ipAddress: null,
        userAgent: null,
        details: {
          emailHistory: proposal.emailHistory,
        },
      });
    }

    // Proposal views
    proposal.views.forEach((view) => {
      auditTrail.push({
        timestamp: view.viewedAt,
        action: 'PROPOSAL_VIEWED',
        actor: 'CLIENT',
        ipAddress: view.ipAddress,
        userAgent: view.userAgent,
        details: {
          viewDuration: view.viewDuration,
          completed: view.completed,
        },
      });
    });

    // Electronic signatures
    proposal.signatures.forEach((sig) => {
      auditTrail.push({
        timestamp: sig.signedAt,
        action: 'PROPOSAL_ACCEPTED',
        actor: sig.signedBy,
        ipAddress: sig.ipAddress,
        userAgent: null,
        details: {
          signedByRole: sig.signedByRole,
          agreementVersion: sig.agreementVersion,
          agreementAccepted: sig.agreementAccepted,
          signatureId: sig.id,
        },
      });
    });

    // Sort by timestamp
    return auditTrail.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  } catch (error) {
    logger.error('Failed to generate compliance audit trail:', error);
    return auditTrail;
  }
}

// Validate share token
export function isShareTokenValid(
  proposal: {
    shareToken: string | null;
    shareTokenExpiry: Date | null;
    publicAccessEnabled: boolean;
  },
  token: string
): { valid: boolean; reason?: string } {
  if (!proposal.publicAccessEnabled) {
    return { valid: false, reason: 'Public access disabled' };
  }

  if (proposal.shareToken !== token) {
    return { valid: false, reason: 'Invalid token' };
  }

  if (!proposal.shareTokenExpiry || new Date() > proposal.shareTokenExpiry) {
    return { valid: false, reason: 'Link expired' };
  }

  return { valid: true };
}

// Generate proposal PDF URL for sharing
export function generateProposalPdfUrl(token: string, tenantSubdomain: string): string {
  const baseUrl = process.env.PUBLIC_PROPOSAL_URL || getApiUrl();
  return `${baseUrl}/api/proposals/view/${token}/pdf`;
}

export default {
  generateShareToken,
  createShareableLink,
  revokeShareableLink,
  getProposalByShareToken,
  trackProposalView,
  getProposalViewStats,
  recordElectronicSignature,
  getProposalSignatures,
  getSignatureAuditRecord,
  getSignatureImage,
  generateComplianceAuditTrail,
  isShareTokenValid,
  generateProposalPdfUrl,
};

// ==================== CLIENT PORTAL ====================

// Generate client portal token
export function generatePortalToken(): string {
  return uuidv4().replace(/-/g, '').substring(0, 32);
}

// Create or refresh client portal link
export async function createClientPortalLink(
  clientId: string,
  expiryDays: number = 90,
  frontendOrigin?: string
): Promise<{ token: string; portalUrl: string; expiresAt: Date }> {
  const token = generatePortalToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiryDays);

  await prisma.client.update({
    where: { id: clientId },
    data: {
      portalToken: token,
      portalTokenExpiry: expiresAt,
      portalEnabled: true,
    },
  });

  const base = frontendOrigin?.replace(/\/$/, '') || getFrontendUrl();
  const portalUrl = `${base}/portal/${token}`;
  return { token, portalUrl, expiresAt };
}

// Revoke client portal link
export async function revokeClientPortalLink(clientId: string): Promise<void> {
  await prisma.client.update({
    where: { id: clientId },
    data: {
      portalToken: null,
      portalTokenExpiry: null,
      portalEnabled: false,
    },
  });
}

// Get client by portal token
export async function getClientByPortalToken(token: string) {
  try {
    const client = await prisma.client.findFirst({
      where: {
        portalToken: token,
        portalEnabled: true,
        portalTokenExpiry: {
          gt: new Date(),
        },
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            primaryColor: true,
            logo: true,
            settings: true,
          },
        },
      },
    });

    return client;
  } catch (error) {
    logger.error('Failed to get client by portal token:', error);
    return null;
  }
}

// Get all proposals for a client (portal view)
export async function getClientProposalsForPortal(clientId: string) {
  try {
    const proposals = await prisma.proposal.findMany({
      where: {
        clientId,
        status: {
          in: ['SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED'],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        reference: true,
        title: true,
        status: true,
        total: true,
        subtotal: true,
        vatAmount: true,
        discountAmount: true,
        validUntil: true,
        sentAt: true,
        viewedAt: true,
        acceptedAt: true,
        declinedAt: true,
        shareToken: true,
        shareTokenExpiry: true,
        publicAccessEnabled: true,
        createdAt: true,
        services: {
          select: {
            id: true,
            name: true,
            description: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
            vatRate: true,
            vatAmount: true,
            grossTotal: true,
            billingFrequency: true,
            priceDisplayMode: true,
          },
        },
      },
    });

    return proposals;
  } catch (error) {
    logger.error('Failed to get client proposals for portal:', error);
    return [];
  }
}
