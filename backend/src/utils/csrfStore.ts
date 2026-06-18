/**
 * Server-side CSRF token registry for cross-domain deployments where the
 * double-submit cookie may not be sent (e.g. Vercel frontend + Render API).
 */
const tokens = new Map<string, number>();
const TTL_MS = 24 * 60 * 60 * 1000;

export function registerCsrfToken(token: string): void {
  tokens.set(token, Date.now() + TTL_MS);
}

export function isCsrfTokenRegistered(token: string): boolean {
  const expires = tokens.get(token);
  if (!expires) return false;
  if (expires < Date.now()) {
    tokens.delete(token);
    return false;
  }
  return true;
}

export function revokeCsrfToken(token: string): void {
  tokens.delete(token);
}
