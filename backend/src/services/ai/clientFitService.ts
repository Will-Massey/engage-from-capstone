/**
 * Client fit — briefs and auto-fit proposal suggestions from client + CH context.
 */
import { ApiError } from '../../middleware/errorHandler.js';
import { AI_COPILOT } from '../../config/aiCopilot.js';
import { chatCompletion, parseJsonResponse, checkAiTokenBudget, isAiConfigured } from './aiClient.js';
import { buildAiContext } from './aiContextBuilder.js';
import { logAiUsage } from './proposalAiService.js';
import { VALID_BILLING_FREQUENCIES } from '../../utils/proposalPricing.js';

const UK_SYSTEM =
  AI_COPILOT.systemPersona +
  ' Use UK English spelling (organisation, specialised, favour). ' +
  'Be professional, concise, and accurate. Never invent statutory deadlines or fees. ' +
  'When unsure, say what information is missing.';

export interface AutoFitServiceSuggestion {
  serviceId: string;
  name: string;
  billingFrequency: string;
  displayPrice: number;
  rationale: string;
}

export interface AutoFitProposalResult {
  suggestedTitle: string;
  services: AutoFitServiceSuggestion[];
  coverLetterTone: 'PROFESSIONAL' | 'FRIENDLY' | 'MODERN';
  coverLetterDraft: string;
  pricingNotes: string;
  validUntilDays: number;
}

export interface ClientBriefResult {
  brief: string;
  highlights: string[];
  companiesHouse?: import('./aiContextBuilder.js').AiCompaniesHouseContext;
  requiresApproval: true;
}

async function assertAiBudget(tenantId: string): Promise<void> {
  const budget = await checkAiTokenBudget(tenantId);
  if (!budget.withinBudget) {
    throw new ApiError(
      'AI_BUDGET_EXCEEDED',
      `${AI_COPILOT.name} monthly usage limit reached — contact your administrator`,
      429
    );
  }
}

/** One-page client brief from Engage data and Companies House */
export async function generateClientBrief(
  tenantId: string,
  userId: string | undefined,
  clientId: string
): Promise<ClientBriefResult> {
  const ctx = await buildAiContext(tenantId, { clientId, userId });
  if (!ctx.client) throw new ApiError('CLIENT_NOT_FOUND', 'Client not found', 404);

  if (!isAiConfigured()) {
    const ch = ctx.companiesHouse;
    const lines = [
      `**${ctx.client.name}** (${ctx.client.companyType})`,
      ctx.client.companyNumber ? `Companies House: ${ctx.client.companyNumber}` : '',
      ch?.companyName ? `CH registered name: ${ch.companyName}` : '',
      ch?.companyStatus ? `Status: ${ch.companyStatus}` : '',
      ch?.dateOfCreation ? `Incorporated: ${ch.dateOfCreation}` : '',
      ch?.accountsNextDue ? `Accounts due: ${ch.accountsNextDue}` : '',
      ch?.registeredOfficeAddress ? `Registered office: ${ch.registeredOfficeAddress}` : '',
      ctx.client.industry ? `Industry: ${ctx.client.industry}` : '',
      ctx.client.turnover ? `Turnover: £${ctx.client.turnover.toLocaleString('en-GB')}` : '',
      ctx.priorProposals.length
        ? `Prior proposals: ${ctx.priorProposals.map((p) => `${p.reference} (${p.status})`).join(', ')}`
        : 'No prior proposals on record.',
    ].filter(Boolean);
    const highlights = [
      ...(ch?.sicCodes?.length ? [`SIC: ${ch.sicCodes.join(', ')}`] : []),
      ...(ch?.accountsNextDue ? [`Accounts filing due ${ch.accountsNextDue}`] : []),
      'Configure AI for a fuller narrative brief.',
    ];
    return {
      brief: lines.join('\n'),
      highlights,
      companiesHouse: ch,
      requiresApproval: true,
    };
  }

  await assertAiBudget(tenantId);

  const raw = await chatCompletion(
    [
      { role: 'system', content: UK_SYSTEM },
      {
        role: 'user',
        content: `Create a one-page client brief for a UK accountancy partner preparing a proposal.
Return JSON only:
{
  "brief": "4-6 short paragraphs plain text covering who they are, structure, compliance flags, relationship history, and proposal angles",
  "highlights": ["bullet1", "bullet2", "bullet3"]
}
Practice: ${ctx.tenant.name}
Context:
${JSON.stringify(
  {
    client: ctx.client,
    companiesHouse: ctx.companiesHouse,
    priorProposals: ctx.priorProposals,
    catalogCategories: [...new Set(ctx.catalog.map((c) => c.category))],
  },
  null,
  2
)}`,
      },
    ],
    { jsonMode: true, temperature: 0.4, maxTokens: 1400 }
  );

  const parsed = parseJsonResponse<{ brief: string; highlights: string[] }>(raw);
  await logAiUsage(tenantId, userId, 'client_brief', { clientId });

  return {
    brief: parsed.brief?.trim() || 'Brief unavailable.',
    highlights: parsed.highlights || [],
    companiesHouse: ctx.companiesHouse,
    requiresApproval: true,
  };
}

/** Auto-fit a proposal bundle for a client */
export async function autoFitProposal(
  tenantId: string,
  userId: string | undefined,
  clientId: string
): Promise<AutoFitProposalResult> {
  const ctx = await buildAiContext(tenantId, { clientId, userId });
  if (!ctx.client) throw new ApiError('CLIENT_NOT_FOUND', 'Client not found', 404);
  if (!ctx.catalog.length) throw new ApiError('NO_SERVICES', 'No services in catalog', 400);

  const catalogForPrompt = ctx.catalog.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    defaultPrice: s.defaultPrice,
    defaultBilling: s.defaultBilling,
    allowedBilling: s.allowedBilling,
    tags: s.tags,
  }));

  const priorAccepted = ctx.priorProposals
    .filter((p) => p.status === 'ACCEPTED')
    .flatMap((p) => p.services.map((s) => ({ name: s.name, billing: s.billingFrequency })));

  if (!isAiConfigured()) {
    const fallback = ctx.catalog.slice(0, 3).map((s) => ({
      serviceId: s.id,
      name: s.name,
      billingFrequency: s.defaultBilling,
      displayPrice: s.defaultPrice,
      rationale: 'Default catalog selection',
    }));
    return {
      suggestedTitle: `Proposal for ${ctx.client.name}`,
      services: fallback,
      coverLetterTone: 'PROFESSIONAL',
      coverLetterDraft: `Dear ${ctx.client.contactName || ctx.client.name},\n\nWe would be pleased to support ${ctx.client.name} with our accountancy services.`,
      pricingNotes: 'Review fees against your standard rate card before sending.',
      validUntilDays: 30,
    };
  }

  await assertAiBudget(tenantId);

  const raw = await chatCompletion(
    [
      { role: 'system', content: UK_SYSTEM },
      {
        role: 'user',
        content: `Auto-fit a UK accountancy proposal for this client. Return JSON only:
{
  "suggestedTitle": "max 8 words",
  "services": [
    { "serviceId": "<uuid from catalog>", "billingFrequency": "MONTHLY|QUARTERLY|ANNUALLY|WEEKLY|ONE_TIME", "rationale": "one sentence" }
  ],
  "coverLetterTone": "PROFESSIONAL|FRIENDLY|MODERN",
  "coverLetterDraft": "3-4 plain text paragraphs",
  "pricingNotes": "1-2 sentences on pricing approach",
  "validUntilDays": 30
}
Only use serviceId from catalog. Pick billingFrequency from each service's allowedBilling.

Context:
${JSON.stringify(
  {
    client: ctx.client,
    companiesHouse: ctx.companiesHouse,
    catalog: catalogForPrompt,
    priorAcceptedServices: priorAccepted,
  },
  null,
  2
)}`,
      },
    ],
    { jsonMode: true, temperature: 0.35, maxTokens: 1600 }
  );

  const parsed = parseJsonResponse<{
    suggestedTitle: string;
    services: Array<{ serviceId: string; billingFrequency: string; rationale: string }>;
    coverLetterTone: 'PROFESSIONAL' | 'FRIENDLY' | 'MODERN';
    coverLetterDraft: string;
    pricingNotes: string;
    validUntilDays?: number;
  }>(raw);

  const catalogIds = new Set(ctx.catalog.map((c) => c.id));
  const services: AutoFitServiceSuggestion[] = (parsed.services || [])
    .filter((s) => catalogIds.has(s.serviceId))
    .map((s) => {
      const template = ctx.catalog.find((c) => c.id === s.serviceId)!;
      let billing = s.billingFrequency?.toUpperCase() || template.defaultBilling;
      if (!VALID_BILLING_FREQUENCIES.includes(billing as (typeof VALID_BILLING_FREQUENCIES)[number])) {
        billing = template.defaultBilling;
      }
      return {
        serviceId: s.serviceId,
        name: template.name,
        billingFrequency: billing,
        displayPrice: template.defaultPrice,
        rationale: s.rationale,
      };
    });

  const tone = ['PROFESSIONAL', 'FRIENDLY', 'MODERN'].includes(parsed.coverLetterTone)
    ? parsed.coverLetterTone
    : 'PROFESSIONAL';

  await logAiUsage(tenantId, userId, 'auto_fit_proposal', {
    clientId,
    serviceCount: services.length,
  });

  return {
    suggestedTitle: parsed.suggestedTitle?.trim() || `Proposal for ${ctx.client.name}`,
    services,
    coverLetterTone: tone,
    coverLetterDraft: parsed.coverLetterDraft?.trim() || '',
    pricingNotes: parsed.pricingNotes?.trim() || '',
    validUntilDays: parsed.validUntilDays || 30,
  };
}