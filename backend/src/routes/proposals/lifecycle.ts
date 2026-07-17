import { Router } from 'express';
import { z } from 'zod';
import { ApprovalStatus, ProposalStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { proposalMoneyForApi } from '../../utils/proposalServiceSnapshot.js';
import { penceToPounds } from '../../utils/proposalPricing.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { requireActiveSubscription } from '../../middleware/subscription.js';
import { asyncHandler, ApiError } from '../../middleware/errorHandler.js';
import { PDFGenerator } from '../../services/pdfGenerator.js';
import logger from '../../config/logger.js';
import { revokeShareableLink } from '../../services/proposalSharingService.js';
import { DECLINE_REASONS } from '../../constants/declineReasons.js';
import { canOverrideApproval, canSendProposal, resolveSenderPosition } from './shared.js';

const router = Router();

/**
 * POST /api/proposals/:id/send
 * Send proposal to client via email with PDF
 */
router.post(
  '/:id/send',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER', 'SENIOR'),
  requireActiveSubscription,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const sendBody = z
      .object({
        aiSubject: z.string().max(200).optional(),
        aiText: z.string().max(50_000).optional(),
        aiHtml: z.string().max(100_000).optional(),
      })
      .parse(req.body ?? {});

    // Get proposal with full details
    const proposal = await prisma.proposal.findFirst({
      where: {
        id,
        tenantId: req.tenantId,
      },
      include: {
        client: true,
        services: true,
        tenant: true,
      },
    });

    if (!proposal) {
      throw new ApiError('NOT_FOUND', 'Proposal not found', 404);
    }

    if (proposal.status !== 'DRAFT') {
      throw new ApiError('INVALID_STATUS', 'Proposal must be in draft status to send', 400);
    }

    const userRole = req.user!.role;
    const overrideApproval = canOverrideApproval(userRole);

    if (proposal.approvalStatus === 'PENDING' && !overrideApproval) {
      throw new ApiError(
        'APPROVAL_PENDING',
        'This proposal is awaiting partner approval and cannot be sent yet',
        403
      );
    }

    if (proposal.approvalStatus === 'REJECTED' && !overrideApproval) {
      throw new ApiError(
        'APPROVAL_REJECTED',
        'This proposal was rejected. Revise and resubmit for partner approval before sending',
        403
      );
    }

    if (!canSendProposal(userRole, proposal.approvalStatus)) {
      throw new ApiError(
        'APPROVAL_REQUIRED',
        'Partner approval is required before this proposal can be sent',
        403
      );
    }

    if (!proposal.client.contactEmail) {
      throw new ApiError('NO_CLIENT_EMAIL', 'Client does not have an email address', 400);
    }

    const tenantSubdomain = proposal.tenant.subdomain;

    const { PDFGenerator } = await import('../../services/pdfGenerator.js');
    const { tenantMailer } = await import('../../services/tenantMailer.js');
    const { createShareableLink } = await import('../../services/proposalSharingService.js');

    const pdfBuffer = await PDFGenerator.generateProposal(id);
    const pdfHeader = pdfBuffer.subarray(0, 5).toString('ascii');
    if (!pdfHeader.startsWith('%PDF')) {
      logger.warn(
        `Proposal ${id} PDF generation returned invalid header — attachment will be omitted`
      );
    }

    const frontendUrl = (
      process.env.FRONTEND_URL || 'https://capstonesoftware.co.uk/engage'
    ).replace(/\/$/, '');
    let viewToken = proposal.shareToken;
    const tokenExpiry = proposal.shareTokenExpiry;
    if (
      !viewToken ||
      !tokenExpiry ||
      new Date(tokenExpiry).getTime() < Date.now() ||
      !proposal.publicAccessEnabled
    ) {
      const link = await createShareableLink(id, 30, tenantSubdomain);
      viewToken = link.token;
    }
    const viewLink = `${frontendUrl}/proposals/view/${viewToken}`;

    const totalAmount = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
    }).format(penceToPounds(proposal.totalPence));

    const emailResult = await tenantMailer.sendProposalEmail(
      req.tenantId!,
      {
        to: proposal.client.contactEmail,
        clientName: proposal.client.name,
        proposalTitle: proposal.title,
        proposalReference: proposal.reference,
        viewLink,
        senderName: Array.from(
          new Set([req.user!.firstName, req.user!.lastName].filter(Boolean))
        ).join(' '),
        senderPosition: await resolveSenderPosition(req.user!.id, req.user!.role),
        senderEmail: req.user!.email,
        validUntil: new Date(proposal.validUntil).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
        tenantName: proposal.tenant.name,
        totalAmount,
        serviceCount: proposal.services.length,
        attachment: pdfBuffer,
        aiSubject: sendBody.aiSubject,
        aiText: sendBody.aiText,
        aiHtml: sendBody.aiHtml,
      },
      { proposalId: id, clientId: proposal.clientId }
    );

    if (!emailResult.success) {
      throw new ApiError('EMAIL_SEND_FAILED', `Failed to send email: ${emailResult.error}`, 500);
    }

    // Update status (partners/admins sending without prior approval are auto-approved)
    const sendUpdateData: {
      status?: ProposalStatus;
      sentAt: Date;
      approvalStatus?: ApprovalStatus;
      approvedAt?: Date;
      approvedById?: string;
    } = {
      sentAt: new Date(),
    };

    if (!['ACCEPTED', 'DECLINED', 'LOST', 'WITHDRAWN'].includes(proposal.status)) {
      sendUpdateData.status = 'SENT';
    }

    if (overrideApproval && proposal.approvalStatus !== 'APPROVED') {
      sendUpdateData.approvalStatus = 'APPROVED';
      sendUpdateData.approvedAt = new Date();
      sendUpdateData.approvedById = req.user!.id;
    }

    const updatedProposal = await prisma.proposal.update({
      where: { id },
      data: sendUpdateData,
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        tenantId: req.tenantId,
        userId: req.user!.id,
        action: 'PROPOSAL_SENT',
        entityType: 'PROPOSAL',
        entityId: proposal.id,
        description: `Sent proposal "${proposal.title}" to ${proposal.client.name} via email`,
      },
    });

    const { emitIntegrationEvent } = await import('../../services/integrationEvents.js');
    void emitIntegrationEvent(req.tenantId!, proposal.id, 'proposal.sent');

    res.json({
      success: true,
      data: { ...updatedProposal, ...proposalMoneyForApi(updatedProposal) },
      message: 'Proposal sent successfully',
    });
  })
);

/**
 * POST /api/proposals/:id/accept
 * Mark proposal as accepted
 */
export const acceptSchema = z.object({
  signature: z.string().min(100).max(500_000),
  acceptedBy: z.string().max(200).optional(),
  signatoryPosition: z.string().max(200).optional(),
  deviceInfo: z.string().max(2000).optional(),
});

router.post(
  '/:id/accept',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER', 'SENIOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { acceptedBy, signature, signatoryPosition, deviceInfo } = acceptSchema.parse(
      req.body ?? {}
    );

    const proposal = await prisma.proposal.findFirst({
      where: { id, tenantId: req.tenantId },
      include: { services: true },
    });

    if (!proposal) {
      throw new ApiError('NOT_FOUND', 'Proposal not found', 404);
    }

    if (proposal.status !== 'SENT' && proposal.status !== 'VIEWED') {
      throw new ApiError('INVALID_STATUS', 'Proposal must be sent before accepting', 400);
    }

    const signerName =
      acceptedBy ||
      Array.from(new Set([req.user?.firstName, req.user?.lastName].filter(Boolean)))
        .join(' ')
        .trim();

    const { recordElectronicSignature } = await import('../../services/proposalSharingService.js');
    const {
      AGREEMENT_VERSION,
      DEFAULT_CONSENT_TEXT,
      hashProposalDocument,
      hashTerms,
      lookupGeoFromIp,
    } = await import('../../utils/signatureAudit.js');

    const ipAddress = req.ip || null;
    const result = await recordElectronicSignature({
      proposalId: proposal.id,
      signedBy: signerName,
      signedByRole: signatoryPosition || 'Authorised signatory',
      signerEmail: req.user?.email || null,
      signatureData: signature,
      ipAddress,
      userAgent: req.headers['user-agent'] || null,
      deviceInfo: deviceInfo || null,
      geoLocation: await lookupGeoFromIp(ipAddress),
      documentHash: hashProposalDocument(proposal),
      termsHash: hashTerms(proposal.terms),
      consentText: DEFAULT_CONSENT_TEXT,
      signatureType: 'SIMPLE_ELECTRONIC',
      agreementVersion: AGREEMENT_VERSION,
      tenantId: req.tenantId!,
      userId: req.user!.id,
    });

    if (!result.success) {
      throw new ApiError('SIGNATURE_FAILED', result.error || 'Failed to record signature', 500);
    }

    try {
      const { sendPracticeAcceptanceNotifications } =
        await import('../../services/acceptanceNotificationService.js');
      await sendPracticeAcceptanceNotifications({
        proposalId: proposal.id,
        tenantId: req.tenantId!,
        signatureId: result.signatureId!,
        signedBy: signerName,
        signedByRole: signatoryPosition || 'Authorised signatory',
        signerEmail: req.user?.email || null,
      });
    } catch (notifyErr) {
      logger.error('Failed to send practice acceptance notification:', notifyErr);
    }

    const updatedProposal = await prisma.proposal.findFirst({
      where: { id, tenantId: req.tenantId },
      include: { client: true, services: true },
    });

    res.json({
      success: true,
      data: { ...updatedProposal, ...proposalMoneyForApi(updatedProposal) },
    });
  })
);

/**
 * POST /api/proposals/:id/withdraw
 * Rescind/withdraw a sent or viewed proposal (revokes client share link)
 */
router.post(
  '/:id/withdraw',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MD', 'MANAGER', 'SENIOR'),
  requireActiveSubscription,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const proposal = await prisma.proposal.findFirst({
      where: { id, tenantId: req.tenantId },
      include: { client: true },
    });

    if (!proposal) {
      throw new ApiError('NOT_FOUND', 'Proposal not found', 404);
    }

    if (proposal.status !== 'SENT' && proposal.status !== 'VIEWED') {
      throw new ApiError('INVALID_STATUS', 'Only sent or viewed proposals can be withdrawn', 400);
    }

    if (proposal.shareToken || proposal.publicAccessEnabled) {
      await revokeShareableLink(id);
    }

    const updatedProposal = await prisma.proposal.update({
      where: { id },
      data: { status: 'WITHDRAWN' },
    });

    await prisma.activityLog.create({
      data: {
        tenantId: req.tenantId,
        userId: req.user!.id,
        action: 'PROPOSAL_WITHDRAWN',
        entityType: 'PROPOSAL',
        entityId: proposal.id,
        description: `Withdrew proposal "${proposal.title}" sent to ${proposal.client.name}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.json({
      success: true,
      data: { ...updatedProposal, ...proposalMoneyForApi(updatedProposal) },
      message: 'Proposal withdrawn successfully',
    });
  })
);

/**
 * POST /api/proposals/:id/mark-lost
 * Practice marks an open quotation as lost (feeds win/loss stats)
 */
router.post(
  '/:id/mark-lost',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MD', 'MANAGER', 'SENIOR'),
  requireActiveSubscription,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = z
      .object({
        declineReason: z.enum(DECLINE_REASONS),
        reason: z.string().max(500).optional(),
      })
      .parse(req.body);

    const proposal = await prisma.proposal.findFirst({
      where: { id, tenantId: req.tenantId },
      include: { client: true },
    });

    if (!proposal) {
      throw new ApiError('NOT_FOUND', 'Proposal not found', 404);
    }

    const markable: ProposalStatus[] = ['DRAFT', 'SENT', 'VIEWED', 'EXPIRED', 'WITHDRAWN'];
    if (!markable.includes(proposal.status)) {
      throw new ApiError(
        'INVALID_STATUS',
        'Only open quotations (draft, sent, viewed, expired, or rescinded) can be marked as lost',
        400
      );
    }

    if (proposal.shareToken || proposal.publicAccessEnabled) {
      await revokeShareableLink(id);
    }

    const reasonText = body.reason?.trim() || null;

    const updatedProposal = await prisma.proposal.update({
      where: { id },
      data: {
        status: 'LOST',
        declinedAt: new Date(),
        declineReason: body.declineReason,
        declineReasonText: reasonText,
        declinedBy: req.user!.email || `${req.user!.firstName} ${req.user!.lastName}`.trim(),
      },
    });

    await prisma.activityLog.create({
      data: {
        tenantId: req.tenantId,
        userId: req.user!.id,
        action: 'PROPOSAL_MARKED_LOST',
        entityType: 'PROPOSAL',
        entityId: proposal.id,
        description: `Marked proposal "${proposal.title}" as lost (${body.declineReason})`,
        metadata: JSON.stringify({
          declineReason: body.declineReason,
          reason: reasonText,
          clientName: proposal.client.name,
        }),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.json({
      success: true,
      data: { ...updatedProposal, ...proposalMoneyForApi(updatedProposal) },
      message: 'Proposal marked as lost',
    });
  })
);

/**
 * GET /api/proposals/:id/pdf
 * Generate proposal PDF
 */
router.get(
  '/:id/pdf',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const proposal = await prisma.proposal.findFirst({
      where: {
        id,
        tenantId: req.tenantId,
      },
    });

    if (!proposal) {
      throw new ApiError('NOT_FOUND', 'Proposal not found', 404);
    }

    // Generate PDF
    const pdfBuffer = await PDFGenerator.generateProposal(id);

    // Set headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="proposal-${proposal.reference}.pdf"`
    );
    res.send(pdfBuffer);
  })
);

/**
 * POST /api/proposals/:id/view
 * Record proposal view and update status to VIEWED
 */
router.post(
  '/:id/view',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const proposal = await prisma.proposal.findFirst({
      where: {
        id,
        tenantId: req.tenantId,
      },
    });

    if (!proposal) {
      throw new ApiError('NOT_FOUND', 'Proposal not found', 404);
    }

    // Client opens are tracked via GET /api/proposals/view/:token (ProposalView rows).
    // Staff opening this page must not change SENT → VIEWED or inflate client metrics.
    res.json({
      success: true,
      data: {
        message: 'OK',
        status: proposal.status,
      },
    });
  })
);

/**
 * GET /api/proposals/:id/activity
 * Get proposal activity log
 */
router.get(
  '/:id/activity',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const proposal = await prisma.proposal.findFirst({
      where: {
        id,
        tenantId: req.tenantId,
      },
    });

    if (!proposal) {
      throw new ApiError('NOT_FOUND', 'Proposal not found', 404);
    }

    const activities = await prisma.activityLog.findMany({
      where: {
        entityType: 'PROPOSAL',
        entityId: id,
        tenantId: req.tenantId,
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: activities,
    });
  })
);

export default router;
