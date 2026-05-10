/**
 * Proposal Sharing, Tracking, and e-Signature Routes
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.js';
import { extractTenant } from '../middleware/tenant.js';
import { generateProposalTerms } from '../templates/ukEngagementLetter.js';
import {
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
  createClientPortalLink,
  revokeClientPortalLink,
  getClientByPortalToken,
  getClientProposalsForPortal,
} from '../services/proposalSharingService.js';
import { createEmailService } from '../services/emailService.js';
import PDFGenerator from '../services/pdfGenerator.js';
import logger from '../config/logger.js';

const router = Router();

// Apply tenant extraction to all routes
router.use(extractTenant);

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
  asyncHandler(async (req, res) => {
    const schema = z.object({
      to: z.string().email(),
      cc: z.array(z.string().email()).optional(),
      subject: z.string().optional(),
      message: z.string().optional(),
      includePdf: z.boolean().default(true),
    });

    const { to, cc, subject, message, includePdf } = schema.parse(req.body);
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

    // Create or get shareable link
    let shareUrl: string;
    if (!proposal.shareToken || !proposal.publicAccessEnabled) {
      const result = await createShareableLink(id, 30, tenant.subdomain);
      shareUrl = result.shareUrl;
    } else {
      const baseUrl = (
        process.env.FRONTEND_URL ||
        process.env.PUBLIC_PROPOSAL_URL ||
        `https://${tenant.subdomain}.engage.capstone.co.uk`
      ).replace(/\/$/, '');
      shareUrl = `${baseUrl}/proposals/view/${proposal.shareToken}`;
    }

    // Initialize email service
    const emailService = createEmailService();
    if (!emailService) {
      throw new ApiError('EMAIL_NOT_CONFIGURED', 'Email service not configured', 500);
    }

    // Generate PDF if needed
    let pdfAttachment: Buffer | undefined;
    if (includePdf) {
      pdfAttachment = await PDFGenerator.generateProposal(id);
    }

    // Send email
    const senderName = `${proposal.createdBy.firstName} ${proposal.createdBy.lastName}`;
    const result = await emailService.sendProposalEmail({
      to,
      clientName: proposal.client.name,
      proposalTitle: proposal.title,
      proposalReference: proposal.reference,
      viewLink: shareUrl,
      senderName,
      senderPosition: proposal.createdBy.role,
      senderEmail: (proposal.createdBy as any).email,
      tenantName: (proposal as any).tenant?.name || 'Unknown',
      validUntil: new Date(proposal.validUntil).toLocaleDateString('en-GB'),
      attachment: pdfAttachment,
    });

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

    await prisma.proposal.update({
      where: { id },
      data: {
        lastEmailedAt: new Date(),
        emailHistory: JSON.stringify(emailHistory),
        sentAt: new Date(),
        status: 'SENT',
      },
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

// ============================================
// PUBLIC ROUTES (Link possession = access)
// ============================================

// View proposal by share token (public — possession of link is sufficient)
router.get(
  '/view/:token',
  asyncHandler(async (req, res) => {
    const { token } = req.params;

    const proposal = await getProposalByShareToken(token);

    if (!proposal) {
      throw new ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found or link expired', 404);
    }

    // Track view (anonymous — link possession is the access control)
    await trackProposalView(
      proposal.id,
      req.ip || null,
      req.headers['user-agent'] || null
    );

    // Auto-mark as VIEWED if currently SENT
    if (proposal.status === 'SENT') {
      await prisma.proposal.update({
        where: { id: proposal.id },
        data: { status: 'VIEWED' },
      });
    }

    // Return proposal data (without sensitive fields)
    res.json({
      success: true,
      data: {
        id: proposal.id,
        reference: proposal.reference,
        title: proposal.title,
        status: proposal.status,
        validUntil: proposal.validUntil,
        subtotal: proposal.subtotal,
        vatAmount: proposal.vatAmount,
        total: proposal.total,
        paymentTerms: proposal.paymentTerms,
        coverLetter: proposal.coverLetter,
        terms: proposal.terms,
        engagementLetter: proposal.engagementLetter,
        client: {
          name: proposal.client.name,
          companyType: proposal.client.companyType,
        },
        tenant: {
          name: proposal.tenant.name,
          primaryColor: proposal.tenant.primaryColor,
          logo: proposal.tenant.logo,
        },
        services: proposal.services.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          quantity: s.quantity,
          unitPrice: s.unitPrice,
          displayPrice: s.displayPrice,
          lineTotal: s.lineTotal,
          billingFrequency: s.billingFrequency,
          frequency: s.frequency,
          isOptional: s.isOptional,
        })),
      },
    });
  })
);

// Get proposal terms by share token (public)
router.get(
  '/view/:token/terms',
  asyncHandler(async (req, res) => {
    const { token } = req.params;

    const proposal = await getProposalByShareToken(token);

    if (!proposal) {
      throw new ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found or link expired', 404);
    }

    const terms = proposal.terms || generateProposalTerms();

    res.json({
      success: true,
      data: {
        terms,
        practiceName: proposal.tenant.name,
      },
    });
  })
);

// Submit electronic signature (public — link possession = access)
router.post(
  '/view/:token/sign',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      signedBy: z.string().min(2),
      signedByRole: z.string().min(2),
      signatureData: z.string().min(100), // Base64 signature image
      agreementAccepted: z.boolean(),
      deviceInfo: z.string().optional(),
    });

    const parsed = schema.parse(req.body);
    const signedBy = parsed.signedBy;
    const signedByRole = parsed.signedByRole;
    const signatureData = parsed.signatureData;
    const agreementAccepted = parsed.agreementAccepted;
    const deviceInfo = parsed.deviceInfo;
    const { token } = req.params;

    const proposal = await getProposalByShareToken(token);

    if (!proposal) {
      throw new ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found or link expired', 404);
    }

    if (proposal.status === 'ACCEPTED') {
      throw new ApiError(
        'PROPOSAL_ALREADY_ACCEPTED',
        'This proposal has already been accepted',
        400
      );
    }

    if (!agreementAccepted) {
      throw new ApiError('AGREEMENT_REQUIRED', 'You must accept the terms and conditions', 400);
    }

    const result = await recordElectronicSignature({
      proposalId: proposal.id,
      signedBy,
      signedByRole,
      signatureData,
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
      deviceInfo: deviceInfo || null,
      geoLocation: null, // Can be enriched via IP geolocation service if needed
      agreementVersion: 'PRO-2024-001',
      tenantId: proposal.tenantId,
    });

    if (!result.success) {
      throw new ApiError('SIGNATURE_FAILED', result.error || 'Failed to record signature', 500);
    }

    // Send acceptance notification to practice
    try {
      const emailService = createEmailService();
      if (emailService) {
        // Get proposal creator details for notification
        const fullProposal = await prisma.proposal.findUnique({
          where: { id: proposal.id },
          include: {
            createdBy: {
              select: { email: true, firstName: true, lastName: true },
            },
            client: true,
          },
        });

        if (fullProposal?.createdBy?.email) {
          // Generate signed proposal PDF
          const { PDFGenerator } = await import('../services/pdfGenerator.js');
          const proposalPdf = await PDFGenerator.generateProposal(proposal.id);

          // Get signature image
          const signatureImage = await getSignatureImage(result.signatureId!);

          // Send notification email
          await emailService.sendAcceptanceNotification({
            to: fullProposal.createdBy.email,
            clientName: fullProposal.client.name,
            proposalTitle: fullProposal.title,
            proposalReference: fullProposal.reference,
            acceptedAt: new Date(),
            totalAmount: `£${fullProposal.total.toFixed(2)}`,
            signedBy,
            signedByRole,
            proposalPdf,
            signaturePng: signatureImage
              ? Buffer.from(signatureImage.split(',')[1], 'base64')
              : undefined,
          });

          // Update acceptance notified timestamp
          await prisma.proposal.update({
            where: { id: proposal.id },
            data: { acceptanceNotifiedAt: new Date() },
          });

          logger.info(`Acceptance notification sent for proposal ${proposal.id}`);
        }
      }
    } catch (error) {
      logger.error('Failed to send acceptance notification:', error);
      // Don't fail the request - signature was still recorded
    }

    res.json({
      success: true,
      message: 'Proposal accepted successfully',
      data: {
        acceptedAt: new Date(),
        acceptedBy: signedBy,
      },
    });
  })
);

// Get signature image (authenticated only)
router.get(
  '/signatures/:id/image',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const signatureData = await getSignatureImage(id);

    if (!signatureData) {
      throw new ApiError('SIGNATURE_NOT_FOUND', 'Signature not found', 404);
    }

    // Return as base64 or redirect to data URL
    res.json({
      success: true,
      data: {
        imageData: signatureData,
      },
    });
  })
);

// Download proposal PDF by token (public)
router.get(
  '/view/:token/pdf',
  asyncHandler(async (req, res) => {
    const { token } = req.params;

    const proposal = await getProposalByShareToken(token);

    if (!proposal) {
      throw new ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found or link expired', 404);
    }

    // Generate and return PDF
    const pdfBuffer = await PDFGenerator.generateProposal(proposal.id);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="proposal-${proposal.reference}.pdf"`
    );
    res.send(pdfBuffer);
  })
);

// ==================== CLIENT PORTAL ROUTES ====================

// Create client portal link (authenticated)
router.post(
  '/portal/:clientId',
  authenticate,
  extractTenant,
  asyncHandler(async (req, res) => {
    const { clientId } = req.params;
    const schema = z.object({
      expiryDays: z.number().min(1).max(365).optional(),
    });
    const { expiryDays } = schema.parse(req.body);

    // Verify client exists and belongs to tenant
    const client = await prisma.client.findFirst({
      where: { id: clientId, tenantId: req.tenantId },
    });

    if (!client) {
      throw new ApiError('CLIENT_NOT_FOUND', 'Client not found', 404);
    }

    const result = await createClientPortalLink(clientId, expiryDays || 90);

    res.json({
      success: true,
      data: result,
    });
  })
);

// Revoke client portal link (authenticated)
router.delete(
  '/portal/:clientId',
  authenticate,
  extractTenant,
  asyncHandler(async (req, res) => {
    const { clientId } = req.params;

    const client = await prisma.client.findFirst({
      where: { id: clientId, tenantId: req.tenantId },
    });

    if (!client) {
      throw new ApiError('CLIENT_NOT_FOUND', 'Client not found', 404);
    }

    await revokeClientPortalLink(clientId);

    res.json({
      success: true,
      data: { message: 'Portal link revoked' },
    });
  })
);

// Get client portal data (public — link possession = access)
router.get(
  '/portal/:token',
  asyncHandler(async (req, res) => {
    const { token } = req.params;

    const client = await getClientByPortalToken(token);

    if (!client) {
      throw new ApiError('PORTAL_NOT_FOUND', 'Portal link not found or expired', 404);
    }

    const proposals = await getClientProposalsForPortal(client.id);

    res.json({
      success: true,
      data: {
        client: {
          id: client.id,
          name: client.name,
          contactName: client.contactName,
          contactEmail: client.contactEmail,
        },
        practice: {
          name: client.tenant.name,
          primaryColor: client.tenant.primaryColor,
          logo: client.tenant.logo,
        },
        proposals: proposals.map((p) => ({
          id: p.id,
          reference: p.reference,
          title: p.title,
          status: p.status,
          total: p.total,
          subtotal: p.subtotal,
          vatAmount: p.vatAmount,
          discountAmount: p.discountAmount,
          validUntil: p.validUntil,
          sentAt: p.sentAt,
          viewedAt: p.viewedAt,
          acceptedAt: p.acceptedAt,
          declinedAt: p.declinedAt,
          createdAt: p.createdAt,
          services: p.services,
          shareToken: p.shareToken,
          shareTokenExpiry: p.shareTokenExpiry,
          publicAccessEnabled: p.publicAccessEnabled,
        })),
      },
    });
  })
);

export default router;
