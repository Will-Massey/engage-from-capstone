import { Response } from 'express';
import { generateCsrfToken } from '../middleware/auth.js';

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string
): void {
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
  res.cookie('csrfToken', csrfToken, {
    httpOnly: false,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'strict',
    maxAge: 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  res.clearCookie('csrfToken');
}
