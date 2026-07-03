/** Canonical public URLs — capstonesoftware.co.uk/engage (Render upstream hidden behind engage-proxy). */
export const CANONICAL_FRONTEND_URL = 'https://capstonesoftware.co.uk/engage';
export const CANONICAL_API_URL = 'https://capstonesoftware.co.uk/engage';

export function getFrontendUrl(): string {
  return (process.env.FRONTEND_URL || CANONICAL_FRONTEND_URL).replace(/\/$/, '');
}

export function getApiUrl(): string {
  const raw =
    process.env.API_URL || process.env.BACKEND_URL || CANONICAL_API_URL;
  return raw.replace(/\/$/, '');
}

/** Public app base for a tenant — path-based until `{tenant}.engage.capstonesoftware.co.uk` is live. */
export function tenantAppUrl(_tenantSubdomain?: string): string {
  return getFrontendUrl();
}