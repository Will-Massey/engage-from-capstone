/**
 * AML check provider contract (R2.1) — SmartSearch / Creditsafe / stub share a
 * single submit surface so amlService needs no per-provider branching.
 */

export type AmlProvider = 'smartsearch' | 'creditsafe' | 'stub';

export interface AmlProviderClientInput {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  amlSubmissionData: string | null;
}

export interface AmlProviderSubmitInput {
  ref: string;
  client: AmlProviderClientInput;
  webhookUrl: string;
}

export interface AmlProviderSubmitResult {
  providerRef: string;
  message: string;
}

export interface AmlCheckProvider {
  name: AmlProvider;
  isConfigured(): boolean;
  submitCheck(input: AmlProviderSubmitInput): Promise<AmlProviderSubmitResult>;
}

export class AmlPartnerApiError extends Error {
  constructor(
    message: string,
    public readonly provider: AmlProvider,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'AmlPartnerApiError';
  }
}
