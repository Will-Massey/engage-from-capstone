/**
 * Stub AML provider — demo mode fallback when no partner API key is set.
 * Never calls out; the local reference doubles as the provider reference.
 */

import type { AmlCheckProvider, AmlProviderSubmitInput, AmlProviderSubmitResult } from './types.js';

async function submitStubCheck(params: AmlProviderSubmitInput): Promise<AmlProviderSubmitResult> {
  return {
    providerRef: params.ref,
    message:
      'AML check queued (demo mode). Configure SMARTSEARCH_API_KEY or CREDITSAFE_API_KEY for live checks.',
  };
}

export const stubProvider: AmlCheckProvider = {
  name: 'stub',
  isConfigured: () => true,
  submitCheck: submitStubCheck,
};
