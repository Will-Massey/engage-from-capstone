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
    throw new ApiError(
      'AI_NOT_CONFIGURED',
      `${AI_COPILOT.name} is not configured on this server`,
      503
    );
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

  const prompt = `Write the opening proposal letter for a UK accountancy firm — this IS the cover letter the client reads first.

Addressee: ${addressee} (speak directly to them — use "you" and "your" throughout).
Business: ${client.name} (${companyType}${industry ? `, ${industry}` : ''}).
Practice: ${tenant?.name || 'the firm'}.
Proposal title: "${input.title}".
${totalHint ? `Investment indication: ${totalHint}.` : ''}

Services included (you MUST reference each by name and sell its value):
${serviceBlocks.join('\n')}

Requirements:
- Open with "Dear ${addressee}," then write 6–7 substantial, flowing paragraphs (550–750 words), UK English. This is the firm's flagship first impression — make it genuinely impressive and bespoke, never generic or templated.
- Paragraph 1: personal, warm opening — acknowledge ${client.name} by name, reflect their specific situation (${companyType}${industry ? `, ${industry}` : ''}), and articulate why now is the right moment for this engagement.
- Middle paragraphs: persuasive, benefit-led prose — for EACH service listed, give it real space: explain what it is, precisely what it delivers for THEIR business, and the tangible outcome they gain (compliance certainty, reclaimed time, sharper decisions, reduced risk, headroom to grow). Weave the services into a narrative of how you'll support them across the year, not a list. Make them feel the value long before they reach the fee table.
- A paragraph on how you work: proactive, responsive, plain-English advice; a named point of contact; technology that keeps them ahead of deadlines (MTD, filing dates). Build trust and reassurance.
- Final paragraph: confident, personal close — the partnership you're offering, and a warm invitation to review the services and fees that follow and to speak with any questions. Sign off with "Yours sincerely," on its own line (no fabricated name after it).
- Tone: a senior partner who genuinely wants their success — warm, expert, persuasive; never pushy, hypey, or robotic. Vary sentence rhythm so it reads as written by a person, not a template.
- Do NOT invent credentials, ICAEW/ACCA membership years, awards, or client counts.
- No bullet points, headings, or markdown. Plain prose paragraphs separated by blank lines only.`;

  const { content, usage } = await chatCompletion(
    [
      {
        role: 'system',
        content:
          'You are a senior UK accountancy partner writing a compelling, client-facing proposal letter. This letter is the primary sales document — verbose, personal, and benefit-led. Name every service and sell its value. UK spelling throughout.',
      },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.6, maxTokens: 1600 }
  );

  const explanation = content.trim();
  await logAiUsage(tenantId, userId, 'proposal_explanation', {
    ...usage,
    clientId: input.clientId,
    serviceCount: input.services.length,
  });

  return explanation;
}
