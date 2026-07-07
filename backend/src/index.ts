import dotenv from 'dotenv';
import path from 'path';

// Load environment variables FIRST, before any other imports
// backend/.env wins over repo-root dev files (override on last load)
const backendRoot = path.resolve(process.cwd());
const repoRoot = path.resolve(backendRoot, '..');
if (process.env.NODE_ENV !== 'production') {
  // Dev-only: .env.development is COMMITTED, so in production it silently
  // backfilled any var the platform didn't set (its localhost REDIS_URL
  // caused the 2026-07-06 outage; it also leaked dev API keys into prod).
  // Production must run on platform-provided env alone.
  dotenv.config({ path: path.join(repoRoot, '.env.development') });
  dotenv.config({ path: path.join(repoRoot, '.env') });
  dotenv.config({ path: path.join(backendRoot, '.env'), override: true });
}

// Validate environment immediately after dotenv — fails boot on invalid prod config
import './config/env.js';

// Initialise error monitoring early (no-op unless SENTRY_DSN is set)
import { initSentry } from './config/sentry.js';
initSentry();

import express from 'express';

// App composition modules (each moved verbatim from this file)
import { applySecurity } from './app/security.js';
import { applyCors } from './app/corsOptions.js';
import { applyRouteRateLimiters, applyGlobalApiLimiter } from './app/rateLimiters.js';
import { applyParsersAndWebhooks } from './app/parsersAndWebhooks.js';
import { mountPreCsrfRoutes } from './app/preCsrfRoutes.js';
import { mountOauthCallbackRoutes } from './app/oauthCallbackRoutes.js';
import { mountApiRoutes } from './app/apiRoutes.js';
import { mountHealthStaticAndErrors } from './app/staticSpa.js';
import {
  scheduleRenewalReminders,
  scheduleProposalChaseJob,
  scheduleTouchpointEngine,
  scheduleEmailAutomation,
} from './app/jobs.js';
import { registerProcessHandlers } from './app/shutdown.js';

// Imported (unmounted) in the original bootstrap; kept verbatim — TypeScript
// elides unused imports, so these do not load at runtime, exactly as before.
import pricingRoutes from './routes/pricing.js';
import diagnosticsRoutes from './routes/diagnostics.js';
import { asyncHandler, ApiError } from './middleware/errorHandler.js';
import { EmailService } from './services/emailService.js';

import logger, { requestLogger } from './utils/logger.js';
import { cache } from './utils/cache.js';
import { initEngageSuperadmin } from './lib/superadmin.js';
import {
  syncEngageToSuperadmin,
  isSuperadminSyncConfigured,
} from './services/superadminSyncService.js';

// Dynamic import for auto-migration to handle cases where module might not be built
let autoMigrateOnStartup: any = null;
import('./scripts/autoMigrateOnStartup.js')
  .then((mod) => {
    autoMigrateOnStartup = mod.default;
  })
  .catch(() => {
    logger.warn('Auto-migration module not available');
  });

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

/*
 * ============================================================================
 * REGISTRATION ORDER IS LOAD-BEARING — DO NOT REORDER THE CALLS BELOW.
 *
 * Express middleware/route registration order is behavior. The sequence below
 * reproduces the original bootstrap exactly:
 *   1. helmet/CSP security headers
 *   2. CORS (+ explicit preflight handler)
 *   3. per-path rate limiters (auth/admin/setup/tenants/proposals/onboarding)
 *   4. morgan logging, cookie parser, raw-body webhook mounts, body parsers,
 *      remaining webhook mounts
 *   5. pre-CSRF routes: /api/auth, /api/setup, /api/admin, public seed
 *   6. CSRF cookie + CSRF protection on /api
 *   7. request ID + request logging
 *   8. global /api rate limiter
 *   9. OAuth callback routes
 *  10. main API route mounts (share/portal/public routes before tenant routes)
 *  11. /ping + /health, static files, SPA fallback, 404 + error handlers
 * ============================================================================
 */

applySecurity(app);

applyCors(app);

applyRouteRateLimiters(app);

applyParsersAndWebhooks(app);

mountPreCsrfRoutes(app);

// Import CSRF middleware
import { setCsrfCookie, csrfProtection } from './middleware/auth.js';

// CSRF protection - set cookie on all requests
app.use(setCsrfCookie);

// Apply CSRF protection to all API routes
app.use('/api', csrfProtection);

// Request ID middleware - use crypto for better randomness
import { randomUUID } from 'crypto';
app.use((req, res, next) => {
  (req as any).requestId = randomUUID();
  next();
});

// Request logging
app.use(requestLogger);

// Initialize cache on startup (non-blocking)
cache.connect().catch((err) => {
  logger.error('Failed to connect to Redis:', err);
});

applyGlobalApiLimiter(app);

mountOauthCallbackRoutes(app);

mountApiRoutes(app);

mountHealthStaticAndErrors(app);

// Start server (skipped in Jest so supertest can import the app)
const shouldStartServer = process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID;

if (shouldStartServer) {
  const server = app.listen(PORT, () => {
    logger.info(`🚀 Engage by Capstone API running on port ${PORT}`);
    logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`🔗 API URL: http://localhost:${PORT}`);
    logger.info(`🔧 Admin endpoints available at /api/admin (requires ADMIN_SECRET_KEY)`);

    scheduleRenewalReminders();
    scheduleProposalChaseJob();
    scheduleTouchpointEngine();
    scheduleEmailAutomation();
    initEngageSuperadmin();

    if (isSuperadminSyncConfigured()) {
      syncEngageToSuperadmin()
        .then((r) => logger.info('[engage] Superadmin initial sync', r))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          logger.warn('[engage] Superadmin initial sync failed:', message);
        });

      const SUPERADMIN_SYNC_MS = 15 * 60 * 1000;
      setInterval(() => {
        syncEngageToSuperadmin().catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          logger.error('[engage] Superadmin scheduled sync failed:', message);
        });
      }, SUPERADMIN_SYNC_MS);
    }

    if (autoMigrateOnStartup) {
      setTimeout(() => {
        autoMigrateOnStartup().catch((err: any) => {
          logger.error('Auto-migration failed:', err);
        });
      }, 5000);
    }
  });

  registerProcessHandlers(server);
}

export default app;
// Deploy trigger: Fri Apr 10 15:47:18 BST 2026
