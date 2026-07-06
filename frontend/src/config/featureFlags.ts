/**
 * Frontend feature flags — keep in sync with backend/src/config/featureFlags.ts (W2.6).
 * Stub AI features stay hidden until implemented.
 */
export const AI_FEATURE_FLAGS = {
  benchmarkPricing: import.meta.env.VITE_FEATURE_BENCHMARK_PRICING === 'true',
  regulatoryWatcher: import.meta.env.VITE_FEATURE_REGULATORY_WATCHER === 'true',
} as const;

export type AiFeatureFlag = keyof typeof AI_FEATURE_FLAGS;
