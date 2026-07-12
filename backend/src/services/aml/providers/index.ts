/**
 * AML provider registry (R2.1). Resolution order matches the pre-refactor
 * resolveAmlProvider: requested-if-configured, else first configured, else stub.
 */

import type { AmlCheckProvider, AmlProvider } from './types.js';
import { smartsearchProvider } from './smartsearch.js';
import { creditsafeProvider } from './creditsafe.js';
import { stubProvider } from './stub.js';

export type {
  AmlCheckProvider,
  AmlProvider,
  AmlProviderClientInput,
  AmlProviderSubmitInput,
  AmlProviderSubmitResult,
} from './types.js';
export { AmlPartnerApiError } from './types.js';
export { smartsearchProvider } from './smartsearch.js';
export { creditsafeProvider } from './creditsafe.js';
export { stubProvider } from './stub.js';

export function resolveAmlCheckProvider(requested?: AmlProvider): AmlCheckProvider {
  if (requested === 'stub') return stubProvider;
  if (requested === 'smartsearch' && smartsearchProvider.isConfigured()) return smartsearchProvider;
  if (requested === 'creditsafe' && creditsafeProvider.isConfigured()) return creditsafeProvider;
  if (smartsearchProvider.isConfigured()) return smartsearchProvider;
  if (creditsafeProvider.isConfigured()) return creditsafeProvider;
  return stubProvider;
}
