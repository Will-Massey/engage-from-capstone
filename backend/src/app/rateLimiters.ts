import express from 'express';
import rateLimit from 'express-rate-limit';
import { shouldSkipRateLimit } from '../utils/securityFlags.js';
import { rateLimitStore } from '../utils/rateLimitStore.js';

// Login: only count failed attempts (successful logins do not consume quota)
const loginLimiter = rateLimit({
  store: rateLimitStore(),
  // Fail open if the store errors (e.g. Redis unreachable) — losing rate
  // limiting beats every request hanging/500ing (prod outage 2026-07-06)
  passOnStoreError: true,
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
  skip: (req) => shouldSkipRateLimit(req.headers),
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMIT',
      message: 'Too many failed sign-in attempts. Please wait a few minutes and try again.',
    },
  },
});

// CSRF token fetch is high-volume during normal use — separate generous limit
const csrfLimiter = rateLimit({
  store: rateLimitStore(),
  // Fail open if the store errors (e.g. Redis unreachable) — losing rate
  // limiting beats every request hanging/500ing (prod outage 2026-07-06)
  passOnStoreError: true,
  windowMs: 15 * 60 * 1000,
  max: 200,
  skip: (req) => shouldSkipRateLimit(req.headers),
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMIT',
      message: 'Too many requests. Please try again shortly.',
    },
  },
});

const authLimiter = rateLimit({
  store: rateLimitStore(),
  // Fail open if the store errors (e.g. Redis unreachable) — losing rate
  // limiting beats every request hanging/500ing (prod outage 2026-07-06)
  passOnStoreError: true,
  windowMs: 15 * 60 * 1000,
  max: 40,
  skip: (req) => shouldSkipRateLimit(req.headers),
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMIT',
      message: 'Too many authentication attempts, please try again later',
    },
  },
});

const privilegedLimiter = rateLimit({
  store: rateLimitStore(),
  // Fail open if the store errors (e.g. Redis unreachable) — losing rate
  // limiting beats every request hanging/500ing (prod outage 2026-07-06)
  passOnStoreError: true,
  windowMs: 15 * 60 * 1000,
  max: 20,
  skip: (req) => shouldSkipRateLimit(req.headers),
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
    },
  },
});

const tenantSignupLimiter = rateLimit({
  store: rateLimitStore(),
  // Fail open if the store errors (e.g. Redis unreachable) — losing rate
  // limiting beats every request hanging/500ing (prod outage 2026-07-06)
  passOnStoreError: true,
  windowMs: 60 * 60 * 1000,
  max: 5,
  skip: (req) => shouldSkipRateLimit(req.headers),
  message: {
    success: false,
    error: {
      code: 'SIGNUP_RATE_LIMIT',
      message: 'Too many signup attempts, please try again later',
    },
  },
});

// Stricter rate limiting for public proposal endpoints (viewing/signing)
const publicProposalLimiter = rateLimit({
  store: rateLimitStore(),
  // Fail open if the store errors (e.g. Redis unreachable) — losing rate
  // limiting beats every request hanging/500ing (prod outage 2026-07-06)
  passOnStoreError: true,
  windowMs: 15 * 60 * 1000,
  max: 30,
  skip: (req) => shouldSkipRateLimit(req.headers),
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const portalLimiter = rateLimit({
  store: rateLimitStore(),
  // Fail open if the store errors (e.g. Redis unreachable) — losing rate
  // limiting beats every request hanging/500ing (prod outage 2026-07-06)
  passOnStoreError: true,
  windowMs: 15 * 60 * 1000,
  max: 30,
  skip: (req) => shouldSkipRateLimit(req.headers),
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const amlSubmitLimiter = rateLimit({
  store: rateLimitStore(),
  // Fail open if the store errors (e.g. Redis unreachable) — losing rate
  // limiting beats every request hanging/500ing (prod outage 2026-07-06)
  passOnStoreError: true,
  windowMs: 60 * 60 * 1000,
  max: 5,
  skip: (req) => shouldSkipRateLimit(req.headers),
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many submissions. Please try again later.',
    },
  },
});

export function applyRouteRateLimiters(app: express.Express): void {
  app.use('/api/auth/login', loginLimiter);
  app.use('/api/auth/csrf-token', csrfLimiter);
  app.use('/api/auth/register', authLimiter);
  app.use('/api/auth/refresh', authLimiter);
  app.use('/api/auth/forgot-password', authLimiter);
  app.use('/api/auth/reset-password', authLimiter);
  app.use('/api/auth/2fa/login', loginLimiter);
  app.use('/api/auth/2fa/setup', authLimiter);
  app.use('/api/auth/2fa/verify', authLimiter);
  app.use('/api/auth/2fa/disable', authLimiter);

  app.use('/api/admin', privilegedLimiter);
  app.use('/api/seed-services-public', privilegedLimiter);
  app.use('/api/setup', privilegedLimiter);

  app.use('/api/tenants', (req, res, next) => {
    if (req.method === 'POST' && req.path === '/') {
      return tenantSignupLimiter(req, res, next);
    }
    next();
  });

  app.use('/api/proposals/view', publicProposalLimiter);

  app.use('/api/proposals/portal', portalLimiter);

  app.use('/api/onboarding', (req, res, next) => {
    if (req.method === 'POST') {
      return amlSubmitLimiter(req, res, next);
    }
    next();
  });
}

// Rate limiting - skip health + CSRF (has its own limiter) when disabled via env
const limiter = rateLimit({
  store: rateLimitStore(),
  // Fail open if the store errors (e.g. Redis unreachable) — losing rate
  // limiting beats every request hanging/500ing (prod outage 2026-07-06)
  passOnStoreError: true,
  windowMs: 15 * 60 * 1000,
  max: 500,
  skip: (req) => {
    if (shouldSkipRateLimit(req.headers)) return true;
    const path = req.originalUrl || req.path;
    return path.includes('/health') || path.includes('/auth/csrf-token');
  },
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
    },
  },
});

export function applyGlobalApiLimiter(app: express.Express): void {
  app.use('/api/', limiter);
}
