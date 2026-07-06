/**
 * Feature flags for in-progress AI capabilities (W2.6).
 * Stub endpoints stay available for smoke tests when env vars are set.
 */
function envFlag(name: string): boolean {
  return process.env[name]?.trim().toLowerCase() === 'true';
}

export const AI_FEATURE_FLAGS = {
  /** Anonymised cross-practice fee benchmarks — not yet production-ready */
  benchmarkPricing: envFlag('FEATURE_BENCHMARK_PRICING'),
  /** Regulatory change watcher — not yet production-ready */
  regulatoryWatcher: envFlag('FEATURE_REGULATORY_WATCHER'),
} as const;

export type AiFeatureFlag = keyof typeof AI_FEATURE_FLAGS;
