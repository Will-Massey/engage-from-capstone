import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import {
  assembleAiEngagementLetter,
  executeAiCommand,
  generateAiCoverLetter,
  generateAiFollowUp,
  generateRenewalDraft,
  getProposalHealth,
  isAiConfigured,
  logAiUsage,
  quickAsk,
  executeQuickAction,
  suggestProposalServices,
} from '../services/ai/proposalAiService.js';
import { getAiStatusMeta } from '../services/ai/aiClient.js';
import { AI_COPILOT } from '../config/aiCopilot.js';

const router = Router();

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT', message: `Too many requests for ${AI_COPILOT.name}. Please wait a few minutes.` },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(aiLimiter);
router.use(authenticate);
router.use(authorize('ADMIN', 'PARTNER', 'MANAGER', 'SENIOR'));

/** GET /api/ai/status */
router.get(
  '/status',
  asyncHandler(async (_req, res) => {
    const meta = getAiStatusMeta();
    res.json({
      success: true,
      data: {
        configured: meta.configured,
        assistant: {
          name: AI_COPILOT.name,
          tagline: AI_COPILOT.tagline,
          status: meta.configured ? 'ready' : 'unavailable',
        },
        features: [
          'suggest_services',
          'cover_letter',
          'follow_up',
          'engagement_letter',
          'proposal_health',
          'renewal_draft',
          'command',
        ],
      },
    });
  })
);

/** POST /api/ai/suggest-services */
router.post(
  '/suggest-services',
  asyncHandler(async (req, res) => {
    const { clientId } = z.object({ clientId: z.string().uuid() }).parse(req.body);
    const data = await suggestProposalServices(req.tenantId!, req.user?.id, clientId);
    res.json({ success: true, data });
  })
);

/** POST /api/ai/cover-letter */
router.post(
  '/cover-letter',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        clientId: z.string().uuid(),
        tone: z.enum(['PROFESSIONAL', 'FRIENDLY', 'MODERN']).default('PROFESSIONAL'),
        practiceName: z.string(),
        senderName: z.string().optional(),
        services: z.array(
          z.object({
            name: z.string(),
            billingFrequency: z.string().optional(),
            displayPrice: z.number().optional(),
          })
        ),
      })
      .parse(req.body);

    const data = await generateAiCoverLetter(req.tenantId!, req.user?.id, {
      clientId: body.clientId,
      tone: body.tone,
      practiceName: body.practiceName,
      senderName: body.senderName,
      services: body.services.map((s) => ({
        name: s.name,
        billingFrequency: s.billingFrequency,
        displayPrice: s.displayPrice,
      })),
    });
    res.json({ success: true, data });
  })
);

/** POST /api/ai/follow-up */
router.post(
  '/follow-up',
  asyncHandler(async (req, res) => {
    const { proposalId, tone } = z
      .object({
        proposalId: z.string().uuid(),
        tone: z.enum(['professional', 'friendly', 'urgent']).default('professional'),
      })
      .parse(req.body);

    const data = await generateAiFollowUp(req.tenantId!, req.user?.id, proposalId, tone);
    res.json({ success: true, data });
  })
);

/** POST /api/ai/engagement-letter */
router.post(
  '/engagement-letter',
  asyncHandler(async (req, res) => {
    const { proposalId } = z.object({ proposalId: z.string().uuid() }).parse(req.body);
    const data = await assembleAiEngagementLetter(req.tenantId!, req.user?.id, proposalId);
    res.json({ success: true, data });
  })
);

/** GET /api/ai/proposal-health/:proposalId */
router.get(
  '/proposal-health/:proposalId',
  asyncHandler(async (req, res) => {
    const data = await getProposalHealth(req.tenantId!, req.user?.id, req.params.proposalId);
    res.json({ success: true, data });
  })
);

/** POST /api/ai/renewal-draft */
router.post(
  '/renewal-draft',
  asyncHandler(async (req, res) => {
    const { proposalId, upliftPercent } = z
      .object({
        proposalId: z.string().uuid(),
        upliftPercent: z.number().min(0).max(50).default(0),
      })
      .parse(req.body);

    const data = await generateRenewalDraft(
      req.tenantId!,
      req.user?.id,
      proposalId,
      upliftPercent
    );
    res.json({ success: true, data });
  })
);

/** POST /api/ai/quick — low-token assistant (ask + contextual actions) */
router.post(
  '/quick',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        mode: z.enum(['ask', 'health', 'follow_up', 'suggest_services']),
        query: z.string().max(400).optional(),
        context: z
          .object({
            proposalId: z.string().uuid().optional(),
            clientId: z.string().uuid().optional(),
            page: z.string().max(120).optional(),
          })
          .optional(),
      })
      .parse(req.body);

    if (body.mode === 'ask') {
      if (!body.query?.trim()) {
        throw new ApiError('VALIDATION', 'Query required for ask mode', 400);
      }
      const data = await quickAsk(req.tenantId!, req.user?.id, body.query.trim(), body.context);
      return res.json({ success: true, data });
    }

    const data = await executeQuickAction(req.tenantId!, req.user?.id, body.mode, body.context || {});
    res.json({ success: true, data });
  })
);

/** POST /api/ai/command */
router.post(
  '/command',
  asyncHandler(async (req, res) => {
    const { query, context } = z
      .object({
        query: z.string().min(2).max(500),
        context: z
          .object({
            proposalId: z.string().uuid().optional(),
            clientId: z.string().uuid().optional(),
          })
          .optional(),
      })
      .parse(req.body);

    const data = await executeAiCommand(req.tenantId!, req.user?.id, query, context);
    res.json({ success: true, data });
  })
);

/** POST /api/ai/feedback */
router.post(
  '/feedback',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        feature: z.string(),
        helpful: z.boolean(),
        comment: z.string().optional(),
        proposalId: z.string().uuid().optional(),
      })
      .parse(req.body);

    await logAiUsage(req.tenantId!, req.user?.id, 'AI_FEEDBACK', body);
    res.json({ success: true, data: { recorded: true } });
  })
);

export default router;
