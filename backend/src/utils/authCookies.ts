import { Response } from 'express';
import { generateCsrfToken } from '../middleware/auth.js';
import { registerCsrfToken } from './csrfStore.js';

function cookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  maxAge: number;
  path: string;
} {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookiePath = process.env.AUTH_COOKIE_PATH || '/';
  const sameOriginPath =
    isProduction && (cookiePath !== '/' || process.env.FRONTEND_URL?.includes('/engage'));

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: sameOriginPath ? 'lax' : isProduction ? 'none' : 'strict',
    maxAge: 24 * 60 * 60 * 1000,
    path: cookiePath,
  };
}

function csrfCookieOptions() {
  const base = cookieOptions();
  return { ...base, httpOnly: false };
}

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string
): { csrfToken: string } {
  const opts = cookieOptions();
  const csrfOpts = csrfCookieOptions();

  res.cookie('accessToken', accessToken, opts);
  res.cookie('refreshToken', refreshToken, { ...opts, maxAge: 7 * 24 * 60 * 60 * 1000 });

  const csrfToken = generateCsrfToken();
  registerCsrfToken(csrfToken);
  res.cookie('csrfToken', csrfToken, csrfOpts);

  return { csrfToken };
}

/** Issue a fresh CSRF token (session bootstrap without rotating JWT cookies). */
export function issueCsrfToken(res: Response): string {
  const csrfToken = generateCsrfToken();
  registerCsrfToken(csrfToken);
  res.cookie('csrfToken', csrfToken, csrfCookieOptions());
  return csrfToken;
}

export function clearAuthCookies(res: Response): void {
  const path = process.env.AUTH_COOKIE_PATH || '/';
  res.clearCookie('accessToken', { path });
  res.clearCookie('refreshToken', { path });
  res.clearCookie('csrfToken', { path });
}
