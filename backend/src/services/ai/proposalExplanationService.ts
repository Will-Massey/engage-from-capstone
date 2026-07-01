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
  services: Array<{ name: string; billingFrequency?: string; billingCycle?: string }>;
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
    select: { name: true, contactName: true, companyType: true },
  });
  if (!client) {
    throw new ApiError('CLIENT_NOT_FOUND', 'Client not found', 404);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });

  const addressee = coverLetterAddressee(client);
  const serviceList = input.services
    .slice(0, 8)
    .map((s) => {
      const cadence = (s.billingFrequency || s.billingCycle || 'MONTHLY').toUpperCase();
      return s.name + (BILLING_SHORT[cadence] ? ` (${BILLING_SHORT[cadence]})` : '');
    })
    .join(', ');

  const totalHint = [
    input.monthlyTotal ? `~£${Math.round(input.monthlyTotal)}/month` : null,
    input.contractTotal ? `total ~£${Math.round(input.contractTotal)}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const prompt = `Write ONE short paragraph (max 70 words, UK English) for ${addressee} at ${client.name}.
Practice: ${tenant?.name || 'the firm'}. Proposal: "${input.title}".
Services: ${serviceList}.${totalHint ? ` Investment: ${totalHint}.` : ''}
Tone: warm, confident, subtle positive NLP — focus on clarity, peace of mind, and practical benefits (not hype).
No salutation, no sign-off, no bullet points, no invented credentials or years of experience. Plain prose only.`;

  const { content, usage } = await chatCompletion(
    [
      {
        role: 'system',
        content:
          'You are a UK accountancy proposal writer. One concise client-facing paragraph. Professional, reassuring, specific to the services listed.',
      },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.35, maxTokens: 110 }
  );

  const explanation = content.trim();
  await logAiUsage(tenantId, userId, 'proposal_explanation', {
    ...usage,
    clientId: input.clientId,
    serviceCount: input.services.length,
  });

  return explanation;
}