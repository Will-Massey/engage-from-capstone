/**
 * Proposal Sharing, Tracking, and e-Signature Routes
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { getFrontendUrl, tenantAppUrl } from '../config/urls.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.js';
import { requireActiveSubscriptionOrTrial } from '../middleware/tierLimits.js';
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
  getSignatureAuditRecord,
  getSignatureImage,
  generateComplianceAuditTrail,
  isShareTokenValid,
  generateProposalPdfUrl,
  createClientPortalLink,
  revokeClientPortalLink,
  getClientByPortalToken,
  getClientProposalsForPortal,
} from '../services/proposalSharingService.js';
import { tenantMailer } from '../services/tenantMailer.js';
import PDFGenerator from '../services/pdfGenerator.js';
import logger from '../config/logger.js';
import { rateLimitingEnabled } from '../utils/securityFlags.js';
import {
  askPublicProposalQuestion,
  getPublicSigningSummary,
  logPublicAiUsage,
} from '../services/ai/publicProposalAiService.js';
import { classifyDeclineReasonText } from '../services/ai/winLossAiService.js';
import { DECLINE_REASONS } from '../constants/declineReasons.js';
import {
  parseProposalCustomFields,
  getRequiredSigners,
  hasPricingTiers,
  calculateTierTotals,
  findPricingTier,
} from '../utils/proposalCustomFields.js';
import { getPublicPaymentConfig } from '../services/paymentCollection.js';
import {
  AGREEMENT_VERSION,
  DEFAULT_CONSENT_TEXT,
  hashProposalDocument,
  hashTerms,
  lookupGeoFromIp,
} from '../utils/signatureAudit.js';
import {
  createProposalCheckoutOrder,
  proposalRequiresPayment,
} from '../services/proposalPayment.js';
import { isRevolutConfigured } from '../lib/revolut/revolut-client.js';

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
    const senderName = Array.from(new Set([proposal.createdBy.firstName, proposal.createdBy.lastName].filter(Boolean))).join(' ');
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

    const { emitIntegrationEvent } = await import('../services/integrationEvents.js');
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

    const { PDFGenerator } = await import('../services/pdfGenerator.js');
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

// ============================================
// PUBLIC ROUTES (Link possession = access)
// ============================================

function hashShareToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 24);
}

/** 10 AI requests per hour per share token — no PII in rate-limit keys */
const publicProposalAiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  skip: () => !rateLimitingEnabled,
  keyGenerator: (req) => `public-proposal-ai:${hashShareToken(req.params.token)}`,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many questions. Please try again in an hour.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

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

    // Auto-mark as VIEWED if currently SENT (conditional update avoids racing with sign → ACCEPTED)
    if (proposal.status === 'SENT') {
      await prisma.proposal.updateMany({
        where: { id: proposal.id, status: 'SENT' },
        data: { status: 'VIEWED' },
      });
    }

    const paymentConfig =
      proposal.status === 'ACCEPTED'
        ? await getPublicPaymentConfig(proposal.id, proposal.tenantId)
        : null;

    const customFields = parseProposalCustomFields(proposal.customFields);
    const existingSignatures = await prisma.proposalSignature.findMany({
      where: { proposalId: proposal.id },
      orderBy: { signedAt: 'asc' },
      select: {
        signedBy: true,
        signedByRole: true,
        signedAt: true,
      },
    });

    const requiredSigners = getRequiredSigners(customFields);
    const signaturesReceived = existingSignatures.length;
    const awaitingAdditionalSigner =
      proposal.status !== 'ACCEPTED' &&
      signaturesReceived > 0 &&
      signaturesReceived < requiredSigners;

    const pricingTiers = hasPricingTiers(customFields)
      ? customFields.pricingTiers!.map((tier) => ({
          ...tier,
          ...calculateTierTotals(
            {
              subtotal: proposal.subtotal,
              vatAmount: proposal.vatAmount,
              total: proposal.total,
            },
            tier
          ),
        }))
      : undefined;

    const selectedTier = customFields.selectedTierId
      ? findPricingTier(customFields, customFields.selectedTierId)
      : undefined;
    const displayTotals =
      selectedTier && proposal.status !== 'ACCEPTED'
        ? calculateTierTotals(
            {
              subtotal: proposal.subtotal,
              vatAmount: proposal.vatAmount,
              total: proposal.total,
            },
            selectedTier
          )
        : {
            subtotal: proposal.subtotal,
            vatAmount: proposal.vatAmount,
            total: proposal.total,
          };

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
        paymentStatus: proposal.paymentStatus,
        paymentTerms: proposal.paymentTerms,
        coverLetter: proposal.coverLetter,
        proposalSummary: proposal.proposalSummary,
        terms: proposal.terms,
        engagementLetter: proposal.engagementLetter,
        payment: paymentConfig,
        customFields: {
          offerThreePackages: customFields.offerThreePackages ?? false,
          pricingTiers,
          requiredSigners,
          selectedTierId: customFields.selectedTierId,
          selectedTierLabel: customFields.selectedTierLabel,
        },
        signing: {
          requiredSigners,
          signaturesReceived,
          awaitingAdditionalSigner,
          existingSignatures,
        },
        client: {
          name: proposal.client.name,
          contactName: proposal.client.contactName,
          companyType: proposal.client.companyType,
          contactEmail: proposal.client.contactEmail,
        },
        createdBy: proposal.createdBy
          ? {
              firstName: proposal.createdBy.firstName,
              lastName: proposal.createdBy.lastName,
              jobTitle: proposal.createdBy.jobTitle,
            }
          : undefined,
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

// Plain-English signing summary (public — proposal content only)
router.get(
  '/view/:token/signing-summary',
  publicProposalAiLimiter,
  asyncHandler(async (req, res) => {
    const { token } = req.params;

    const proposal = await getProposalByShareToken(token);

    if (!proposal) {
      throw new ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found or link expired', 404);
    }

    if (proposal.status === 'ACCEPTED') {
      throw new ApiError('PROPOSAL_ALREADY_ACCEPTED', 'This proposal has already been accepted', 400);
    }

    const result = await getPublicSigningSummary(proposal);

    logger.info('Public signing summary generated', {
      proposalRef: proposal.reference,
      source: result.source,
    });

    const { computeSigningCostSummary } = await import('../services/ai/publicProposalAiService.js');

    res.json({
      success: true,
      data: {
        summary: result.summary,
        costSummary: computeSigningCostSummary(proposal),
        practiceName: proposal.tenant.name,
        clientName: proposal.client.name,
        reference: proposal.reference,
      },
    });
  })
);

// Client Q&A on proposal (public — answers only from proposal JSON)
router.post(
  '/view/:token/ask',
  publicProposalAiLimiter,
  asyncHandler(async (req, res) => {
    const schema = z.object({
      question: z.string().min(3).max(500),
      history: z
        .array(
          z.object({
            role: z.enum(['user', 'assistant']),
            content: z.string().max(800),
          })
        )
        .max(6)
        .optional(),
    });

    const { question, history } = schema.parse(req.body);
    const { token } = req.params;

    const proposal = await getProposalByShareToken(token);

    if (!proposal) {
      throw new ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found or link expired', 404);
    }

    if (proposal.status === 'ACCEPTED') {
      throw new ApiError('PROPOSAL_ALREADY_ACCEPTED', 'This proposal has already been accepted', 400);
    }

    const result = await askPublicProposalQuestion(
      proposal,
      question,
      history as Array<{ role: 'user' | 'assistant'; content: string }> | undefined
    );

    logger.info('Public proposal question answered', {
      proposalRef: proposal.reference,
      source: result.source,
    });

    res.json({
      success: true,
      data: {
        answer: result.answer,
        assistantName: 'Clara',
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
      signerEmail: z.string().email(),
      signatureData: z.string().min(100),
      agreementAccepted: z.boolean(),
      authorisedToSign: z.boolean(),
      deviceInfo: z.string().optional(),
      consentText: z.string().optional(),
      selectedTierId: z.string().optional(),
    });

    const parsed = schema.parse(req.body);
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

    const customFields = parseProposalCustomFields(proposal.customFields);
    const requiredSigners = getRequiredSigners(customFields);
    const existingSignatures = await prisma.proposalSignature.count({
      where: { proposalId: proposal.id },
    });

    if (existingSignatures >= requiredSigners) {
      throw new ApiError(
        'SIGNATURES_COMPLETE',
        'All required signatures have already been collected',
        400
      );
    }

    if (!parsed.agreementAccepted) {
      throw new ApiError('AGREEMENT_REQUIRED', 'You must accept the terms and conditions', 400);
    }

    if (!parsed.authorisedToSign) {
      throw new ApiError(
        'AUTHORISATION_REQUIRED',
        'You must confirm you are authorised to sign on behalf of the client',
        400
      );
    }

    const fullForHash = await prisma.proposal.findUnique({
      where: { id: proposal.id },
      include: { services: true },
    });

    const ipAddress = req.ip || null;
    const geoLocation = await lookupGeoFromIp(ipAddress);
    const consentText = parsed.consentText || DEFAULT_CONSENT_TEXT;

    const result = await recordElectronicSignature({
      proposalId: proposal.id,
      signedBy: parsed.signedBy,
      signedByRole: parsed.signedByRole,
      signerEmail: parsed.signerEmail,
      signatureData: parsed.signatureData,
      ipAddress,
      userAgent: req.headers['user-agent'] || null,
      deviceInfo: parsed.deviceInfo || null,
      geoLocation,
      documentHash: fullForHash ? hashProposalDocument(fullForHash) : null,
      termsHash: hashTerms(fullForHash?.terms),
      consentText,
      signatureType: 'SIMPLE_ELECTRONIC',
      agreementVersion: AGREEMENT_VERSION,
      tenantId: proposal.tenantId,
      selectedTierId: parsed.selectedTierId,
    });

    if (!result.success) {
      throw new ApiError('SIGNATURE_FAILED', result.error || 'Failed to record signature', 500);
    }

    // Notify practice only when all required signatories have signed
    if (result.fullyAccepted) {
      try {
        const { sendPracticeAcceptanceNotifications } = await import(
          '../services/acceptanceNotificationService.js'
        );
        await sendPracticeAcceptanceNotifications({
          proposalId: proposal.id,
          tenantId: proposal.tenantId,
          signatureId: result.signatureId!,
          signedBy: parsed.signedBy,
          signedByRole: parsed.signedByRole,
          signerEmail: parsed.signerEmail,
        });
      } catch (error) {
        logger.error('Failed to send acceptance notification:', error);
      }
    }

    let checkout: Awaited<ReturnType<typeof createProposalCheckoutOrder>> = null;

    if (proposalRequiresPayment(proposal.total)) {
      const fullProposal = await prisma.proposal.findUnique({
        where: { id: proposal.id },
        include: { client: true },
      });

      if (fullProposal) {
        checkout = await createProposalCheckoutOrder(
          fullProposal,
          { email: parsed.signerEmail, name: parsed.signedBy },
          token,
        );
      }
    }

    res.json({
      success: true,
      message: checkout
        ? 'Proposal accepted — please complete payment to confirm'
        : 'Proposal accepted successfully',
      data: {
        acceptedAt: result.fullyAccepted ? new Date() : undefined,
        acceptedBy: result.fullyAccepted ? parsed.signedBy : undefined,
        signatureId: result.signatureId,
        paymentRequired: proposalRequiresPayment(proposal.total) && isRevolutConfigured(),
        checkout,
      },
    });
  })
);

// Get payment status for a signed proposal (public — share token)
router.get(
  '/view/:token/payment-status',
  asyncHandler(async (req, res) => {
    const { token } = req.params;
    const proposal = await getProposalByShareToken(token);

    if (!proposal) {
      throw new ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found or link expired', 404);
    }

    res.json({
      success: true,
      data: {
        status: proposal.paymentStatus || 'NOT_STARTED',
        paid: proposal.paymentStatus === 'COMPLETED',
        amount: proposal.total,
        paymentUrl: proposal.paymentUrl,
      },
    });
  })
);

// Decline proposal (public)
router.post(
  '/view/:token/decline',
  asyncHandler(async (req, res) => {
    const schema = z
      .object({
        declineReason: z.enum(DECLINE_REASONS).optional(),
        reason: z.string().max(2000).optional(),
        declinedBy: z.string().min(2).optional(),
      })
      .refine(
        (data) =>
          data.declineReason != null ||
          (typeof data.reason === 'string' && data.reason.trim().length >= 3),
        { message: 'declineReason or reason (min 3 chars) is required' }
      )
      .refine(
        (data) =>
          data.declineReason !== 'OTHER' ||
          (typeof data.reason === 'string' && data.reason.trim().length >= 3),
        { message: 'Please provide details when selecting Other' }
      );

    const { declineReason, reason, declinedBy } = schema.parse(req.body);
    const reasonText = reason?.trim() || null;
    const { token } = req.params;

    const proposal = await getProposalByShareToken(token);
    if (!proposal) {
      throw new ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found or link expired', 404);
    }
    if (proposal.status === 'ACCEPTED') {
      throw new ApiError('INVALID_STATUS', 'Proposal already accepted', 400);
    }

    let declineReasonAi: (typeof DECLINE_REASONS)[number] | null = null;
    if (declineReason === 'OTHER' && reasonText) {
      declineReasonAi = await classifyDeclineReasonText(reasonText);
      if (declineReasonAi) {
        await logPublicAiUsage(proposal.tenantId, proposal.id, 'public_decline_classify');
      }
    }

    const now = new Date();
    const summaryLabel = declineReason
      ? `${declineReason}${reasonText ? `: ${reasonText}` : ''}`
      : reasonText!;

    await prisma.proposal.update({
      where: { id: proposal.id },
      data: { status: 'DECLINED', declinedAt: new Date() },
    });

    await prisma.activityLog.create({
      data: {
        tenantId: proposal.tenantId,
        action: 'PROPOSAL_DECLINED',
        entityType: 'PROPOSAL',
        entityId: proposal.id,
        description: declinedBy
          ? `Proposal declined by ${declinedBy}: ${summaryLabel}`
          : `Proposal declined: ${summaryLabel}`,
        metadata: JSON.stringify({
          declineReason,
          declineReasonAi,
          reason: reasonText,
          declinedBy,
          ipAddress: req.ip,
        }),
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
        proposalId: proposal.id,
      },
    });

    // Notify practice by email
    try {
      const fullProposal = await prisma.proposal.findUnique({
        where: { id: proposal.id },
        include: {
          client: true,
          tenant: { select: { name: true } },
          createdBy: { select: { email: true, firstName: true, lastName: true } },
        },
      });

      const notifyEmail = fullProposal?.createdBy?.email;
      if (notifyEmail) {
        const senderName = [fullProposal.createdBy.firstName, fullProposal.createdBy.lastName]
          .filter(Boolean)
          .join(' ');
        const subject = `Proposal declined: ${fullProposal.reference}`;
        const text = [
          `A client has declined your proposal.`,
          ``,
          `Client: ${fullProposal.client.name}`,
          `Proposal: ${fullProposal.title} (${fullProposal.reference})`,
          `Declined by: ${declinedBy || 'Client'}`,
          `Reason: ${reason}`,
          ``,
          `View in Engage: ${getFrontendUrl()}/proposals/${proposal.id}`,
        ].join('\n');

        await tenantMailer.send({
          tenantId: proposal.tenantId,
          messageType: 'OTHER',
          message: {
            to: notifyEmail,
            subject,
            text,
            html: text.replace(/\n/g, '<br>'),
          },
          relatedIds: { proposalId: proposal.id, clientId: fullProposal.clientId },
        });
        logger.info(`Decline notification sent for proposal ${proposal.id}`);
      }
    } catch (error) {
      logger.error('Failed to send decline notification:', error);
    }

    res.json({ success: true, message: 'Proposal declined' });
  })
);

// Get signature image (authenticated only, tenant-scoped)
router.get(
  '/signatures/:id/image',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const tenantId = req.tenantId!;

    const signature = await prisma.proposalSignature.findFirst({
      where: {
        id,
        proposal: { tenantId },
      },
      select: { signatureData: true, signatureFilePath: true },
    });

    if (!signature) {
      throw new ApiError('SIGNATURE_NOT_FOUND', 'Signature not found', 404);
    }

    let imageData: string | null = signature.signatureData;
    if (signature.signatureFilePath) {
      const { readSignature } = await import('../services/fileStorage.js');
      imageData = await readSignature(signature.signatureFilePath);
    }

    res.json({
      success: true,
      data: { imageData },
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
      frontendOrigin: z.string().url().optional(),
    });
    const { expiryDays, frontendOrigin } = schema.parse(req.body);

    // Verify client exists and belongs to tenant
    const client = await prisma.client.findFirst({
      where: { id: clientId, tenantId: req.tenantId },
    });

    if (!client) {
      throw new ApiError('CLIENT_NOT_FOUND', 'Client not found', 404);
    }

    const origin =
      frontendOrigin ||
      (typeof req.headers.origin === 'string' ? req.headers.origin : undefined);

    const result = await createClientPortalLink(clientId, expiryDays || 90, origin);

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
