/** Shared production security gates */
import { secureCompare } from './secureCompare.js';

export const isProduction = process.env.NODE_ENV === 'production';

export const allowPublicRegister = !isProduction || process.env.ALLOW_PUBLIC_REGISTER === 'true';

export const allowPublicTenantSignup =
  !isProduction || process.env.ALLOW_PUBLIC_TENANT_SIGNUP === 'true';

export const rateLimitingEnabled = process.env.RATE_LIMIT_ENABLED !== 'false';

/**
 * Playwright build verification — skip throttles when header present.
 * In production the plain header is ignored: the request must also carry
 * `X-Test-Mode-Secret` matching `E2E_BYPASS_SECRET` (unset = no bypass at all).
 */
export function isE2eTestRequest(headers: {
  [key: string]: string | string[] | undefined;
}): boolean {
  const raw = headers['x-test-mode'];
  const mode = Array.isArray(raw) ? raw[0] : raw;
  if (mode !== 'e2e-build' && mode !== 'e2e') {
    return false;
  }
  if (!isProduction) {
    return true;
  }

  const expected = process.env.E2E_BYPASS_SECRET;
  if (!expected) {
    return false;
  }
  const secretRaw = headers['x-test-mode-secret'];
  const provided = Array.isArray(secretRaw) ? secretRaw[0] : secretRaw;
  return secureCompare(provided, expected);
}

/** Shared skip predicate for express-rate-limit */
export function shouldSkipRateLimit(headers: {
  [key: string]: string | string[] | undefined;
}): boolean {
  return !rateLimitingEnabled || isE2eTestRequest(headers);
}
