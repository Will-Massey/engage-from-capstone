/**
 * Shared helpers and rate limiters for public proposal share routes
 */

import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { rateLimitingEnabled } from '../../utils/securityFlags.js';

export function hashShareToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 24);
}

/** 10 AI requests per hour per share token — no PII in rate-limit keys */
export const publicProposalAiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  skip: () => !rateLimitingEnabled,
  keyGenerator: (req) => `public-proposal-ai:${hashShareToken(req.params.token)}`,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many questions. Please try again in an hour.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/** 5 sign/decline attempts per share token per hour */
export const publicSignDeclineLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  skip: () => !rateLimitingEnabled,
  keyGenerator: (req) =>
    `public-proposal-action:${hashShareToken(req.params.token)}:${req.ip || 'unknown'}`,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many attempts. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});
