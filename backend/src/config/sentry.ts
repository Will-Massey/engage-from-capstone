import * as Sentry from '@sentry/node';
import { env } from './env.js';

let enabled = false;

/**
 * Initialise Sentry for backend error monitoring. No-op unless SENTRY_DSN is
 * set, so local and CI runs stay silent while production reports 500s, failed
 * payouts, and webhook errors. Call once, as early as possible in bootstrap.
 */
export function initSentry(): void {
  if (!env.SENTRY_DSN) return;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    // Errors only by default; opt into perf tracing later via env if wanted.
    tracesSampleRate: 0,
    // Don't ship request bodies / headers that may contain PII or secrets.
    sendDefaultPii: false,
  });
  enabled = true;
}

export function isSentryEnabled(): boolean {
  return enabled;
}

/** Report an unexpected error (safe no-op when Sentry is not configured). */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

export { Sentry };
