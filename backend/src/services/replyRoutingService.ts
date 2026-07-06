/**
 * Client reply triage — Clara drafts a partner-ready response from inbound email content.
 */
import { chatCompletion, parseJsonResponse } from './ai/aiClient.js';
import { logAiUsage } from './ai/proposalAiService.js';

export interface ReplyTriageInput {
  from: string;
  subject: string;
  body: string;
  proposalId?: string;
  clientName?: string;
}

export interface ReplyTriageResult {
  category: 'acceptance_query' | 'pricing_objection' | 'scope_question' | 'scheduling' | 'other';
  urgency: 'low' | 'medium' | 'high';
  suggestedStatus?: string;
  draftReply: string;
  partnerNotes: string;
}

export async function triageClientReply(
  tenantId: string,
  userId: string | undefined,
  input: ReplyTriageInput
): Promise<ReplyTriageResult> {
  const prompt = `You are Clara, an AI assistant for a UK accountancy practice using Engage proposals.

A client has replied to a proposal email. Triage the reply and draft a professional UK English response for the partner to review before sending.

Client: ${input.clientName || input.from}
Subject: ${input.subject}
Body:
${input.body.slice(0, 4000)}

Return JSON only:
{
  "category": "acceptance_query|pricing_objection|scope_question|scheduling|other",
  "urgency": "low|medium|high",
  "suggestedStatus": "optional proposal status hint",
  "draftReply": "full email draft the partner can send",
  "partnerNotes": "brief internal note for the partner"
}`;

  const raw = await chatCompletion(
    [
      {
        role: 'system',
        content: 'You help UK accountants respond to client proposal replies. Use UK English.',
      },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.4, maxTokens: 1200 }
  );

  const parsed = parseJsonResponse<ReplyTriageResult>(raw.content);

  await logAiUsage(tenantId, userId, 'reply_triage', {
    proposalId: input.proposalId,
    category: parsed.category,
  });

  return parsed;
}
