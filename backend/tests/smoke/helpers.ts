import type { Response } from 'supertest';

export function getCookieValue(res: Response, name: string): string {
  const raw = res.headers['set-cookie'];
  if (!raw) return '';
  const lines = Array.isArray(raw) ? raw : [String(raw)];
  for (const line of lines) {
    const match = line.match(new RegExp(`${name}=([^;]+)`));
    if (match) return match[1];
  }
  return '';
}

/** Login issues httpOnly cookies; legacy JSON tokens are no longer returned. */
export function getAccessTokenFromLogin(res: Response): string {
  const fromCookie = getCookieValue(res, 'accessToken');
  if (fromCookie) return fromCookie;
  return res.body?.data?.tokens?.accessToken ?? '';
}

export function getCsrfFromLogin(res: Response): string {
  return getCookieValue(res, 'csrfToken') || res.body?.data?.csrfToken || '';
}
