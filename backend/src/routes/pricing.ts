/**
 * Phase W2.9 — Pricing methodology API (rule engine, optional Clara explain).
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import {
  suggestFees,
  attachTenantServiceIds,
  normaliseName,
  type PricingMethodologyInput,
  type PricingMethodologyResult,
} from '../services/pricingMethodology.js';
import { chatCompletion, checkAiTokenBudget, isAiConfigured } from '../services/ai/aiClient.js';
import { AI_COPILOT } from '../config/aiCopilot.js';
import { calculateContingentFee } from '../services/contingentFeeCalculator.js';

const router = Router();

router.use(authenticate);

const pricingInputSchema = z.object({
  turnoverBand: z.enum([
    'UNDER_50K',
    'BAND_50K_100K',
    'BAND_100K_250K',
    'BAND_250K_500K',
    'BAND_500K_1M',
    'OVER_1M',
  ]),
  entityType: z.enum(['LIMITED_COMPANY', 'SOLE_TRADER', 'LLP', 'PARTNERSHIP']),
  employeeCount: z.number().int().min(0).max(500).default(0),
  vatRegistered: z.boolean().default(false),
  mtdStatus: z
    .enum(['NOT_APPLICABLE', 'NOT_REGISTERED', 'REGISTERED', 'FULLY_COMPLIANT'])
    .default('NOT_APPLICABLE'),
  complexity: z
    .object({
      hasPayroll: z.boolean().default(false),
      hasRd: z.boolean().default(false),
      multiSite: z.boolean().default(false),
    })
    .default({ hasPayroll: false, hasRd: false, multiSite: false }),
});

/**
 * POST /api/pricing/suggest-fees
 * Rule-based fee suggestions — no LLM.
 */
router.post(
  '/suggest-fees',
  asyncHandler(async (req, res) => {
    const input = pricingInputSchema.parse(req.body) as PricingMethodologyInput;
    const tenantId = req.tenantId!;

    const tenantServices = await prisma.serviceTemplate.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, priceAmount: true, basePrice: true },
    });

    const tenantBaselines = new Map<string, number>();
    for (const svc of tenantServices) {
      const price = svc.priceAmount ?? svc.basePrice ?? undefined;
      if (price != null && price > 0) {
        tenantBaselines.set(normaliseName(svc.name), Number(price));
      }
    }

    let result = suggestFees(input, tenantBaselines);
    result = attachTenantServiceIds(result, tenantServices);

    res.json({ success: true, data: result });
  })
);

/**
 * POST /api/pricing/explain
 * Optional single Clara paragraph — only when user clicks "Explain pricing".
 */
router.post(
  '/explain',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        suggestion: z.object({
          inputs: pricingInputSchema,
          services: z.array(z.any()),
          totals: z.object({
            monthlySuggested: z.number(),
            annualSuggested: z.number(),
          }),
        }),
      })
      .parse(req.body);

    if (!isAiConfigured()) {
      throw new ApiError('AI_NOT_CONFIGURED', `${AI_COPILOT.name} is not configured on this server`, 503);
    }

    const budget = await checkAiTokenBudget(req.tenantId!);
    if (!budget.withinBudget) {
      throw new ApiError(
        'AI_BUDGET_EXCEEDED',
        `${AI_COPILOT.name} monthly usage limit reached`,
        429
      );
    }

    const { inputs, services, totals } = body.suggestion;
    const serviceSummary = (services as PricingMethodologyResult['services'])
      .slice(0, 8)
      .map((s) => `${s.catalogName}: £${s.suggestedPrice}/${s.billingCycle.toLowerCase()}`)
      .join('; ');

    const prompt = `Explain in ONE short paragraph (max 80 words) why these UK accountancy fees were suggested.
Entity: ${inputs.entityType.replace(/_/g, ' ')}. Turnover band: ${inputs.turnoverBand}.
Monthly total ~£${totals.monthlySuggested}, annual ~£${totals.annualSuggested}.
Services: ${serviceSummary}.
Use UK English and GBP. Be professional, no bullet points.`;

    const { content: explanation } = await chatCompletion(
      [
        {
          role: 'system',
          content:
            'You are Clara, a UK accountancy pricing adviser. One concise paragraph only. No JSON.',
        },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.4, maxTokens: 120 }
    );

    res.json({
      success: true,
      data: {
        explanation: explanation.trim(),
        tokensUsed: 'minimal',
      },
    });
  })
);

const contingentFeeSchema = z.object({
  estimatedSavingGbp: z.number().positive().max(100_000_000),
  percentOfSaving: z.number().positive().max(100),
  capGbp: z.number().nonnegative().optional(),
  floorGbp: z.number().nonnegative().optional(),
});

/**
 * POST /api/pricing/contingent-fee
 * Contingent fee for tax advisory — percent of estimated saving with optional cap/floor.
 */
router.post(
  '/contingent-fee',
  asyncHandler(async (req, res) => {
    const input = contingentFeeSchema.parse(req.body);

    try {
      const result = calculateContingentFee(input);
      res.json({ success: true, data: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid contingent fee inputs';
      throw new ApiError('INVALID_CONTINGENT_FEE', message, 400);
    }
  })
);

export default router;