/** Shared production security gates */
export const isProduction = process.env.NODE_ENV === 'production';

export const allowPublicRegister =
  !isProduction || process.env.ALLOW_PUBLIC_REGISTER === 'true';

export const allowPublicTenantSignup =
  !isProduction || process.env.ALLOW_PUBLIC_TENANT_SIGNUP === 'true';

export const rateLimitingEnabled = process.env.RATE_LIMIT_ENABLED !== 'false';
