/**
 * Proposal Sharing, Tracking, and e-Signature Service
 * UK compliant proposal viewing and electronic signature handling
 */

import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../config/database.js';
import logger from '../config/logger.js';

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

    const baseUrl = process.env.PUBLIC_PROPOSAL_URL || `https://${tenantSubdomain}.engage.capstone.co.uk`;
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
  userAgent: string | null
): Promise<void> {
  try {
    await prisma.proposalView.create({
      data: {
        proposalId,
        ipAddress,
        userAgent,
        viewedAt: new Date(),
      },
    });

    // Update proposal viewedAt and status if first view
    const proposal = await prisma.proposal.findUnique({
      where: { id: proposalId },
      select: { status: true, viewedAt: true },
    });

    if (proposal && !proposal.viewedAt) {
      await prisma.proposal.update({
        where: { id: proposalId },
        data: {
          viewedAt: new Date(),
          status: 'VIEWED',
        },
      });
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
  signatureData: string; // Base64 encoded
  ipAddress: string | null;
  agreementVersion: string;
}

// Record electronic signature
export async function recordElectronicSignature(
  data: ElectronicSignatureData
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate signature data
    if (!data.signatureData || data.signatureData.length < 100) {
      return { success: false, error: 'Invalid signature data' };
    }

    // Create signature record
    await prisma.proposalSignature.create({
      data: {
        proposalId: data.proposalId,
        signedBy: data.signedBy,
        signedByRole: data.signedByRole,
        signatureData: data.signatureData,
        signedAt: new Date(),
        ipAddress: data.ipAddress,
        agreementVersion: data.agreementVersion,
        agreementAccepted: true,
      },
    });

    // Update proposal status
    await prisma.proposal.update({
      where: { id: data.proposalId },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
        acceptedBy: data.signedBy,
        acceptedByIp: data.ipAddress,
        termsAccepted: true,
        termsAcceptedAt: new Date(),
      },
    });

    logger.info(`Electronic signature recorded for proposal ${data.proposalId}`);

    return { success: true };
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
        signedAt: true,
        ipAddress: true,
        agreementVersion: true,
        agreementAccepted: true,
        // Exclude signatureData for list view (too large)
      },
    });

    return signatures;
  } catch (error) {
    logger.error('Failed to get proposal signatures:', error);
    return [];
  }
}

// Get signature image
export async function getSignatureImage(signatureId: string) {
  try {
    const signature = await prisma.proposalSignature.findUnique({
      where: { id: signatureId },
      select: { signatureData: true },
    });

    return signature?.signatureData || null;
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
  const baseUrl = process.env.PUBLIC_PROPOSAL_URL || `https://${tenantSubdomain}.engage.capstone.co.uk`;
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
  getSignatureImage,
  generateComplianceAuditTrail,
  isShareTokenValid,
  generateProposalPdfUrl,
};
