/** Shared production security gates */
export const isProduction = process.env.NODE_ENV === 'production';

export const allowPublicRegister =
  !isProduction || process.env.ALLOW_PUBLIC_REGISTER === 'true';

export const allowPublicTenantSignup =
  !isProduction || process.env.ALLOW_PUBLIC_TENANT_SIGNUP === 'true';

export const rateLimitingEnabled = process.env.RATE_LIMIT_ENABLED !== 'false';

/** Playwright build verification — skip throttles when header present */
export function isE2eTestRequest(headers: { [key: string]: string | string[] | undefined }): boolean {
  const mode = headers['x-test-mode'];
  return mode === 'e2e-build' || mode === 'e2e';
}
