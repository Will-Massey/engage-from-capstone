/**
 * Public proposal AI — client-facing Q&A and signing summary.
 * Answers ONLY from the proposal JSON supplied; no external facts.
 */
import { prisma } from '../../config/database.js';
import logger from '../../config/logger.js';
import { AI_COPILOT } from '../../config/aiCopilot.js';
import { chatCompletion, isAiConfigured } from './aiClient.js';

const UNKNOWN_ANSWER = "I don't have that in the proposal.";

const PUBLIC_SYSTEM =
  `You are ${AI_COPILOT.name}, the built-in assistant on a public Engage proposal page for a UK accountancy practice. ` +
  'You speak as part of the Engage product — never mention Grok, xAI, OpenAI, ChatGPT, or other providers. ' +
  'Use UK English spelling (organisation, specialised, favour). ' +
  'CRITICAL RULES:\n' +
  '1. Answer ONLY using the proposal JSON provided below. Do not use outside knowledge, web facts, or assumptions.\n' +
  `2. If the answer is not clearly stated in the proposal JSON, reply with exactly: "${UNKNOWN_ANSWER}"\n` +
  '3. Do not give legal, tax, or financial advice beyond summarising what the proposal states.\n' +
  '4. Be concise, friendly, and professional (2–5 sentences unless listing services or fees).\n' +
  '5. Never invent deadlines, fees, services, or terms not present in the proposal.';

type PublicProposalRecord = NonNullable<
  Awaited<ReturnType<typeof import('../proposalSharingService.js').getProposalByShareToken>>
>;

type ProposalServiceLine = PublicProposalRecord['services'][number];

function lineBillingFrequency(service: ProposalServiceLine): string {
  return String(service.billingFrequency || service.frequency || 'MONTHLY').toUpperCase();
}

function lineGrossTotal(service: ProposalServiceLine): number {
  if (service.grossTotal > 0) return service.grossTotal;
  const net = service.lineTotal ?? service.unitPrice * service.quantity;
  return net + (service.vatAmount ?? 0);
}

export type SigningCostBreakdown = {
  dueToday: { amount: number; vatAmount: number; label: string } | null;
  recurring: {
    label: string;
    amount: number;
    vatAmount: number;
    periodPhrase: string;
    frequency: string;
  } | null;
  primaryFrequency: string;
};

/** Fee breakdown for signing summary — due today vs recurring, never annualised monthly totals. */
export function computeSigningCostSummary(proposal: PublicProposalRecord): SigningCostBreakdown {
  const coreServices = proposal.services.filter((s) => !s.isOptional);
  const byFrequency = new Map<string, { gross: number; vat: number }>();

  for (const service of coreServices) {
    const freq = lineBillingFrequency(service);
    const bucket = byFrequency.get(freq) ?? { gross: 0, vat: 0 };
    bucket.gross += lineGrossTotal(service);
    bucket.vat += service.vatAmount ?? 0;
    byFrequency.set(freq, bucket);
  }

  const oneTimeGross = byFrequency.get('ONE_TIME')?.gross ?? 0;
  const oneTimeVat = byFrequency.get('ONE_TIME')?.vat ?? 0;
  const monthlyGross =
    (byFrequency.get('MONTHLY')?.gross ?? 0) + (byFrequency.get('WEEKLY')?.gross ?? 0);
  const monthlyVat =
    (byFrequency.get('MONTHLY')?.vat ?? 0) + (byFrequency.get('WEEKLY')?.vat ?? 0);
  const quarterlyGross = byFrequency.get('QUARTERLY')?.gross ?? 0;
  const quarterlyVat = byFrequency.get('QUARTERLY')?.vat ?? 0;
  const annualGross = byFrequency.get('ANNUALLY')?.gross ?? 0;
  const annualVat = byFrequency.get('ANNUALLY')?.vat ?? 0;

  const dueToday =
    oneTimeGross > 0
      ? { amount: oneTimeGross, vatAmount: oneTimeVat, label: 'Due today (one-off fees)' }
      : null;

  let recurring: SigningCostBreakdown['recurring'] = null;
  if (monthlyGross > 0) {
    recurring = {
      label: 'Monthly recurring fee',
      amount: monthlyGross,
      vatAmount: monthlyVat,
      periodPhrase: 'per month',
      frequency: 'MONTHLY',
    };
  } else if (quarterlyGross > 0) {
    recurring = {
      label: 'Quarterly recurring fee',
      amount: quarterlyGross,
      vatAmount: quarterlyVat,
      periodPhrase: 'per quarter',
      frequency: 'QUARTERLY',
    };
  } else if (annualGross > 0) {
    recurring = {
      label: 'Annual recurring fee',
      amount: annualGross,
      vatAmount: annualVat,
      periodPhrase: 'per year',
      frequency: 'ANNUALLY',
    };
  }

  if (!dueToday && !recurring) {
    const paymentFrequency = String(proposal.paymentFrequency || 'MONTHLY').toUpperCase();
    if (paymentFrequency === 'ONE_TIME') {
      return {
        dueToday: {
          amount: proposal.total,
          vatAmount: proposal.vatAmount,
          label: 'Due today (one-off fees)',
        },
        recurring: null,
        primaryFrequency: 'ONE_TIME',
      };
    }
    if (paymentFrequency === 'ANNUALLY') {
      return {
        dueToday: null,
        recurring: {
          label: 'Annual recurring fee',
          amount: proposal.total,
          vatAmount: proposal.vatAmount,
          periodPhrase: 'per year',
          frequency: 'ANNUALLY',
        },
        primaryFrequency: 'ANNUALLY',
      };
    }
    return {
      dueToday: null,
      recurring: {
        label: 'Monthly recurring fee',
        amount: proposal.total,
        vatAmount: proposal.vatAmount,
        periodPhrase: 'per month',
        frequency: 'MONTHLY',
      },
      primaryFrequency: 'MONTHLY',
    };
  }

  return {
    dueToday,
    recurring,
    primaryFrequency: recurring?.frequency ?? 'ONE_TIME',
  };
}

/** Strip internal fields — only data already visible on the public proposal page */
export function buildPublicProposalContext(proposal: PublicProposalRecord) {
  const costSummary = computeSigningCostSummary(proposal);
  return {
    reference: proposal.reference,
    title: proposal.title,
    status: proposal.status,
    validUntil: proposal.validUntil.toISOString().slice(0, 10),
    subtotal: proposal.subtotal,
    vatAmount: proposal.vatAmount,
    total: proposal.total,
    paymentFrequency: proposal.paymentFrequency,
    costSummary,
    paymentTerms: proposal.paymentTerms,
    coverLetter: proposal.coverLetter || null,
    terms: proposal.terms || null,
    engagementLetter: proposal.engagementLetter || null,
    client: {
      name: proposal.client.name,
      companyType: proposal.client.companyType,
    },
    practice: {
      name: proposal.tenant.name,
    },
    services: proposal.services.map((s) => ({
      name: s.name,
      description: s.description || null,
      quantity: s.quantity,
      unitPrice: s.unitPrice,
      lineTotal: s.lineTotal,
      grossTotal: s.grossTotal,
      billingFrequency: s.billingFrequency || s.frequency,
      isOptional: s.isOptional,
      oneOffDueDate: s.oneOffDueDate
        ? new Date(s.oneOffDueDate).toISOString().slice(0, 10)
        : null,
    })),
  };
}

export function formatSigningCostPhrase(cost: SigningCostBreakdown): string {
  const parts: string[] = [];
  if (cost.dueToday) {
    parts.push(
      `${cost.dueToday.label}: £${cost.dueToday.amount.toFixed(2)} (including VAT of £${cost.dueToday.vatAmount.toFixed(2)}).`
    );
  }
  if (cost.recurring) {
    const period =
      cost.recurring.periodPhrase === 'in total' ? '' : ` ${cost.recurring.periodPhrase}`;
    parts.push(
      `${cost.recurring.label}: £${cost.recurring.amount.toFixed(2)}${period} (including VAT of £${cost.recurring.vatAmount.toFixed(2)}).`
    );
  }
  return parts.join(' ');
}

function ruleBasedSigningSummary(proposal: PublicProposalRecord): string {
  const ctx = buildPublicProposalContext(proposal);
  const serviceLines = ctx.services
    .filter((s) => !s.isOptional)
    .map(
      (s) =>
        `${s.name} (${s.quantity} × £${s.unitPrice.toFixed(2)}, billed ${String(s.billingFrequency).toLowerCase().replace(/_/g, ' ')})`
    );
  const optionalCount = ctx.services.filter((s) => s.isOptional).length;

  const parts = [
    `By signing, you agree to engage ${ctx.practice.name} to provide the services in proposal ${ctx.reference} ("${ctx.title}") for ${ctx.client.name}.`,
    serviceLines.length
      ? `Core services: ${serviceLines.join('; ')}.`
      : 'Review the services listed in the proposal.',
    optionalCount
      ? `${optionalCount} optional service(s) are shown for information — only agreed core services are included unless stated otherwise in the terms.`
      : null,
    `${formatSigningCostPhrase(ctx.costSummary)} Payment terms: ${ctx.paymentTerms}.`,
    `The proposal is valid until ${ctx.validUntil}. Your electronic signature confirms you accept the terms and conditions in this proposal.`,
  ].filter(Boolean);

  return parts.join(' ');
}

export async function logPublicAiUsage(
  tenantId: string,
  proposalId: string,
  feature: 'public_proposal_ask' | 'public_signing_summary' | 'public_decline_classify'
) {
  try {
    await prisma.activityLog.create({
      data: {
        tenantId,
        action: 'AI_FEATURE_USED',
        entityType: 'AI',
        entityId: proposalId,
        description: feature,
        metadata: JSON.stringify({ scope: 'public_proposal' }),
        proposalId,
      },
    });
  } catch (e) {
    logger.warn('Failed to log public AI usage', { feature });
  }
}

/** Client asks a question — answered only from proposal content */
export async function askPublicProposalQuestion(
  proposal: PublicProposalRecord,
  question: string,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
) {
  const ctx = buildPublicProposalContext(proposal);
  const trimmed = question.trim();

  if (!isAiConfigured()) {
    return {
      answer:
        `${AI_COPILOT.name} isn't available right now. Please contact ${ctx.practice.name} directly with your question.`,
      source: 'unavailable' as const,
    };
  }

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: `${PUBLIC_SYSTEM}\n\nProposal JSON:\n${JSON.stringify(ctx, null, 2)}`,
    },
  ];

  const recentHistory = (history || []).slice(-4);
  for (const turn of recentHistory) {
    messages.push({ role: turn.role, content: turn.content.slice(0, 800) });
  }

  messages.push({
    role: 'user',
    content: `Client question: ${trimmed.slice(0, 500)}`,
  });

  const { content: answer } = await chatCompletion(messages, {
    temperature: 0.2,
    maxTokens: 400,
  });

  await logPublicAiUsage(proposal.tenantId, proposal.id, 'public_proposal_ask');

  return {
    answer: answer.trim(),
    source: 'ai' as const,
  };
}

/** Plain-English summary of what the client is agreeing to when they sign */
export async function getPublicSigningSummary(proposal: PublicProposalRecord) {
  const ctx = buildPublicProposalContext(proposal);

  if (!isAiConfigured()) {
    const summary = ruleBasedSigningSummary(proposal);
    return { summary, source: 'rules' as const };
  }

  const { content: raw } = await chatCompletion(
    [
      {
        role: 'system',
        content:
          PUBLIC_SYSTEM +
          ' Write a plain-English signing summary for the client (4–6 short sentences). ' +
          'Explain what they are agreeing to, key services, payment terms, validity, and that signing accepts the terms. ' +
          'For fees, use costSummary.dueToday for any one-off amount payable today and costSummary.recurring for ongoing fees. ' +
          'When both exist, state what is due today first, then the monthly (or quarterly/annual) recurring fee. ' +
          'Do not describe an annual total when services are billed monthly. ' +
          'No bullet points — flowing prose. Do not add facts beyond the proposal JSON.',
      },
      {
        role: 'user',
        content: `Proposal JSON:\n${JSON.stringify(ctx, null, 2)}\n\nWrite the signing summary.`,
      },
    ],
    { temperature: 0.25, maxTokens: 500 }
  );

  await logPublicAiUsage(proposal.tenantId, proposal.id, 'public_signing_summary');

  return {
    summary: raw.trim(),
    source: 'ai' as const,
  };
}

export { isAiConfigured, UNKNOWN_ANSWER };