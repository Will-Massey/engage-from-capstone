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

/** Strip internal fields — only data already visible on the public proposal page */
export function buildPublicProposalContext(proposal: PublicProposalRecord) {
  return {
    reference: proposal.reference,
    title: proposal.title,
    status: proposal.status,
    validUntil: proposal.validUntil.toISOString().slice(0, 10),
    subtotal: proposal.subtotal,
    vatAmount: proposal.vatAmount,
    total: proposal.total,
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
      billingFrequency: s.billingFrequency || s.frequency,
      isOptional: s.isOptional,
      oneOffDueDate: s.oneOffDueDate
        ? new Date(s.oneOffDueDate).toISOString().slice(0, 10)
        : null,
    })),
  };
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
    `Total fees shown: £${ctx.total.toFixed(2)} (including VAT of £${ctx.vatAmount.toFixed(2)}). Payment terms: ${ctx.paymentTerms}.`,
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
          'Explain what they are agreeing to, key services, total cost, payment terms, validity, and that signing accepts the terms. ' +
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