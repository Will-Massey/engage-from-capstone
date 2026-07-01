import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import {
  assembleAiEngagementLetter,
  assembleAiEngagementLetterStream,
  executeAiCommand,
  generateAiCoverLetter,
  generateAiCoverLetterStream,
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
  generateEmailContentStream,
  type ProposalEmailDraftInput,
} from '../services/ai/proposalAiEmailService.js';
import { chatCompletion } from '../services/ai/aiClient.js';
import { autoFitProposal, generateClientBrief } from '../services/ai/clientFitService.js';
import { generateFollowUpEmail } from '../services/ai/lifecycleAiEmailService.js';
import { checkAiTokenBudget, getAiStatusMeta } from '../services/ai/aiClient.js';
import { AI_FEATURE_FLAGS } from '../config/featureFlags.js';
import { getRegulatoryAlerts } from '../services/ai/regulatoryWatcherService.js';
import { getBenchmarkPricing } from '../services/ai/benchmarkPricingService.js';
import { draftProposalFromVoice } from '../services/ai/voiceProposalService.js';
import { AI_COPILOT } from '../config/aiCopilot.js';
import { shouldSkipRateLimit } from '../utils/securityFlags.js';

const router = Router();

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 80,
  skip: (req) => shouldSkipRateLimit(req.headers),
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
          'cover_letter_stream',
          'follow_up',
          'follow_up_send_preview',
          'engagement_letter',
          'engagement_letter_stream',
          'proposal_health',
          'renewal_draft',
          'command',
          'proposal_email_draft',
          'proposal_email_draft_stream',
          'email_revise',
          'cover_letter_revise',
          'suggest_email_subjects',
          'suggest_email_ctas',
          'analyze_email',
          'revise_services',
          'client_brief',
          'auto_fit',
          'attention_queue',
          ...(AI_FEATURE_FLAGS.regulatoryWatcher ? (['regulatory_watcher'] as const) : []),
          ...(AI_FEATURE_FLAGS.benchmarkPricing ? (['benchmark_pricing'] as const) : []),
          'voice_proposal',
        ],
        featureFlags: AI_FEATURE_FLAGS,
        tokenBudget: await checkAiTokenBudget(req.tenantId!),
        usageSummary:
          'Monthly AI usage from logged provider tokens where available; older calls use an estimate until refreshed.',
      },
    });
  })
);

/** GET /api/ai/empty-suggestion — micro cheap tip for empty states (Clara powered, 1-2 sentences, tiny tokens) */
router.get(
  '/empty-suggestion',
  asyncHandler(async (req, res) => {
    const context = String(req.query.context || 'general').slice(0, 40);
    // Tiny prompt only — low token cost, UK English, encouraging + actionable
    const { content: raw } = await chatCompletion(
      [
        { role: 'system', content: 'You are Clara, concise helpful UK accountancy AI. Output 1-2 sentences only. Use UK spelling.' },
        { role: 'user', content: `Empty ${context} list. Give 1 encouraging actionable tip (max 35 words) for a UK accountant user starting with Engage app. No intro, no quotes.` },
      ],
      { temperature: 0.55, maxTokens: 55 }
    );
    const tip = (raw || '').trim().replace(/^["']|["']$/g, '').slice(0, 220);
    res.json({ success: true, data: { tip } });
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
    const { proposalId, includeAiIntro } = z
      .object({
        proposalId: z.string().uuid(),
        includeAiIntro: z.boolean().optional().default(false),
      })
      .parse(req.body);
    const data = await assembleAiEngagementLetter(req.tenantId!, req.user?.id, proposalId, {
      includeAiIntro,
    });
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
        upliftPercent: z.number().min(-50).max(50).default(0),
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

/** POST /api/ai/suggest-title — cheap title suggestion; generalized to support clientName for unsaved drafts */
router.post(
  '/suggest-title',
  asyncHandler(async (req, res) => {
    const { clientId, clientName, services } = z
      .object({
        clientId: z.string().uuid().optional(),
        clientName: z.string().optional(),
        services: z.array(
          z.object({
            name: z.string(),
            billingFrequency: z.string().optional(),
          })
        ),
      })
      .parse(req.body);

    if (clientId) {
      const data = await suggestProposalTitle(
        req.tenantId!,
        req.user?.id,
        clientId,
        services.map((s) => ({ name: s.name, billingFrequency: s.billingFrequency }))
      );
      return res.json({ success: true, data });
    }

    // generalized cheap direct path (no client load) for drafts
    const nameForTitle = clientName || 'the client';
    const svcNames = services.map((s) => s.name).join(', ') || 'general engagement';
    const { content: raw } = await chatCompletion(
      [
        { role: 'system', content: 'You are concise. Output only the JSON requested.' },
        { role: 'user', content: `Suggest a professional UK accountancy proposal title (max 8 words). Return JSON: { "title": "..." }
Client: ${nameForTitle}
Services: ${svcNames}` },
      ],
      { temperature: 0.4, maxTokens: 80 }
    );
    let title = `Proposal for ${nameForTitle}`;
    try { title = JSON.parse(raw).title?.trim() || title; } catch {}
    res.json({ success: true, data: { title } });
  })
);

/** Very cheap revise/tweak for services list or pricing notes (tiny token, high ROI for pricing advisor) */
router.post(
  '/revise-services',
  asyncHandler(async (req, res) => {
    const { services, instruction, clientContext } = z
      .object({
        services: z.array(
          z.object({
            name: z.string(),
            billingFrequency: z.string().optional(),
            displayPrice: z.number().optional(),
          })
        ),
        instruction: z.string().min(3).max(150),
        clientContext: z.any().optional(),
      })
      .parse(req.body);

    const prompt = `UK accountancy pricing tweak. Services: ${JSON.stringify(services).slice(0, 300)}
Instruction: ${instruction}
Context: ${JSON.stringify(clientContext || {}).slice(0, 200)}
Return ONLY JSON { "revised": [same shape], "notes": "short UK English advice" }. Keep prices realistic.`;

    const { content: raw } = await chatCompletion(
      [
        { role: 'system', content: 'Return only valid compact JSON. Be concise.' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.35, maxTokens: 280 }
    );

    let revised: any[] = services;
    let notes = '';
    try {
      const p = JSON.parse(raw);
      revised = Array.isArray(p.revised) ? p.revised : services;
      notes = typeof p.notes === 'string' ? p.notes.trim() : '';
    } catch {
      notes = raw.trim().slice(0, 200);
    }

    res.json({ success: true, data: { revisedServices: revised.slice(0, services.length), notes } });
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

/** Cheap low-token email revision (max impact tweak) */
router.post(
  '/email-revise',
  asyncHandler(async (req, res) => {
    const { currentBody, instruction, context } = z
      .object({
        currentBody: z.string().min(20),
        instruction: z.string().min(3).max(200),
        context: z.any().optional(),
      })
      .parse(req.body);

    const prompt = `You are an expert UK accountant communicator.
Current email body:
${currentBody}

Instruction: ${instruction}
Context (client + proposal summary): ${JSON.stringify(context || {}).slice(0, 600)}

Return ONLY the revised plain text body (no subject, no extra commentary). Keep professional UK tone.`;

    const { content: revised } = await (await import('../services/ai/aiClient.js')).chatCompletion(
      [
        { role: 'system', content: 'You are concise and precise.' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.4, maxTokens: 700 }
    );

    res.json({ success: true, data: { revisedBody: revised.trim() } });
  })
);

/** Cheap low-token revise for cover letter (same philosophy as email-revise) */
router.post(
  '/cover-letter-revise',
  asyncHandler(async (req, res) => {
    const { currentBody, instruction, context } = z
      .object({
        currentBody: z.string().min(20),
        instruction: z.string().min(3).max(200),
        context: z.any().optional(),
      })
      .parse(req.body);

    const prompt = `You are an expert UK accountant communicator.
Current cover letter:
${currentBody}

Instruction: ${instruction}
Context: ${JSON.stringify(context || {}).slice(0, 500)}

Return ONLY the revised plain text cover letter (no extra commentary). Keep professional UK tone and the original structure.`;

    const { content: revised } = await chatCompletion(
      [
        { role: 'system', content: 'You are concise and precise.' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.4, maxTokens: 600 }
    );

    res.json({ success: true, data: { revisedBody: revised.trim() } });
  })
);

/** Very cheap subject suggestions for the proposal email (max impact, tiny tokens) */
router.post(
  '/suggest-email-subjects',
  asyncHandler(async (req, res) => {
    const { body, context } = z
      .object({
        body: z.string().min(20),
        context: z.any().optional(),
      })
      .parse(req.body);

    const prompt = `Suggest 2-3 concise, professional subject lines for this UK accountancy proposal email.
Client: ${context?.clientName || 'the client'}
Proposal: ${context?.proposalTitle || 'the proposal'}

Current body (first 400 chars):
${body.slice(0, 400)}

Return ONLY a JSON array like: ["Subject one", "Subject two", "Subject three"]
No extra text.`;

    const { content: raw } = await chatCompletion(
      [
        { role: 'system', content: 'You output only valid JSON arrays of strings.' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.5, maxTokens: 80 }
    );

    let subjects: string[] = [];
    try {
      subjects = JSON.parse(raw);
      if (!Array.isArray(subjects)) subjects = [];
      subjects = subjects.slice(0, 3).map(s => String(s).trim()).filter(Boolean);
    } catch {
      // fallback: split lines
      subjects = raw.split(/\n/).map(s => s.replace(/^[-•\s"]+|["\s]+$/g, '').trim()).filter(Boolean).slice(0, 3);
    }

    if (subjects.length === 0) {
      subjects = [
        `Proposal for ${context?.clientName || 'you'}`,
        `Your engagement with ${context?.tenantName || 'us'}`,
      ];
    }

    res.json({ success: true, data: { subjects } });
  })
);

/** Very cheap CTA suggestions for the email body (tiny tokens, high impact) */
router.post(
  '/suggest-email-ctas',
  asyncHandler(async (req, res) => {
    const { body, context } = z
      .object({
        body: z.string().min(20),
        context: z.any().optional(),
      })
      .parse(req.body);

    const prompt = `From this UK accountancy proposal email body, suggest 2-3 stronger, clearer calls-to-action (CTAs).
Keep them short (one sentence each), professional, and client-friendly.

Body excerpt:
${body.slice(0, 600)}

Return ONLY a JSON array: ["CTA one here", "CTA two here"]
No extra text.`;

    const { content: raw } = await chatCompletion(
      [
        { role: 'system', content: 'You output only valid JSON arrays of strings.' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.5, maxTokens: 100 }
    );

    let ctas: string[] = [];
    try {
      ctas = JSON.parse(raw);
      if (!Array.isArray(ctas)) ctas = [];
      ctas = ctas.slice(0, 3).map(s => String(s).trim()).filter(Boolean);
    } catch {
      ctas = raw.split(/\n/).map(s => s.replace(/^[-•\s"]+|["\s]+$/g, '').trim()).filter(Boolean).slice(0, 3);
    }

    if (ctas.length === 0) {
      ctas = ['Please review and sign the attached proposal.', 'Let me know if you have any questions.'];
    }

    res.json({ success: true, data: { ctas } });
  })
);

/** Very cheap email health check (length, missing elements) - tiny token cost */
router.post(
  '/analyze-email',
  asyncHandler(async (req, res) => {
    const { body, context } = z
      .object({
        body: z.string().min(20),
        context: z.any().optional(),
      })
      .parse(req.body);

    const prompt = `Quickly review this UK accountancy proposal email body.
Flag issues for length, missing (fees/total, next steps, valid until, CTA, services), or tone.
Return tiny JSON: { "issues": ["short bullet"], "score": 85, "missing": ["fees"] } . Max 3 issues/missing. UK English.`;

    const { content: raw } = await chatCompletion(
      [
        { role: 'system', content: 'You are brief and only output the requested JSON.' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.3, maxTokens: 120 }
    );

    let issues: string[] = [];
    let score: number | undefined;
    let missing: string[] = [];
    try {
      const parsed = JSON.parse(raw);
      issues = Array.isArray(parsed.issues) ? parsed.issues.slice(0, 3) : [];
      score = typeof parsed.score === 'number' ? Math.max(0, Math.min(100, parsed.score)) : undefined;
      missing = Array.isArray(parsed.missing) ? parsed.missing.slice(0, 3) : [];
    } catch {
      // fallback simple parse
      issues = raw.split(/\n|•|-/).map(s => s.trim()).filter(s => s.length > 5 && s.length < 120).slice(0, 3);
    }

    res.json({ success: true, data: { issues, score, missing } });
  })
);

/** POST /api/ai/proposal-email-draft/stream — live streaming version for email preview (high impact, same token cost) */
router.post(
  '/proposal-email-draft/stream',
  asyncHandler(async (req, res) => {
    const proposalId = z.string().uuid().optional().parse(req.body.proposalId);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if ((res as any).flushHeaders) (res as any).flushHeaders();

    try {
      let payloadForStream: any;

      if (proposalId) {
        const ctx = await (await import('../services/ai/aiContextBuilder.js')).buildAiContext(req.tenantId!, { proposalId, userId: req.user?.id });
        if (!ctx.proposal || !ctx.client) throw new Error('Proposal or client not found');
        payloadForStream = {
          clientName: ctx.client.name,
          contactName: ctx.client.contactName,
          tenantName: ctx.tenant.name,
          proposalTitle: ctx.proposal.title,
          proposalReference: ctx.proposal.reference,
          validUntil: ctx.proposal.validUntil,
          services: ctx.proposal.services,
          total: ctx.proposal.total,
          senderName: Array.from(new Set([ctx.user?.firstName, ctx.user?.lastName].filter(Boolean))).join(' ') || 'Partner',
          senderEmail: ctx.user?.email || '',
          coverLetter: ctx.proposal.coverLetter,
        };
      } else {
        const draft = proposalEmailDraftInputSchema.parse(req.body.draft ?? req.body);
        const ctx = await (await import('../services/ai/aiContextBuilder.js')).buildAiContext(req.tenantId!, { clientId: draft.clientId, userId: req.user?.id });
        const services = draft.services || [];
        const total = services.reduce((sum, s) => sum + (s.displayPrice ?? 0), 0);
        payloadForStream = {
          clientName: ctx.client!.name,
          contactName: ctx.client!.contactName,
          tenantName: draft.practiceName || ctx.tenant.name,
          proposalTitle: draft.title || `Proposal for ${ctx.client!.name}`,
          proposalReference: draft.reference || 'Draft',
          validUntil: draft.validUntil || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
          services,
          total,
          senderName: draft.senderName || Array.from(new Set([ctx.user?.firstName, ctx.user?.lastName].filter(Boolean))).join(' ') || 'Partner',
          senderEmail: draft.senderEmail || ctx.user?.email || '',
          coverLetter: draft.coverLetter,
          contextNote: 'This is a draft proposal not yet saved in Engage.',
        };
      }

      for await (const event of generateEmailContentStream(req.tenantId!, req.user?.id, payloadForStream, { streamed: true })) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (e: any) {
      res.write(`data: ${JSON.stringify({ error: e.message || 'stream error' })}\n\n`);
    } finally {
      res.end();
    }
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

/** POST /api/ai/client-brief — body { clientId } (legacy frontend compat) */
router.post(
  '/client-brief',
  asyncHandler(async (req, res) => {
    const clientId = z.string().uuid().parse(req.body.clientId);
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

/** GET /api/ai/regulatory-alerts — Phase 5 regulatory watcher stub (hidden from UI until FEATURE_REGULATORY_WATCHER) */
router.get(
  '/regulatory-alerts',
  asyncHandler(async (req, res) => {
    const data = await getRegulatoryAlerts(req.tenantId!, req.user?.id);
    res.json({ success: true, data });
  })
);

/** GET /api/ai/benchmark-pricing — Phase 5 anonymised fee bands stub (hidden from UI until FEATURE_BENCHMARK_PRICING) */
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

/** Stub Cloudflare / other email delivery webhooks (updates email status / history). Expand with real signature validation later. */
router.post(
  '/webhooks/email',
  asyncHandler(async (req, res) => {
    // Expected minimal payload from email provider (adapt to Cloudflare Email or SendGrid style)
    const { messageId, event, to, status, timestamp } = req.body || {};
    // Best-effort update (no hard fail)
    try {
      if (messageId) {
        // Could look up via EmailLog or proposal emailHistory in future
        await (await import('../config/database.js')).prisma.activityLog.create({
          data: {
            tenantId: req.tenantId || 'unknown',
            action: 'EMAIL_WEBHOOK',
            entityType: 'EMAIL',
            description: `${event || status || 'delivery'} for ${to || messageId}`,
            metadata: JSON.stringify({ messageId, event, status, timestamp }),
          },
        });
      }
    } catch (e) {
      // swallow for webhook resilience
    }
    res.json({ success: true, received: true });
  })
);

/** POST /api/ai/cover-letter/stream — token stream for live cover letter drafting */
router.post(
  '/cover-letter/stream',
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

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // @ts-ignore - flush for node
    if (res.flushHeaders) res.flushHeaders();

    try {
      for await (const chunk of generateAiCoverLetterStream(req.tenantId!, req.user?.id, {
        clientId: body.clientId,
        tone: body.tone,
        practiceName: body.practiceName,
        senderName: body.senderName,
        services: body.services.map((s) => ({
          name: s.name,
          billingFrequency: s.billingFrequency,
          displayPrice: s.displayPrice,
        })),
      })) {
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    } catch (e: any) {
      res.write(`data: ${JSON.stringify({ error: e.message || 'stream error' })}\n\n`);
    } finally {
      res.end();
    }
  })
);

/** POST /api/ai/engagement-letter/stream — stream optional AI intro + clause-based letter */
router.post(
  '/engagement-letter/stream',
  asyncHandler(async (req, res) => {
    const { proposalId, includeAiIntro } = z
      .object({
        proposalId: z.string().uuid(),
        includeAiIntro: z.boolean().optional().default(false),
      })
      .parse(req.body);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if ((res as any).flushHeaders) (res as any).flushHeaders();

    try {
      for await (const chunk of assembleAiEngagementLetterStream(
        req.tenantId!,
        req.user?.id,
        proposalId,
        { includeAiIntro }
      )) {
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    } catch (e: any) {
      res.write(`data: ${JSON.stringify({ error: e.message || 'stream error' })}\n\n`);
    } finally {
      res.end();
    }
  })
);

export default router;
