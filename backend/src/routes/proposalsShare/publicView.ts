/**
 * Public proposal viewing, AI Q&A, and terms routes (share-token access)
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { asyncHandler, ApiError } from '../../middleware/errorHandler.js';
import { generateProposalTerms } from '../../templates/ukEngagementLetter.js';
import {
  getProposalByShareToken,
  trackProposalView,
} from '../../services/proposalSharingService.js';
import logger from '../../config/logger.js';
import {
  askPublicProposalQuestion,
  getPublicSigningSummary,
} from '../../services/ai/publicProposalAiService.js';
import {
  parseProposalCustomFields,
  getRequiredSigners,
  hasPricingTiers,
  calculateTierTotals,
  findPricingTier,
} from '../../utils/proposalCustomFields.js';
import { getPublicPaymentConfig } from '../../services/paymentCollection.js';
import { publicProposalAiLimiter } from './shared.js';

const router = Router();

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
    await trackProposalView(proposal.id, req.ip || null, req.headers['user-agent'] || null);

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
      throw new ApiError(
        'PROPOSAL_ALREADY_ACCEPTED',
        'This proposal has already been accepted',
        400
      );
    }

    const result = await getPublicSigningSummary(proposal);

    logger.info('Public signing summary generated', {
      proposalRef: proposal.reference,
      source: result.source,
    });

    const { computeSigningCostSummary } =
      await import('../../services/ai/publicProposalAiService.js');

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
      throw new ApiError(
        'PROPOSAL_ALREADY_ACCEPTED',
        'This proposal has already been accepted',
        400
      );
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

export default router;
