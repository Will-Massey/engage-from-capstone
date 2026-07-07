/**
 * Tenant-scoped share management, tracking, and signature audit routes
 * (authenticated /:id routes)
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { tenantAppUrl } from '../../config/urls.js';
import { asyncHandler, ApiError } from '../../middleware/errorHandler.js';
import { authenticate } from '../../middleware/auth.js';
import { requireActiveSubscriptionOrTrial } from '../../middleware/tierLimits.js';
import {
  createShareableLink,
  revokeShareableLink,
  getProposalViewStats,
  getProposalSignatures,
  getSignatureAuditRecord,
  generateComplianceAuditTrail,
  generateProposalPdfUrl,
} from '../../services/proposalSharingService.js';
import { tenantMailer } from '../../services/tenantMailer.js';
import PDFGenerator from '../../services/pdfGenerator.js';

const router = Router();

// Create shareable link for proposal
router.post(
  '/:id/share',
  authenticate,
  asyncHandler(async (req, res) => {
    const schema = z.object({
      expiryDays: z.number().min(1).max(90).default(30),
    });

    const { expiryDays } = schema.parse(req.body);
    const { id } = req.params;
    const tenantId = req.tenantId!;
    const tenant = (req as any).tenant;

    // Verify proposal exists and belongs to tenant
    const proposal = await prisma.proposal.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        client: true,
      },
    });

    if (!proposal) {
      throw new ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found', 404);
    }

    const { token, shareUrl, expiresAt } = await createShareableLink(
      id,
      expiryDays,
      tenant.subdomain
    );

    // Log activity
    await prisma.activityLog.create({
      data: {
        tenantId,
        userId: req.user!.id,
        action: 'PROPOSAL_SHARE_LINK_CREATED',
        entityType: 'PROPOSAL',
        entityId: id,
        description: `Shareable link created for proposal ${proposal.reference}`,
        metadata: JSON.stringify({
          expiresAt,
          shareUrl,
        }),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.json({
      success: true,
      data: {
        token,
        shareUrl,
        expiresAt,
        pdfUrl: generateProposalPdfUrl(token, tenant.subdomain),
      },
    });
  })
);

// Revoke shareable link
router.delete(
  '/:id/share',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const tenantId = req.tenantId!;

    const proposal = await prisma.proposal.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!proposal) {
      throw new ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found', 404);
    }

    await revokeShareableLink(id);

    // Log activity
    await prisma.activityLog.create({
      data: {
        tenantId,
        userId: req.user!.id,
        action: 'PROPOSAL_SHARE_LINK_REVOKED',
        entityType: 'PROPOSAL',
        entityId: id,
        description: `Shareable link revoked for proposal ${proposal.reference}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.json({
      success: true,
      message: 'Shareable link revoked',
    });
  })
);

// Send proposal via email
router.post(
  '/:id/email',
  authenticate,
  requireActiveSubscriptionOrTrial,
  asyncHandler(async (req, res) => {
    const schema = z.object({
      to: z.string().email().optional(),
      cc: z.array(z.string().email()).optional(),
      subject: z.string().optional(),
      message: z.string().optional(),
      includePdf: z.boolean().default(true),
    });

    const { to: toOverride, cc, subject, message, includePdf } = schema.parse(req.body);
    const { id } = req.params;
    const tenantId = req.tenantId!;
    const tenant = (req as any).tenant;

    // Get proposal
    const proposal = await prisma.proposal.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        client: true,
        createdBy: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            jobTitle: true,
          },
        },
        tenant: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!proposal) {
      throw new ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found', 404);
    }

    const to = toOverride || proposal.client.contactEmail;
    if (!to) {
      throw new ApiError(
        'NO_CLIENT_EMAIL',
        'Client does not have an email address — add one on the client record or pass a "to" address',
        400
      );
    }

    // Create or get shareable link
    let shareUrl: string;
    if (!proposal.shareToken || !proposal.publicAccessEnabled) {
      const result = await createShareableLink(id, 30, tenant.subdomain);
      shareUrl = result.shareUrl;
    } else {
      const baseUrl = (process.env.PUBLIC_PROPOSAL_URL || tenantAppUrl(tenant.subdomain)).replace(
        /\/$/,
        ''
      );
      shareUrl = `${baseUrl}/proposals/view/${proposal.shareToken}`;
    }

    // Generate PDF if needed
    let pdfAttachment: Buffer | undefined;
    if (includePdf) {
      pdfAttachment = await PDFGenerator.generateProposal(id);
    }

    // Send email via tenant mailer (platform SendGrid or custom SMTP/OAuth)
    const senderName = Array.from(
      new Set([proposal.createdBy.firstName, proposal.createdBy.lastName].filter(Boolean))
    ).join(' ');
    const result = await tenantMailer.sendProposalEmail(
      tenant.id,
      {
        to,
        clientName: proposal.client.name,
        proposalTitle: proposal.title,
        proposalReference: proposal.reference,
        viewLink: shareUrl,
        senderName,
        senderPosition:
          proposal.createdBy.jobTitle?.trim() ||
          (proposal.createdBy.role
            ? proposal.createdBy.role
                .toLowerCase()
                .split('_')
                .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ')
            : undefined),
        senderEmail: (proposal.createdBy as any).email,
        tenantName: (proposal as any).tenant?.name || tenant.name,
        validUntil: new Date(proposal.validUntil).toLocaleDateString('en-GB'),
        attachment: pdfAttachment,
      },
      { proposalId: id, clientId: proposal.clientId }
    );

    if (!result.success) {
      throw new ApiError('EMAIL_FAILED', result.error || 'Failed to send email', 500);
    }

    // Update proposal email history
    const emailHistory = JSON.parse(proposal.emailHistory || '[]');
    emailHistory.push({
      sentAt: new Date().toISOString(),
      to,
      cc,
      subject: subject || `Proposal: ${proposal.title}`,
      messageId: result.messageId,
    });

    const emailSentUpdate: {
      lastEmailedAt: Date;
      emailHistory: string;
      sentAt: Date;
      status?: 'SENT';
    } = {
      lastEmailedAt: new Date(),
      emailHistory: JSON.stringify(emailHistory),
      sentAt: new Date(),
    };
    // Resend must not downgrade ACCEPTED (or other terminal) proposals — only refresh email metadata.
    if (!['ACCEPTED', 'DECLINED', 'LOST', 'WITHDRAWN'].includes(proposal.status)) {
      emailSentUpdate.status = 'SENT';
    }

    await prisma.proposal.update({
      where: { id },
      data: emailSentUpdate,
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        tenantId,
        userId: req.user!.id,
        action: 'PROPOSAL_SENT',
        entityType: 'PROPOSAL',
        entityId: id,
        description: `Proposal sent to ${to}`,
        metadata: JSON.stringify({
          to,
          cc,
          messageId: result.messageId,
        }),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    const { emitIntegrationEvent } = await import('../../services/integrationEvents.js');
    void emitIntegrationEvent(tenantId, id, 'proposal.sent');

    res.json({
      success: true,
      data: {
        messageId: result.messageId,
        shareUrl,
      },
      message: 'Proposal sent successfully',
    });
  })
);

// Get proposal view statistics
router.get(
  '/:id/views',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const tenantId = req.tenantId!;

    // Verify proposal exists and belongs to tenant
    const proposal = await prisma.proposal.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!proposal) {
      throw new ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found', 404);
    }

    const stats = await getProposalViewStats(id);

    res.json({
      success: true,
      data: stats,
    });
  })
);

// Get compliance audit trail
router.get(
  '/:id/audit-trail',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const tenantId = req.tenantId!;

    // Verify proposal exists and belongs to tenant
    const proposal = await prisma.proposal.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!proposal) {
      throw new ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found', 404);
    }

    const auditTrail = await generateComplianceAuditTrail(id);

    res.json({
      success: true,
      data: auditTrail,
    });
  })
);

// Download signature certificate PDF (tenant-scoped forensic export)
router.get(
  '/:id/signatures/:signatureId/certificate',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id, signatureId } = req.params;
    const tenantId = req.tenantId!;

    const proposal = await prisma.proposal.findFirst({
      where: { id, tenantId },
      select: { id: true, reference: true },
    });

    if (!proposal) {
      throw new ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found', 404);
    }

    const signature = await prisma.proposalSignature.findFirst({
      where: { id: signatureId, proposalId: id },
      select: { id: true },
    });

    if (!signature) {
      throw new ApiError('SIGNATURE_NOT_FOUND', 'Signature not found', 404);
    }

    const { PDFGenerator } = await import('../../services/pdfGenerator.js');
    const pdfBuffer = await PDFGenerator.generateSignatureCertificate(id, signatureId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="signature-certificate-${proposal.reference}-${signatureId.slice(0, 8)}.pdf"`
    );
    res.send(pdfBuffer);
  })
);

// Get signature audit record as JSON (tenant-scoped forensic export)
router.get(
  '/:id/signatures/:signatureId/audit',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id, signatureId } = req.params;
    const tenantId = req.tenantId!;

    const auditRecord = await getSignatureAuditRecord(id, signatureId, tenantId);

    if (!auditRecord) {
      throw new ApiError('SIGNATURE_NOT_FOUND', 'Signature not found', 404);
    }

    res.json({
      success: true,
      data: auditRecord,
    });
  })
);

// Get proposal signatures
router.get(
  '/:id/signatures',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const tenantId = req.tenantId!;

    // Verify proposal exists and belongs to tenant
    const proposal = await prisma.proposal.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!proposal) {
      throw new ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found', 404);
    }

    const signatures = await getProposalSignatures(id);

    res.json({
      success: true,
      data: signatures,
    });
  })
);

export default router;
