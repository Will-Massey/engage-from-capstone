import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { UpliftRules } from '../../services/renewalProposalService.js';

const router = Router();

/**
 * POST /api/proposals/:id/create-renewal
 * Create a renewal proposal from an existing accepted proposal
 */
router.post(
  '/:id/create-renewal',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER', 'SENIOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const upliftRulesSchema = z.object({
      mode: z.enum(['percent', 'cpi', 'min_floor']),
      percent: z.number().min(-50).max(50).optional(),
      cpiPercent: z.number().min(0).max(50).optional(),
      minFeeGbp: z.number().min(0).optional(),
      perServiceFloors: z.record(z.string(), z.number().min(0)).optional(),
    });

    const body = z
      .object({
        upliftPercent: z.number().min(-50).max(50).optional(),
        upliftRules: upliftRulesSchema.optional(),
        templateId: z.string().uuid().optional(),
        useAiCoverLetter: z.boolean().optional(),
      })
      .parse(req.body ?? {});

    const { createRenewalDraft } = await import('../../services/renewalProposalService.js');

    const renewalProposal = await createRenewalDraft(req.tenantId!, req.user!.id, id, {
      upliftPercent: body.upliftPercent,
      upliftRules: body.upliftRules as UpliftRules | undefined,
      templateId: body.templateId,
      useAiCoverLetter: body.useAiCoverLetter,
    });

    res.status(201).json({
      success: true,
      data: renewalProposal,
      message: 'Renewal proposal created successfully',
    });
  })
);

export default router;
