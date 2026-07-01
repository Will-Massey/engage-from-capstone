/**
 * Proposal AI — context building and all six capability phases.
 */
import { prisma } from '../../config/database.js';
import { ApiError } from '../../middleware/errorHandler.js';
import logger from '../../config/logger.js';
import {
  assembleEngagementLetterFromClauses,
  selectClausesForServices,
} from '../../data/engagementClauseLibrary.js';
import { getProposalSettings, addDays } from '../../utils/tenantProposalSettings.js';
import {
  chatCompletion,
  chatCompletionStream,
  isAiConfigured,
  parseJsonResponse,
  tokenMetaFromUsage,
} from './aiClient.js';
import { VALID_BILLING_FREQUENCIES } from '../../utils/proposalPricing.js';
import { AI_COPILOT } from '../../config/aiCopilot.js';

const UK_SYSTEM =
  AI_COPILOT.systemPersona +
  ' Use UK English spelling (organisation, specialised, favour). ' +
  'Be professional, concise, and accurate. Never invent statutory deadlines or fees. ' +
  'When unsure, say what information is missing.';

export async function logAiUsage(
  tenantId: string,
  userId: string | undefined,
  feature: string,
  meta?: Record<string, unknown>
) {
  try {
    if (typeof meta?.prompt_tokens === 'number') {
      logger.info('AI feature token usage', {
        feature,
        prompt_tokens: meta.prompt_tokens,
        completion_tokens: meta.completion_tokens,
        total_tokens: meta.total_tokens,
        tenantId,
      });
    }

    await prisma.activityLog.create({
      data: {
        tenantId,
        userId,
        action: 'AI_FEATURE_USED',
        entityType: 'AI',
        description: feature,
        metadata: JSON.stringify(meta || {}),
      },
    });
  } catch (e) {
    logger.warn('Failed to log AI usage', e);
  }
}

async function loadClientContext(tenantId: string, clientId: string) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId },
  });
  if (!client) throw new ApiError('CLIENT_NOT_FOUND', 'Client not found', 404);
  return client;
}

async function loadCatalog(tenantId: string) {
  return prisma.serviceTemplate.findMany({
    where: { tenantId, isActive: true },
    select: {
      id: true,
      name: true,
      category: true,
      description: true,
      priceAmount: true,
      basePrice: true,
      billingCycle: true,
      defaultFrequency: true,
      frequencyOptions: true,
      tags: true,
    },
  });
}

function catalogForPrompt(
  catalog: Awaited<ReturnType<typeof loadCatalog>>
) {
  return catalog.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    defaultPrice: s.priceAmount || s.basePrice || 0,
    defaultBilling: s.billingCycle || s.defaultFrequency || 'MONTHLY',
    allowedBilling: (s.frequencyOptions || 'MONTHLY,QUARTERLY,ANNUALLY')
      .split(',')
      .map((x) => x.trim()),
    tags: s.tags,
  }));
}

/** Phase 1 — Suggest service bundle + billing cadence */
export async function suggestProposalServices(
  tenantId: string,
  userId: string | undefined,
  clientId: string
) {
  const client = await loadClientContext(tenantId, clientId);
  const catalog = await loadCatalog(tenantId);
  if (!catalog.length) {
    throw new ApiError('NO_SERVICES', 'No services in catalog', 400);
  }

  const priorProposals = await prisma.proposal.findMany({
    where: { tenantId, clientId, status: 'ACCEPTED' },
    include: { services: { select: { name: true, billingFrequency: true } } },
    take: 3,
    orderBy: { acceptedAt: 'desc' },
  });

  const prompt = {
    client: {
      name: client.name,
      companyType: client.companyType,
      turnover: client.turnover,
      employeeCount: client.employeeCount,
      vatNumber: client.vatNumber,
      mtditsaStatus: client.mtditsaStatus,
      companyNumber: client.companyNumber,
      clientRelationship: client.clientRelationship,
    },
    catalog: catalogForPrompt(catalog),
    priorAcceptedServices: priorProposals.flatMap((p) =>
      p.services.map((s) => ({ name: s.name, billing: s.billingFrequency }))
    ),
  };

  const { content: raw, usage: aiUsage } = await chatCompletion(
    [
      { role: 'system', content: UK_SYSTEM },
      {
        role: 'user',
        content: `Suggest services for a UK accountancy proposal. Return JSON only:
{
  "suggestions": [
    { "serviceId": "<uuid from catalog>", "billingFrequency": "MONTHLY|QUARTERLY|ANNUALLY|WEEKLY|ONE_TIME", "rationale": "one sentence" }
  ],
  "contractStartNote": "optional note on when engagement should start",
  "validUntilDays": 30,
  "summary": "2-3 sentence overview for the partner"
}
Only use serviceId values from the catalog. Pick billingFrequency from each service's allowedBilling.
If client.clientRelationship is EXISTING, treat as renewal — prefer continuity with priorAcceptedServices.
If NEW, suggest an appropriate first-engagement bundle for the entity type.

Context:
${JSON.stringify(prompt, null, 2)}`,
      },
    ],
    { jsonMode: true, temperature: 0.3 }
  );

  const parsed = parseJsonResponse<{
    suggestions: Array<{ serviceId: string; billingFrequency: string; rationale: string }>;
    contractStartNote?: string;
    validUntilDays?: number;
    summary?: string;
  }>(raw);

  const catalogIds = new Set(catalog.map((c) => c.id));
  const suggestions = (parsed.suggestions || [])
    .filter((s) => catalogIds.has(s.serviceId))
    .map((s) => {
      const template = catalog.find((c) => c.id === s.serviceId)!;
      let billing = s.billingFrequency?.toUpperCase() || 'MONTHLY';
      if (!VALID_BILLING_FREQUENCIES.includes(billing as any)) billing = 'MONTHLY';
      return {
        serviceId: s.serviceId,
        name: template.name,
        billingFrequency: billing,
        displayPrice: template.priceAmount || template.basePrice || 0,
        rationale: s.rationale,
        category: template.category,
      };
    });

  await logAiUsage(tenantId, userId, 'suggest_services', {
    clientId,
    count: suggestions.length,
    ...tokenMetaFromUsage(aiUsage),
  });

  return {
    suggestions,
    summary: parsed.summary || '',
    contractStartNote: parsed.contractStartNote,
    validUntilDays: parsed.validUntilDays || 30,
  };
}

/** Phase 2a — Cover letter draft */
export async function generateAiCoverLetter(
  tenantId: string,
  userId: string | undefined,
  params: {
    clientId: string;
    tone: 'PROFESSIONAL' | 'FRIENDLY' | 'MODERN';
    services: Array<{ name: string; billingFrequency?: string; displayPrice?: number }>;
    practiceName: string;
    senderName?: string;
  }
) {
  const client = await loadClientContext(tenantId, params.clientId);

  const { content: raw, usage: aiUsage } = await chatCompletion(
    [
      { role: 'system', content: UK_SYSTEM },
      {
        role: 'user',
        content: `Write a proposal cover letter for a UK accountancy practice.
Tone: ${params.tone.toLowerCase()}
Practice: ${params.practiceName}
Client: ${client.name} (${client.companyType})
Relationship: ${client.clientRelationship === 'EXISTING' ? 'Existing client — renewal or scope change; warm continuity, not a cold pitch' : 'New client — welcoming onboarding tone'}
Addressee: ${client.contactName || client.name}
Sender: ${params.senderName || 'Partner'}
Services: ${params.services.map((s) => `${s.name} (${s.billingFrequency || 'MONTHLY'})`).join('; ')}
Use plain paragraphs (no markdown headers). 3-5 short paragraphs. End with a clear call to review and sign. UK English.`,
      },
    ],
    { temperature: 0.6, maxTokens: 1200 }
  );

  await logAiUsage(tenantId, userId, 'cover_letter', {
    clientId: params.clientId,
    tone: params.tone,
    ...tokenMetaFromUsage(aiUsage),
  });
  return { content: raw, requiresApproval: true };
}

/** Streaming version of cover letter for live preview in builder. */
export async function* generateAiCoverLetterStream(
  tenantId: string,
  userId: string | undefined,
  params: {
    clientId: string;
    tone: 'PROFESSIONAL' | 'FRIENDLY' | 'MODERN';
    practiceName: string;
    senderName?: string;
    services: Array<{ name: string; billingFrequency?: string; displayPrice?: number }>;
  }
): AsyncGenerator<string, void, unknown> {
  const client = await loadClientContext(tenantId, params.clientId);

  const prompt = `Write a proposal cover letter for a UK accountancy practice.
Tone: ${params.tone.toLowerCase()}
Practice: ${params.practiceName}
Client: ${client.name} (${client.companyType})
Relationship: ${client.clientRelationship === 'EXISTING' ? 'Existing client — renewal or scope change; warm continuity, not a cold pitch' : 'New client — welcoming onboarding tone'}
Addressee: ${client.contactName || client.name}
Sender: ${params.senderName || 'Partner'}
Services: ${params.services.map((s) => `${s.name} (${s.billingFrequency || 'MONTHLY'})`).join('; ')}
Use plain paragraphs (no markdown headers). 3-5 short paragraphs. End with a clear call to review and sign. UK English.`;

  let full = '';
  for await (const chunk of chatCompletionStream(
    [
      { role: 'system', content: UK_SYSTEM },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.6, maxTokens: 1400 }
  )) {
    full += chunk;
    yield chunk;
  }

  await logAiUsage(tenantId, userId, 'cover_letter_stream', { clientId: params.clientId, tone: params.tone });
  // consumer may want the full at end; we yielded incrementally
}

/** Phase 2b — Follow-up email draft */
export async function generateAiFollowUp(
  tenantId: string,
  userId: string | undefined,
  proposalId: string,
  tone: 'professional' | 'friendly' | 'urgent' = 'professional'
) {
  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, tenantId },
    include: {
      client: true,
      services: true,
      views: { orderBy: { viewedAt: 'desc' }, take: 5 },
    },
  });
  if (!proposal) throw new ApiError('NOT_FOUND', 'Proposal not found', 404);

  const viewCount = proposal.views.length;
  const lastView = proposal.views[0]?.viewedAt;

  const { content: raw, usage: aiUsage } = await chatCompletion(
    [
      { role: 'system', content: UK_SYSTEM },
      {
        role: 'user',
        content: `Draft a follow-up email for an unsigned proposal.
Tone: ${tone}
Proposal: ${proposal.title} (${proposal.reference})
Client: ${proposal.client.name}
Total: £${proposal.total.toFixed(2)}
Status: ${proposal.status}
Valid until: ${proposal.validUntil.toISOString().slice(0, 10)}
Views: ${viewCount}${lastView ? `, last viewed ${lastView.toISOString().slice(0, 10)}` : ''}
Return JSON: { "subject": "...", "body": "plain text email body", "suggestedSendInDays": 0 }
Do not send — draft only. UK English.`,
      },
    ],
    { jsonMode: true, temperature: 0.5 }
  );

  const draft = parseJsonResponse<{ subject: string; body: string; suggestedSendInDays?: number }>(
    raw
  );
  await logAiUsage(tenantId, userId, 'follow_up_draft', {
    proposalId,
    tone,
    ...tokenMetaFromUsage(aiUsage),
  });
  return { ...draft, requiresApproval: true, proposalId };
}

export interface EngagementLetterOptions {
  /** When true, prepend a short Clara introduction (extra tokens). Default: clause library only. */
  includeAiIntro?: boolean;
}

/** Phase 3 — Engagement letter from clause library; AI intro is optional (W2.3) */
export async function assembleAiEngagementLetter(
  tenantId: string,
  userId: string | undefined,
  proposalId: string,
  options?: EngagementLetterOptions
) {
  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, tenantId },
    include: { client: true, services: true, tenant: true },
  });
  if (!proposal) throw new ApiError('NOT_FOUND', 'Proposal not found', 404);

  const serviceRows = proposal.services.map((s) => ({
    name: s.name,
    tags: '',
  }));

  const clauses = selectClausesForServices(serviceRows);
  const feesSummary = proposal.services
    .map(
      (s) =>
        `• ${s.name}: £${(s.displayPrice || s.unitPrice).toFixed(2)} per ${String(s.billingFrequency).toLowerCase().replace('_', ' ')}`
    )
    .join('\n');

  const periodStart = proposal.contractStartDate
    ? proposal.contractStartDate.toISOString().slice(0, 10)
    : 'On acceptance';
  const periodEnd = proposal.renewalDate
    ? proposal.renewalDate.toISOString().slice(0, 10)
    : '12 months from commencement';

  let letter = assembleEngagementLetterFromClauses(
    proposal.tenant.name,
    proposal.client.name,
    clauses,
    feesSummary,
    `${periodStart} to ${periodEnd}`
  );

  let aiUsage;
  if (options?.includeAiIntro && isAiConfigured()) {
    const introResult = await chatCompletion(
      [
        { role: 'system', content: UK_SYSTEM },
        {
          role: 'user',
          content: `Write a 2-paragraph introduction for this engagement letter (plain text, no headers). Client: ${proposal.client.name}. Services: ${proposal.services.map((s) => s.name).join(', ')}.`,
        },
      ],
      { temperature: 0.4, maxTokens: 400 }
    );
    aiUsage = introResult.usage;
    letter = `${introResult.content}\n\n---\n\n${letter}`;
  }

  await logAiUsage(tenantId, userId, 'engagement_letter', {
    proposalId,
    clauseIds: clauses.map((c) => c.id),
    includeAiIntro: !!options?.includeAiIntro,
    ...tokenMetaFromUsage(aiUsage),
  });

  return {
    content: letter,
    clauseIds: clauses.map((c) => c.id),
    requiresApproval: true,
  };
}

/** Streaming version: yields optional AI intro, then the assembled clause-based body. */
export async function* assembleAiEngagementLetterStream(
  tenantId: string,
  userId: string | undefined,
  proposalId: string,
  options?: EngagementLetterOptions
): AsyncGenerator<string, void, unknown> {
  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, tenantId },
    include: { client: true, services: true, tenant: true },
  });
  if (!proposal) throw new ApiError('NOT_FOUND', 'Proposal not found', 404);

  const serviceRows = proposal.services.map((s) => ({ name: s.name, tags: '' }));
  const clauses = selectClausesForServices(serviceRows);
  const feesSummary = proposal.services
    .map(
      (s) =>
        `• ${s.name}: £${(s.displayPrice || s.unitPrice).toFixed(2)} per ${String(s.billingFrequency).toLowerCase().replace('_', ' ')}`
    )
    .join('\n');

  const periodStart = proposal.contractStartDate
    ? proposal.contractStartDate.toISOString().slice(0, 10)
    : 'On acceptance';
  const periodEnd = proposal.renewalDate
    ? proposal.renewalDate.toISOString().slice(0, 10)
    : '12 months from commencement';

  const baseLetter = assembleEngagementLetterFromClauses(
    proposal.tenant.name,
    proposal.client.name,
    clauses,
    feesSummary,
    `${periodStart} to ${periodEnd}`
  );

  if (options?.includeAiIntro && isAiConfigured()) {
    const introPrompt = `Write a 2-paragraph introduction for this engagement letter (plain text, no headers). Client: ${proposal.client.name}. Services: ${proposal.services.map((s) => s.name).join(', ')}.`;
    for await (const chunk of chatCompletionStream(
      [
        { role: 'system', content: UK_SYSTEM },
        { role: 'user', content: introPrompt },
      ],
      { temperature: 0.4, maxTokens: 500 }
    )) {
      yield chunk;
    }
    yield '\n\n---\n\n';
  }

  yield baseLetter;

  await logAiUsage(tenantId, userId, 'engagement_letter_stream', {
    proposalId,
    clauseIds: clauses.map((c) => c.id),
    includeAiIntro: !!options?.includeAiIntro,
  });
}

/** Pre-send draft review (no saved proposal required) */
export async function reviewProposalDraft(
  tenantId: string,
  userId: string | undefined,
  draft: {
    clientId: string;
    title?: string;
    coverLetter?: string;
    validUntil?: string;
    services: Array<{ name: string; billingFrequency?: string; displayPrice?: number }>;
  }
) {
  const client = await loadClientContext(tenantId, draft.clientId);
  const ruleActions: string[] = [];
  let healthScore = 100;

  if (!draft.title?.trim()) {
    ruleActions.push('Add a clear proposal title before sending.');
    healthScore -= 15;
  }
  if (!draft.services?.length) {
    ruleActions.push('Add at least one service to the proposal.');
    healthScore -= 35;
  }
  const coverLen = draft.coverLetter?.trim().length ?? 0;
  if (coverLen < 40) {
    ruleActions.push('Cover letter is missing or very short — clients respond better with a personalised introduction.');
    healthScore -= 12;
  }
  if (draft.validUntil) {
    const expiry = new Date(draft.validUntil);
    if (!Number.isNaN(expiry.getTime())) {
      const days = Math.floor((expiry.getTime() - Date.now()) / 86400000);
      if (days < 0) {
        ruleActions.push('Valid until date is in the past.');
        healthScore -= 25;
      } else if (days <= 7) {
        ruleActions.push('Valid until date is within 7 days — consider a longer window for new clients.');
        healthScore -= 8;
      }
    }
  }

  const totalFees = draft.services.reduce((s, svc) => s + (svc.displayPrice ?? 0), 0);
  if (totalFees <= 0 && draft.services.length > 0) {
    ruleActions.push('One or more services have zero fees — confirm pricing before sending.');
    healthScore -= 10;
  }

  healthScore = Math.max(0, Math.min(100, healthScore));

  let summary = '';
  let aiActions: string[] = [];
  let aiUsage;

  if (isAiConfigured()) {
    const completion = await chatCompletion(
      [
        { role: 'system', content: UK_SYSTEM },
        {
          role: 'user',
          content: `Review this UK accountancy proposal draft before it is sent. Return JSON only:
{ "summary": "2 sentences", "recommendedActions": ["action1", "action2"], "suggestedTitle": "optional short title or empty string" }
Client: ${client.name} (${client.companyType})
Draft title: ${draft.title || '(none)'}
Services: ${draft.services.map((s) => `${s.name} £${s.displayPrice ?? 0} ${s.billingFrequency || ''}`).join('; ') || '(none)'}
Cover letter length: ${coverLen} chars
Rule flags already found: ${JSON.stringify(ruleActions)}`,
        },
      ],
      { jsonMode: true, temperature: 0.3, maxTokens: 500 }
    );
    aiUsage = completion.usage;
    const parsed = parseJsonResponse<{
      summary: string;
      recommendedActions: string[];
      suggestedTitle?: string;
    }>(completion.content);
    summary = parsed.summary;
    aiActions = parsed.recommendedActions || [];
    if (parsed.suggestedTitle?.trim() && !draft.title?.trim()) {
      aiActions.unshift(`Suggested title: "${parsed.suggestedTitle.trim()}"`);
    }
  } else {
    summary = ruleActions.length
      ? 'Review the checklist below before you create or send this proposal.'
      : 'Draft looks ready — give it a final read before sending.';
  }

  await logAiUsage(tenantId, userId, 'draft_review', {
    clientId: draft.clientId,
    healthScore,
    serviceCount: draft.services.length,
    ...tokenMetaFromUsage(aiUsage),
  });

  return {
    healthScore,
    summary,
    recommendedActions: [...new Set([...ruleActions, ...aiActions])],
    readyToSend: healthScore >= 70 && draft.services.length > 0 && coverLen >= 40,
  };
}

/** Suggest a concise proposal title from client + services */
export async function suggestProposalTitle(
  tenantId: string,
  userId: string | undefined,
  clientId: string,
  services: Array<{ name: string; billingFrequency?: string }>
) {
  const client = await loadClientContext(tenantId, clientId);
  if (!isAiConfigured()) {
    const names = services.map((s) => s.name).slice(0, 2).join(' & ');
    return { title: names ? `${names} — ${client.name}` : `Proposal for ${client.name}` };
  }

  const { content: raw, usage: aiUsage } = await chatCompletion(
    [
      { role: 'system', content: UK_SYSTEM },
      {
        role: 'user',
        content: `Suggest a professional UK accountancy proposal title (max 8 words). Return JSON: { "title": "..." }
Client: ${client.name}
Services: ${services.map((s) => s.name).join(', ') || 'general engagement'}`,
      },
    ],
    { jsonMode: true, temperature: 0.4, maxTokens: 120 }
  );
  const parsed = parseJsonResponse<{ title: string }>(raw);
  await logAiUsage(tenantId, userId, 'suggest_title', {
    clientId,
    ...tokenMetaFromUsage(aiUsage),
  });
  return { title: parsed.title?.trim() || `Proposal for ${client.name}` };
}

/** Phase 4 — Proposal health (rules + AI narrative) */
export async function getProposalHealth(
  tenantId: string,
  userId: string | undefined,
  proposalId: string
) {
  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, tenantId },
    include: {
      client: true,
      services: true,
      views: true,
      activityLogs: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  });
  if (!proposal) throw new ApiError('NOT_FOUND', 'Proposal not found', 404);

  const now = Date.now();
  const daysSinceSent = proposal.sentAt
    ? Math.floor((now - proposal.sentAt.getTime()) / 86400000)
    : null;
  const daysUntilExpiry = Math.floor((proposal.validUntil.getTime() - now) / 86400000);
  const viewCount = proposal.views.length;
  const totalViewSeconds = proposal.views.reduce((s, v) => s + (v.viewDuration || 0), 0);

  const signals = {
    status: proposal.status,
    daysSinceSent,
    daysUntilExpiry,
    viewCount,
    totalViewMinutes: Math.round(totalViewSeconds / 60),
    expired: daysUntilExpiry < 0,
    expiringSoon: daysUntilExpiry >= 0 && daysUntilExpiry <= 7,
    noViews: viewCount === 0 && proposal.status !== 'DRAFT',
    stuck: daysSinceSent !== null && daysSinceSent > 14 && proposal.status === 'SENT',
  };

  let healthScore = 70;
  if (proposal.status === 'ACCEPTED') healthScore = 100;
  else if (signals.expired) healthScore = 10;
  else if (signals.stuck) healthScore = 35;
  else if (signals.noViews && daysSinceSent !== null && daysSinceSent > 7) healthScore = 45;
  else if (viewCount > 2) healthScore = 75;
  else if (viewCount > 0) healthScore = 60;

  const ruleActions: string[] = [];
  if (signals.expired) ruleActions.push('Proposal has expired — create a revised proposal or extend valid until date.');
  if (signals.expiringSoon && proposal.status !== 'ACCEPTED')
    ruleActions.push('Valid until date is within 7 days — follow up with the client.');
  if (signals.noViews && proposal.status === 'SENT')
    ruleActions.push('Client has not opened the proposal — consider a phone call or resend.');
  if (signals.stuck) ruleActions.push('No signature after 14+ days — send a follow-up or review pricing.');

  let aiSummary = '';
  let aiActions: string[] = [];
  let aiUsage;

  if (isAiConfigured()) {
    const completion = await chatCompletion(
      [
        { role: 'system', content: UK_SYSTEM },
        {
          role: 'user',
          content: `Analyse proposal health for a UK accountant. Return JSON:
{ "summary": "2 sentences", "recommendedActions": ["action1", "action2"] }
Signals: ${JSON.stringify(signals)}
Client: ${proposal.client.name}
Reference: ${proposal.reference}
Total: £${proposal.total}`,
        },
      ],
      { jsonMode: true, temperature: 0.3 }
    );
    aiUsage = completion.usage;
    const parsed = parseJsonResponse<{ summary: string; recommendedActions: string[] }>(
      completion.content
    );
    aiSummary = parsed.summary;
    aiActions = parsed.recommendedActions || [];
  } else {
    aiSummary = ruleActions.length
      ? 'Review the recommended actions below.'
      : 'Proposal is progressing normally.';
  }

  await logAiUsage(tenantId, userId, 'proposal_health', {
    proposalId,
    healthScore,
    ...tokenMetaFromUsage(aiUsage),
  });

  return {
    healthScore,
    signals,
    summary: aiSummary,
    recommendedActions: [...new Set([...ruleActions, ...aiActions])],
  };
}

/** Phase 5 — Renewal draft with uplift */
export async function generateRenewalDraft(
  tenantId: string,
  userId: string | undefined,
  proposalId: string,
  upliftPercent: number = 0
) {
  const original = await prisma.proposal.findFirst({
    where: { id: proposalId, tenantId, status: 'ACCEPTED' },
    include: { client: true, services: true, tenant: true },
  });
  if (!original) throw new ApiError('NOT_FOUND', 'Accepted proposal not found', 404);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true, name: true },
  });
  const proposalSettings = getProposalSettings(tenant?.settings);
  const validUntil = addDays(new Date(), proposalSettings.defaultExpiryDays);

  const multiplier = 1 + upliftPercent / 100;
  const services = original.services.map((s) => ({
    serviceId: s.serviceTemplateId,
    name: s.name,
    billingFrequency: s.billingFrequency,
    displayPrice: Math.max(
      0,
      Math.round((s.displayPrice || s.unitPrice) * multiplier * 100) / 100
    ),
    quantity: s.quantity,
    discountPercent: s.discountPercent,
  }));

  let coverLetter = original.coverLetter || '';
  let renewalNarrative = '';
  let aiUsage;

  if (isAiConfigured()) {
    const completion = await chatCompletion(
      [
        { role: 'system', content: UK_SYSTEM },
        {
          role: 'user',
          content: `Write a renewal cover letter for ${original.client.name}. 
Prior proposal: ${original.title}, accepted ${original.acceptedAt?.toISOString().slice(0, 10)}.
${upliftPercent > 0 ? `Fees increased by ${upliftPercent}% reflecting ongoing service and inflation.` : upliftPercent < 0 ? `Fees reduced by ${Math.abs(upliftPercent)}% — explain professionally (efficiency, scope alignment, or goodwill).` : 'Fees unchanged from prior year.'}
Practice: ${original.tenant.name}
3-4 paragraphs, warm professional UK tone, plain text.`,
        },
      ],
      { temperature: 0.55, maxTokens: 900 }
    );
    aiUsage = completion.usage;
    coverLetter = completion.content;
    renewalNarrative =
      upliftPercent > 0
        ? `Renewal with ${upliftPercent}% fee uplift`
        : upliftPercent < 0
          ? `Renewal with ${Math.abs(upliftPercent)}% fee reduction`
          : 'Straight renewal at existing fees';
  }

  await logAiUsage(tenantId, userId, 'renewal_draft', {
    proposalId,
    upliftPercent,
    ...tokenMetaFromUsage(aiUsage),
  });

  return {
    title: `${original.title} (Renewal)`,
    clientId: original.clientId,
    validUntil: validUntil.toISOString(),
    coverLetter,
    renewalNarrative,
    upliftPercent,
    services,
    originalProposalId: original.id,
    requiresApproval: true,
  };
}

/** Phase 6 — Natural language command interpreter */
export async function executeAiCommand(
  tenantId: string,
  userId: string | undefined,
  query: string,
  context?: { proposalId?: string; clientId?: string }
) {
  const recentProposals = await prisma.proposal.findMany({
    where: { tenantId },
    select: { id: true, reference: true, title: true, status: true, client: { select: { name: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 15,
  });

  const { content: raw, usage: aiUsage } = await chatCompletion(
    [
      { role: 'system', content: UK_SYSTEM },
      {
        role: 'user',
        content: `Interpret this command for Engage proposal software. Return JSON only:
{
  "action": "navigate" | "suggest_services" | "proposal_health" | "renewal_draft" | "follow_up" | "create_proposal" | "answer",
  "message": "friendly reply to show user",
  "params": { "path": "/proposals/...", "proposalId": "...", "clientId": "...", "upliftPercent": 0 }
}
Recent proposals: ${JSON.stringify(recentProposals)}
Context: ${JSON.stringify(context || {})}
User query: "${query}"`,
      },
    ],
    { jsonMode: true, temperature: 0.2, maxTokens: 450 }
  );

  const result = parseJsonResponse<{
    action: string;
    message: string;
    params?: Record<string, unknown>;
  }>(raw);

  await logAiUsage(tenantId, userId, 'ai_command', {
    query,
    action: result.action,
    ...tokenMetaFromUsage(aiUsage),
  });

  return result;
}

/** Lightweight assistant — short answers, minimal tokens */
export async function quickAsk(
  tenantId: string,
  userId: string | undefined,
  query: string,
  context?: { proposalId?: string; clientId?: string; page?: string }
) {
  const { content: raw, usage: aiUsage } = await chatCompletion(
    [
      {
        role: 'system',
        content:
          UK_SYSTEM +
          ' Reply in 2-4 short sentences maximum. Be actionable. If you need a specific proposal or client, say which page to open.',
      },
      {
        role: 'user',
        content: `Page: ${context?.page || 'app'}\nProposalId: ${context?.proposalId || 'none'}\nClientId: ${context?.clientId || 'none'}\nQuestion: ${query.slice(0, 400)}`,
      },
    ],
    { temperature: 0.35, maxTokens: 180 }
  );

  await logAiUsage(tenantId, userId, 'quick_ask', {
    query: query.slice(0, 80),
    ...tokenMetaFromUsage(aiUsage),
  });
  return { message: raw, action: 'answer' as const };
}

/** Contextual quick actions — reuse existing capabilities, no command interpreter */
export async function executeQuickAction(
  tenantId: string,
  userId: string | undefined,
  action: 'health' | 'follow_up' | 'suggest_services',
  context: { proposalId?: string; clientId?: string }
) {
  if (action === 'health') {
    if (!context.proposalId) {
      return {
        message: 'Open a proposal first — I can analyse its health from the proposal page.',
        action: 'answer',
      };
    }
    const health = await getProposalHealth(tenantId, userId, context.proposalId);
    const tips = health.recommendedActions?.slice(0, 3).join(' · ') || '';
    return {
      message: `**${health.healthScore}/100** — ${health.summary}${tips ? `\n\nNext: ${tips}` : ''}`,
      action: 'answer',
      data: health,
    };
  }

  if (action === 'follow_up') {
    if (!context.proposalId) {
      return { message: 'Open an unsigned proposal to draft a follow-up email.', action: 'answer' };
    }
    const draft = await generateAiFollowUp(tenantId, userId, context.proposalId, 'professional');
    return {
      message: `**Follow-up draft**\nSubject: ${draft.subject}\n\n${draft.body.slice(0, 500)}${draft.body.length > 500 ? '…' : ''}\n\n_Open the proposal to copy the full draft._`,
      action: 'answer',
      data: draft,
    };
  }

  if (action === 'suggest_services') {
    if (!context.clientId) {
      return {
        message: 'Open a client or start a new proposal with a client selected — then I can suggest services.',
        action: 'answer',
      };
    }
    const data = await suggestProposalServices(tenantId, userId, context.clientId);
    const lines = data.suggestions
      .slice(0, 5)
      .map((s) => `• ${s.name} (${s.billingFrequency})`)
      .join('\n');
    return {
      message: `${data.summary || 'Service suggestions:'}\n\n${lines}\n\n_Use **Suggest services** in the proposal builder to apply._`,
      action: 'suggest_services',
      params: { clientId: context.clientId },
      data,
    };
  }

  return { message: 'Unknown action.', action: 'answer' };
}

export interface AttentionQueueItem {
  proposalId: string;
  reference: string;
  title: string;
  clientName: string;
  status: string;
  priorityScore: number;
  reason: string;
  narrative: string;
  recommendedAction: string;
}

/** Top proposals needing partner action with Clara narrative */
export async function getAiAttentionQueue(
  tenantId: string,
  userId: string | undefined
): Promise<{ items: AttentionQueueItem[]; generatedAt: string }> {
  const now = Date.now();
  const proposals = await prisma.proposal.findMany({
    where: {
      tenantId,
      status: { in: ['DRAFT', 'SENT', 'VIEWED', 'EXPIRED'] },
    },
    include: {
      client: { select: { name: true } },
      views: { select: { viewedAt: true }, orderBy: { viewedAt: 'desc' }, take: 1 },
    },
    orderBy: { updatedAt: 'desc' },
    take: 40,
  });

  type Scored = {
    proposal: (typeof proposals)[number];
    priorityScore: number;
    reason: string;
    recommendedAction: string;
  };

  const scored: Scored[] = [];

  for (const p of proposals) {
    const daysUntilExpiry = Math.floor((p.validUntil.getTime() - now) / 86400000);
    const daysSinceSent = p.sentAt
      ? Math.floor((now - p.sentAt.getTime()) / 86400000)
      : null;
    const viewCount = p.views.length;
    const daysSinceUpdate = Math.floor((now - p.updatedAt.getTime()) / 86400000);

    let priorityScore = 0;
    let reason = '';
    let recommendedAction = '';

    if (p.status === 'EXPIRED' || daysUntilExpiry < 0) {
      priorityScore = 95;
      reason = 'Proposal has expired';
      recommendedAction = 'Create a revised proposal or extend the valid until date.';
    } else if (p.status === 'DRAFT' && daysSinceUpdate >= 7) {
      priorityScore = 80;
      reason = 'Draft proposal untouched for over a week';
      recommendedAction = 'Complete and send, or archive if no longer needed.';
    } else if (
      (p.status === 'SENT' || p.status === 'VIEWED') &&
      daysSinceSent !== null &&
      daysSinceSent >= 14
    ) {
      priorityScore = 85;
      reason = 'No signature after 14+ days';
      recommendedAction = 'Send a follow-up email or call the client.';
    } else if (
      (p.status === 'SENT' || p.status === 'VIEWED') &&
      viewCount === 0 &&
      daysSinceSent !== null &&
      daysSinceSent >= 7
    ) {
      priorityScore = 75;
      reason = 'Client has not opened the proposal';
      recommendedAction = 'Resend the proposal or follow up by phone.';
    } else if (daysUntilExpiry >= 0 && daysUntilExpiry <= 7) {
      priorityScore = 70;
      reason = 'Valid until date within 7 days';
      recommendedAction = 'Follow up before the proposal expires.';
    } else if (p.status === 'VIEWED' && viewCount > 0 && daysSinceSent !== null && daysSinceSent >= 3) {
      priorityScore = 60;
      reason = 'Client viewed but has not signed';
      recommendedAction = 'A gentle nudge may help — draft a follow-up.';
    } else if (p.status === 'DRAFT') {
      priorityScore = 45;
      reason = 'Draft awaiting completion';
      recommendedAction = 'Review pricing and cover letter before sending.';
    } else {
      continue;
    }

    scored.push({ proposal: p, priorityScore, reason, recommendedAction });
  }

  scored.sort((a, b) => b.priorityScore - a.priorityScore);
  const top = scored.slice(0, 10);

  let narratives: string[] = [];
  let aiUsage;
  if (isAiConfigured() && top.length) {
    const completion = await chatCompletion(
      [
        { role: 'system', content: UK_SYSTEM },
        {
          role: 'user',
          content: `Write a one-sentence Clara narrative for each proposal needing action. Return JSON:
{ "narratives": ["sentence1", "sentence2", ...] }
UK accountancy practice tone. Same order as input.

Items:
${JSON.stringify(
  top.map((t) => ({
    reference: t.proposal.reference,
    client: t.proposal.client.name,
    status: t.proposal.status,
    reason: t.reason,
    total: t.proposal.total,
  }))
)}`,
        },
      ],
      { jsonMode: true, temperature: 0.35, maxTokens: 800 }
    );
    aiUsage = completion.usage;
    const parsed = parseJsonResponse<{ narratives: string[] }>(completion.content);
    narratives = parsed.narratives || [];
  }

  const items: AttentionQueueItem[] = top.map((t, i) => ({
    proposalId: t.proposal.id,
    reference: t.proposal.reference,
    title: t.proposal.title,
    clientName: t.proposal.client.name,
    status: t.proposal.status,
    priorityScore: t.priorityScore,
    reason: t.reason,
    narrative:
      narratives[i]?.trim() ||
      `${t.proposal.client.name} — ${t.reason.toLowerCase()}. ${t.recommendedAction}`,
    recommendedAction: t.recommendedAction,
  }));

  await logAiUsage(tenantId, userId, 'attention_queue', {
    count: items.length,
    ...tokenMetaFromUsage(aiUsage),
  });

  return { items, generatedAt: new Date().toISOString() };
}

export { isAiConfigured };
