/**
 * AI Email Assistant Service
 * Generates context-aware email content using OpenAI
 *
 * NOTE: This service is currently disabled as OpenAI integration is not configured.
 * To enable, install the openai package and configure OPENAI_API_KEY environment variable.
 */

// Stub implementation - AI email service not available
export interface Proposal {
  client: {
    name: string;
  };
  services: Array<{ name: string }>;
  total: number;
  sentAt?: Date;
}

export class AIEmailService {
  private throwNotImplemented(): never {
    throw new Error('AI email service not implemented');
  }

  /**
   * Generate a follow-up email for a proposal
   */
  async generateFollowUpEmail(
    _proposal: Proposal,
    _tone: 'friendly' | 'professional' | 'urgent' = 'professional'
  ): Promise<string> {
    this.throwNotImplemented();
  }

  /**
   * Suggest email subject lines
   */
  async suggestEmailSubject(_proposal: Proposal): Promise<string[]> {
    this.throwNotImplemented();
  }

  /**
   * Improve email content
   */
  async improveEmail(
    _emailText: string,
    _goal: 'professional' | 'concise' | 'persuasive'
  ): Promise<string> {
    this.throwNotImplemented();
  }
}

export const aiEmailService = new AIEmailService();
export default aiEmailService;
