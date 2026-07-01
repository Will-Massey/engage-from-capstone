/**
 * Token-efficient client-facing proposal explanation (NLP-positive, per-proposal).
 */
import { prisma } from '../../config/database.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { AI_COPILOT } from '../../config/aiCopilot.js';
import { chatCompletion, checkAiTokenBudget, isAiConfigured } from './aiClient.js';
import { logAiUsage } from './proposalAiService.js';
import { coverLetterAddressee } from '../../utils/proposalDisplay.js';

export interface ProposalExplanationInput {
  clientId: string;
  title: string;
  services: Array<{
    name: string;
    description?: string;
    billingFrequency?: string;
    billingCycle?: string;
  }>;
  monthlyTotal?: number;
  annualTotal?: number;
  contractTotal?: number;
}

const BILLING_SHORT: Record<string, string> = {
  MONTHLY: 'mo',
  QUARTERLY: 'qtr',
  ANNUALLY: 'yr',
  WEEKLY: 'wk',
  ONE_TIME: 'once',
};

export async function generateProposalExplanation(
  tenantId: string,
  userId: string | undefined,
  input: ProposalExplanationInput
): Promise<string> {
  if (!isAiConfigured()) {
    throw new ApiError('AI_NOT_CONFIGURED', `${AI_COPILOT.name} is not configured on this server`, 503);
  }

  const budget = await checkAiTokenBudget(tenantId);
  if (!budget.withinBudget) {
    throw new ApiError('AI_BUDGET_EXCEEDED', `${AI_COPILOT.name} monthly usage limit reached`, 429);
  }

  const client = await prisma.client.findFirst({
    where: { id: input.clientId, tenantId },
    select: { name: true, contactName: true, companyType: true, industry: true },
  });
  if (!client) {
    throw new ApiError('CLIENT_NOT_FOUND', 'Client not found', 404);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });

  const addressee = coverLetterAddressee(client);
  const companyType = client.companyType?.replace(/_/g, ' ') || 'business';
  const industry = client.industry?.trim() || '';

  const serviceBlocks = input.services.slice(0, 10).map((s) => {
    const cadence = (s.billingFrequency || s.billingCycle || 'MONTHLY').toUpperCase();
    const cadenceLabel = BILLING_SHORT[cadence] || cadence.toLowerCase();
    const desc = s.description?.trim();
    return desc
      ? `- ${s.name} (${cadenceLabel}): ${desc.slice(0, 120)}`
      : `- ${s.name} (${cadenceLabel})`;
  });

  const totalHint = [
    input.monthlyTotal ? `~£${Math.round(input.monthlyTotal)}/month recurring` : null,
    input.contractTotal ? `~£${Math.round(input.contractTotal)} total contract value` : null,
  ]
    .filter(Boolean)
    .join('; ');

  const prompt = `Write a client-facing sales narrative for a UK accountancy proposal.

Addressee: ${addressee} (speak directly to them — use "you" and "your").
Business: ${client.name} (${companyType}${industry ? `, ${industry}` : ''}).
Practice: ${tenant?.name || 'the firm'}.
Proposal title: "${input.title}".
${totalHint ? `Investment indication: ${totalHint}.` : ''}

Services included:
${serviceBlocks.join('\n')}

Requirements:
- Open with "Dear ${addressee}," then write 3–4 substantial paragraphs (220–320 words total), UK English.
- Paragraph 1: warmly acknowledge their business and why this proposal fits them now.
- Paragraphs 2–3: walk through the services listed — name each one and explain the practical benefit to ${client.name} (compliance, clarity, time saved, risk reduced, growth support — tie benefits to their situation).
- Final paragraph: confident, reassuring close — what working together will feel like; invite them to review the detail below. No hard sell or pressure.
- Subtle positive NLP (clarity, confidence, peace of mind) — professional accountant tone, not marketing hype.
- Do NOT invent credentials, awards, or years of experience.
- No bullet points in the output. Plain prose paragraphs only.`;

  const { content, usage } = await chatCompletion(
    [
      {
        role: 'system',
        content:
          'You are a senior UK accountancy partner writing a persuasive but trustworthy proposal narrative. Address the client by name. Be specific about each service and its business benefit. UK spelling throughout.',
      },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.45, maxTokens: 520 }
  );

  const explanation = content.trim();
  await logAiUsage(tenantId, userId, 'proposal_explanation', {
    ...usage,
    clientId: input.clientId,
    serviceCount: input.services.length,
  });

  return explanation;
}