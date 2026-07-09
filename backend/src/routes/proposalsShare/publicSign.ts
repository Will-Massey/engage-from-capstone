/**
 * Public e-signature, decline, and post-sign payment routes (share-token access)
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { getFrontendUrl } from '../../config/urls.js';
import { asyncHandler, ApiError } from '../../middleware/errorHandler.js';
import {
  getProposalByShareToken,
  recordElectronicSignature,
} from '../../services/proposalSharingService.js';
import { tenantMailer } from '../../services/tenantMailer.js';
import logger from '../../config/logger.js';
import { logPublicAiUsage } from '../../services/ai/publicProposalAiService.js';
import { classifyDeclineReasonText } from '../../services/ai/winLossAiService.js';
import { DECLINE_REASONS } from '../../constants/declineReasons.js';
import { parseProposalCustomFields, getRequiredSigners } from '../../utils/proposalCustomFields.js';
import {
  createPostSignMandate,
  skipPaymentSetup,
  getPublicPaymentConfig,
  shouldCollectPaymentAtSign,
} from '../../services/paymentCollection.js';
import {
  AGREEMENT_VERSION,
  DEFAULT_CONSENT_TEXT,
  hashProposalDocument,
  hashTerms,
  lookupGeoFromIp,
} from '../../utils/signatureAudit.js';
import { proposalRequiresPayment } from '../../services/paymentCollection.js';
import { escapeHtml } from '../../utils/escapeHtml.js';
import { hashShareToken, publicSignDeclineLimiter } from './shared.js';

const router = Router();

// Submit electronic signature (public — link possession = access)
router.post(
  '/view/:token/sign',
  publicSignDeclineLimiter,
  asyncHandler(async (req, res) => {
    const schema = z.object({
      signedBy: z.string().min(2),
      signedByRole: z.string().min(2),
      signerEmail: z.string().email(),
      signatureData: z.string().min(100),
      agreementAccepted: z.boolean(),
      engagementLetterAccepted: z.boolean().optional(),
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

    if (proposal.validUntil && new Date() > proposal.validUntil) {
      throw new ApiError(
        'PROPOSAL_EXPIRED',
        'This proposal has expired and can no longer be signed',
        410
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

    const fullForHashEarly = await prisma.proposal.findUnique({
      where: { id: proposal.id },
      select: { engagementLetter: true },
    });
    const hasEngagementLetter = Boolean(fullForHashEarly?.engagementLetter?.trim());
    if (hasEngagementLetter && !parsed.engagementLetterAccepted) {
      throw new ApiError(
        'ENGAGEMENT_LETTER_REQUIRED',
        'You must accept the engagement letter',
        400
      );
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
        const { sendPracticeAcceptanceNotifications } =
          await import('../../services/acceptanceNotificationService.js');
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

    if (result.fullyAccepted) {
      await prisma.proposal.update({
        where: { id: proposal.id },
        data: {
          termsAccepted: true,
          termsAcceptedAt: new Date(),
          engagementLetterAccepted: hasEngagementLetter
            ? parsed.engagementLetterAccepted === true
            : false,
          engagementLetterAcceptedAt: hasEngagementLetter ? new Date() : null,
        },
      });
    }

    const collectPayment =
      result.fullyAccepted &&
      proposalRequiresPayment(proposal.total) &&
      (await shouldCollectPaymentAtSign(proposal.tenantId));

    const paymentConfig = result.fullyAccepted
      ? await getPublicPaymentConfig(proposal.id, proposal.tenantId)
      : null;

    res.json({
      success: true,
      message: collectPayment
        ? 'Proposal accepted — please complete payment to confirm your engagement'
        : 'Proposal accepted successfully',
      data: {
        acceptedAt: result.fullyAccepted ? new Date() : undefined,
        acceptedBy: result.fullyAccepted ? parsed.signedBy : undefined,
        signatureId: result.signatureId,
        paymentRequired: collectPayment,
        payment: paymentConfig,
      },
    });
  })
);

// Post-sign payment setup (public — share token)
router.post(
  '/view/:token/payment/setup',
  asyncHandler(async (req, res) => {
    const { token } = req.params;
    const schema = z.object({
      preferredMethod: z.enum(['card']).optional(),
      paymentAuthAccepted: z.boolean(),
    });
    const { preferredMethod, paymentAuthAccepted } = schema.parse(req.body ?? {});

    if (!paymentAuthAccepted) {
      throw new ApiError(
        'PAYMENT_AUTH_REQUIRED',
        'Client payment authorisation must be accepted',
        400
      );
    }

    const proposal = await getProposalByShareToken(token);
    if (!proposal) {
      throw new ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found or link expired', 404);
    }

    if (proposal.status !== 'ACCEPTED') {
      throw new ApiError(
        'INVALID_STATUS',
        'Payment setup is only available after the proposal is accepted',
        400
      );
    }

    try {
      const result = await createPostSignMandate(proposal.id, {
        preferredMethod: preferredMethod || 'card',
        paymentAuthAccepted,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error: unknown) {
      logger.error('Post-sign payment setup failed:', error);
      throw new ApiError('PAYMENT_SETUP_FAILED', 'Failed to set up payment', 400);
    }
  })
);

// Skip post-sign payment (public — share token)
router.post(
  '/view/:token/payment/skip',
  asyncHandler(async (req, res) => {
    const skipSchema = z.object({
      acknowledged: z.literal(true),
      reason: z.string().max(500).optional(),
    });
    const { reason } = skipSchema.parse(req.body ?? {});
    const { token } = req.params;

    const proposal = await getProposalByShareToken(token);
    if (!proposal) {
      throw new ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found or link expired', 404);
    }

    if (proposal.status !== 'ACCEPTED') {
      throw new ApiError('INVALID_STATUS', 'Only accepted proposals can skip payment setup', 400);
    }

    const paymentConfig = await getPublicPaymentConfig(proposal.id, proposal.tenantId);
    if (!paymentConfig.paymentRequired) {
      throw new ApiError(
        'PAYMENT_SKIP_NOT_ALLOWED',
        'Payment setup is not required for this proposal',
        400
      );
    }

    if (proposal.paymentStatus === 'COMPLETED' || proposal.paymentStatus === 'SKIPPED') {
      throw new ApiError('ALREADY_RESOLVED', 'Payment status is already finalised', 400);
    }

    await skipPaymentSetup(proposal.id);

    logger.info('Payment setup skipped by client', {
      proposalId: proposal.id,
      tenantId: proposal.tenantId,
      tokenHash: hashShareToken(token),
      reason: reason?.trim() || null,
      ip: req.ip,
    });

    try {
      const fullProposal = await prisma.proposal.findUnique({
        where: { id: proposal.id },
        include: {
          client: true,
          createdBy: { select: { email: true, firstName: true, lastName: true } },
        },
      });

      const notifyEmail = fullProposal?.createdBy?.email;
      if (notifyEmail && fullProposal) {
        const subject = `Payment setup skipped: ${fullProposal.reference}`;
        const text = [
          'A client signed your proposal but chose to set up payment later.',
          '',
          `Client: ${fullProposal.client.name}`,
          `Proposal: ${fullProposal.title} (${fullProposal.reference})`,
          reason?.trim() ? `Note: ${reason.trim()}` : '',
          '',
          `View in Engage: ${getFrontendUrl()}/proposals/${proposal.id}`,
        ]
          .filter(Boolean)
          .join('\n');

        await tenantMailer.send({
          tenantId: proposal.tenantId,
          messageType: 'OTHER',
          message: {
            to: notifyEmail,
            subject,
            text,
            // Escape share-token-holder input (reason, names) before building HTML
            html: escapeHtml(text).replace(/\n/g, '<br>'),
          },
          relatedIds: { proposalId: proposal.id, clientId: fullProposal.clientId },
        });
      }
    } catch (error) {
      logger.error('Failed to send payment skip notification:', error);
    }

    res.json({
      success: true,
      message: 'Payment setup skipped',
      data: { paymentStatus: 'SKIPPED' },
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
  publicSignDeclineLimiter,
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
    if (proposal.validUntil && new Date() > proposal.validUntil) {
      throw new ApiError(
        'PROPOSAL_EXPIRED',
        'This proposal has expired and can no longer be declined',
        410
      );
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
            // Escape share-token-holder input (reason, names) before building HTML
            html: escapeHtml(text).replace(/\n/g, '<br>'),
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

export default router;
