import { Response } from 'express';
import { generateCsrfToken } from '../middleware/auth.js';
import { registerCsrfToken } from './csrfStore.js';

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string
): { csrfToken: string } {
  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'strict',
    maxAge: 24 * 60 * 60 * 1000,
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  const csrfToken = generateCsrfToken();
  registerCsrfToken(csrfToken);
  res.cookie('csrfToken', csrfToken, {
    httpOnly: false,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'strict',
    maxAge: 24 * 60 * 60 * 1000,
  });

  return { csrfToken };
}

/** Issue a fresh CSRF token (session bootstrap without rotating JWT cookies). */
export function issueCsrfToken(res: Response): string {
  const isProduction = process.env.NODE_ENV === 'production';
  const csrfToken = generateCsrfToken();
  registerCsrfToken(csrfToken);
  res.cookie('csrfToken', csrfToken, {
    httpOnly: false,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'strict',
    maxAge: 24 * 60 * 60 * 1000,
  });
  return csrfToken;
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  res.clearCookie('csrfToken');
}
