/**
 * AI Email Assistant — delegates to proposal AI service for follow-ups.
 */
import {
  generateAiFollowUp,
  isAiConfigured,
} from './ai/proposalAiService.js';

export interface Proposal {
  id?: string;
  client: { name: string };
  services: Array<{ name: string }>;
  total: number;
  sentAt?: Date;
}

export class AIEmailService {
  isAvailable(): boolean {
    return isAiConfigured();
  }

  async generateFollowUpEmail(
    proposal: Proposal & { id: string },
    tone: 'friendly' | 'professional' | 'urgent' = 'professional',
    tenantId: string,
    userId?: string
  ): Promise<{ subject: string; body: string }> {
    const draft = await generateAiFollowUp(tenantId, userId, proposal.id, tone);
    return { subject: draft.subject, body: draft.body };
  }

  async suggestEmailSubject(proposal: Proposal): Promise<string[]> {
    return [
      `Your proposal from ${proposal.client.name}`,
      `Following up: accounting services proposal`,
      `Quick question about your engagement letter`,
    ];
  }

  async improveEmail(
    emailText: string,
    _goal: 'professional' | 'concise' | 'persuasive'
  ): Promise<string> {
    if (!isAiConfigured()) {
      return emailText;
    }
    const { chatCompletion } = await import('./ai/aiClient.js');
    return chatCompletion(
      [
        {
          role: 'system',
          content: 'Improve this UK business email. Keep UK English. Return only the improved email.',
        },
        { role: 'user', content: emailText },
      ],
      { temperature: 0.4 }
    );
  }
}

export const aiEmailService = new AIEmailService();
export default aiEmailService;
