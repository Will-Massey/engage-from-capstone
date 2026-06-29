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
  getAiAttentionQueue,
  isAiConfigured,
  logAiUsage,
  quickAsk,
  executeQuickAction,
  suggestProposalServices,
  reviewProposalDraft,
  suggestProposalTitle,
} from '../services/ai/proposalAiService.js';
import {
  generateProposalSendEmail,
  generateProposalSendEmailFromDraft,
  type ProposalEmailDraftInput,
} from '../services/ai/proposalAiEmailService.js';
import { autoFitProposal, generateClientBrief } from '../services/ai/clientFitService.js';
import { generateFollowUpEmail } from '../services/ai/lifecycleAiEmailService.js';
import { checkAiTokenBudget, getAiStatusMeta } from '../services/ai/aiClient.js';
import { getRegulatoryAlerts } from '../services/ai/regulatoryWatcherService.js';
import { getBenchmarkPricing } from '../services/ai/benchmarkPricingService.js';
import { draftProposalFromVoice } from '../services/ai/voiceProposalService.js';
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
  asyncHandler(async (req, res) => {
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
          'suggest_title',
          'draft_review',
          'cover_letter',
          'follow_up',
          'follow_up_send_preview',
          'engagement_letter',
          'proposal_health',
          'renewal_draft',
          'command',
          'proposal_email_draft',
          'client_brief',
          'auto_fit',
          'attention_queue',
          'regulatory_watcher',
          'benchmark_pricing',
          'voice_proposal',
        ],
        tokenBudget: await checkAiTokenBudget(req.tenantId!),
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

/** POST /api/ai/follow-up-send-preview — draft only (what automation would send), no email sent */
router.post(
  '/follow-up-send-preview',
  asyncHandler(async (req, res) => {
    const { proposalId, tone } = z
      .object({
        proposalId: z.string().uuid(),
        tone: z.enum(['professional', 'friendly', 'urgent']).default('professional'),
      })
      .parse(req.body);

    if (!isAiConfigured()) {
      throw new ApiError(
        'AI_NOT_CONFIGURED',
        `${AI_COPILOT.name} is not available — preview requires AI to be configured`,
        503
      );
    }

    const draft = await generateFollowUpEmail(req.tenantId!, proposalId, tone);
    res.json({
      success: true,
      data: {
        ...draft,
        requiresApproval: true,
        proposalId,
        previewOnly: true,
      },
    });
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

/** POST /api/ai/draft-review — pre-send checklist for unsaved proposals */
router.post(
  '/draft-review',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        clientId: z.string().uuid(),
        title: z.string().max(200).optional(),
        coverLetter: z.string().max(12000).optional(),
        validUntil: z.string().optional(),
        services: z.array(
          z.object({
            name: z.string(),
            billingFrequency: z.string().optional(),
            displayPrice: z.number().optional(),
          })
        ),
      })
      .parse(req.body);

    const data = await reviewProposalDraft(req.tenantId!, req.user?.id, {
      clientId: body.clientId,
      title: body.title,
      coverLetter: body.coverLetter,
      validUntil: body.validUntil,
      services: body.services.map((s) => ({
        name: s.name,
        billingFrequency: s.billingFrequency,
        displayPrice: s.displayPrice,
      })),
    });
    res.json({ success: true, data });
  })
);

/** POST /api/ai/suggest-title */
router.post(
  '/suggest-title',
  asyncHandler(async (req, res) => {
    const { clientId, services } = z
      .object({
        clientId: z.string().uuid(),
        services: z.array(
          z.object({
            name: z.string(),
            billingFrequency: z.string().optional(),
          })
        ),
      })
      .parse(req.body);

    const data = await suggestProposalTitle(
      req.tenantId!,
      req.user?.id,
      clientId,
      services.map((s) => ({ name: s.name, billingFrequency: s.billingFrequency }))
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

const proposalEmailDraftServiceSchema = z.object({
  name: z.string(),
  billingFrequency: z.string().optional(),
  displayPrice: z.number().optional(),
});

const proposalEmailDraftInputSchema = z.object({
  clientId: z.string().uuid(),
  title: z.string().max(200).optional(),
  reference: z.string().max(50).optional(),
  coverLetter: z.string().max(12000).optional(),
  validUntil: z.string().optional(),
  viewLink: z.string().url().optional(),
  services: z.array(proposalEmailDraftServiceSchema),
  senderName: z.string().optional(),
  senderEmail: z.string().email().optional(),
  practiceName: z.string().optional(),
});

/** POST /api/ai/proposal-email-draft — Clara send email (saved proposal or unsaved draft) */
router.post(
  '/proposal-email-draft',
  asyncHandler(async (req, res) => {
    const proposalId = z.string().uuid().optional().parse(req.body.proposalId);

    if (proposalId) {
      const data = await generateProposalSendEmail(req.tenantId!, req.user?.id, proposalId);
      return res.json({ success: true, data });
    }

    const draftPayload = req.body.draft ?? req.body;
    const draft = proposalEmailDraftInputSchema.parse(draftPayload) as ProposalEmailDraftInput;
    const data = await generateProposalSendEmailFromDraft(req.tenantId!, req.user?.id, draft);
    res.json({ success: true, data });
  })
);

/** POST /api/ai/client-brief/:clientId */
router.post(
  '/client-brief/:clientId',
  asyncHandler(async (req, res) => {
    const clientId = z.string().uuid().parse(req.params.clientId);
    const data = await generateClientBrief(req.tenantId!, req.user?.id, clientId);
    res.json({ success: true, data });
  })
);

/** POST /api/ai/auto-fit */
router.post(
  '/auto-fit',
  asyncHandler(async (req, res) => {
    const { clientId } = z.object({ clientId: z.string().uuid() }).parse(req.body);
    const data = await autoFitProposal(req.tenantId!, req.user?.id, clientId);
    res.json({ success: true, data });
  })
);

/** GET /api/ai/attention-queue — top 10 proposals needing action */
router.get(
  '/attention-queue',
  asyncHandler(async (req, res) => {
    const data = await getAiAttentionQueue(req.tenantId!, req.user?.id);
    res.json({ success: true, data });
  })
);

/** GET /api/ai/regulatory-alerts — Phase 5 regulatory watcher stub */
router.get(
  '/regulatory-alerts',
  asyncHandler(async (req, res) => {
    const data = await getRegulatoryAlerts(req.tenantId!, req.user?.id);
    res.json({ success: true, data });
  })
);

/** GET /api/ai/benchmark-pricing — Phase 5 anonymised fee bands (stub) */
router.get(
  '/benchmark-pricing',
  asyncHandler(async (req, res) => {
    const services = z
      .string()
      .optional()
      .parse(req.query.services as string | undefined);
    const serviceNames = services ? services.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    const data = await getBenchmarkPricing(req.tenantId!, req.user?.id, serviceNames);
    res.json({ success: true, data });
  })
);

/** POST /api/ai/voice-proposal — Phase 5 voice transcript → structured draft */
router.post(
  '/voice-proposal',
  asyncHandler(async (req, res) => {
    const { clientId, transcript } = z
      .object({
        clientId: z.string().uuid(),
        transcript: z.string().min(20).max(8000),
      })
      .parse(req.body);
    const data = await draftProposalFromVoice(req.tenantId!, req.user?.id, { clientId, transcript });
    res.json({ success: true, data });
  })
);

export default router;
