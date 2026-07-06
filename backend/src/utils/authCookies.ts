import { Response } from 'express';
import { generateCsrfToken } from '../middleware/auth.js';
import { registerCsrfToken } from './csrfStore.js';

function hostsDiffer(a: string, b: string): boolean {
  try {
    const hostA = new URL(a.startsWith('http') ? a : `https://${a}`).hostname;
    const hostB = new URL(b.startsWith('http') ? b : `https://${b}`).hostname;
    return hostA !== hostB;
  } catch {
    return false;
  }
}

function cookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  maxAge: number;
  path: string;
  domain?: string;
} {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookiePath = process.env.AUTH_COOKIE_PATH || '/';
  const frontendUrl = process.env.FRONTEND_URL || '';
  const apiUrl = process.env.API_URL || '';
  const crossSite = isProduction && frontendUrl && apiUrl && hostsDiffer(frontendUrl, apiUrl);

  const opts = {
    httpOnly: true,
    secure: isProduction,
    sameSite: (crossSite ? 'none' : isProduction ? 'lax' : 'strict') as 'strict' | 'lax' | 'none',
    maxAge: 24 * 60 * 60 * 1000,
    path: cookiePath,
  };

  if (crossSite && frontendUrl.includes('capstonesoftware.co.uk')) {
    return { ...opts, domain: '.capstonesoftware.co.uk' };
  }

  return opts;
}

function csrfCookieOptions() {
  const base = cookieOptions();
  return { ...base, httpOnly: false };
}

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  options?: { rememberMe?: boolean }
): { csrfToken: string } {
  const opts = cookieOptions();
  const csrfOpts = csrfCookieOptions();
  const refreshDays = options?.rememberMe ? 30 : 7;

  res.cookie('accessToken', accessToken, opts);
  res.cookie('refreshToken', refreshToken, {
    ...opts,
    maxAge: refreshDays * 24 * 60 * 60 * 1000,
  });

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
  const opts = cookieOptions();
  const clearOpts = { path: opts.path, ...(opts.domain ? { domain: opts.domain } : {}) };
  res.clearCookie('accessToken', clearOpts);
  res.clearCookie('refreshToken', clearOpts);
  res.clearCookie('csrfToken', { ...clearOpts, httpOnly: false });
}
