import express from 'express';
import cors from 'cors';

// CORS configuration - allow multiple origins
const corsExtraOrigins = (process.env.CORS_EXTRA_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://capstonesoftware.co.uk',
  'https://www.capstonesoftware.co.uk',
  'https://engage.capstonesoftware.co.uk',
  'https://engage-frontend-0g6u.onrender.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://frontend-fawn-eta-13.vercel.app',
  'https://frontend-7bwwe5u7u-will-masseys-projects-b935486d.vercel.app',
  'https://frontend-o4blqd5z2-will-masseys-projects-b935486d.vercel.app',
  'https://frontend-go1ntbkne-will-masseys-projects-b935486d.vercel.app',
  ...corsExtraOrigins,
].filter(Boolean);

// Regex to match any Vercel preview URL from this project
const vercelProjectPattern =
  /^https:\/\/frontend-[a-z0-9]+-will-masseys-projects-b935486d\.vercel\.app$/;

// Regex to match any Render.com subdomain
const renderPattern = /^https:\/\/.*\.onrender\.com$/;

// Allow wildcard Render origins ONLY when explicitly enabled
const ALLOW_RENDER_WILDCARD_ORIGINS = process.env.ALLOW_RENDER_WILDCARD_ORIGINS === 'true';

// In development, allow all localhost origins
const isDevelopment = process.env.NODE_ENV !== 'production';

export const corsOptions = {
  origin: function (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ) {
    // Missing Origin = not a CORS request: same-origin GETs (browsers omit
    // Origin on those — all app traffic behind the engage-proxy worker),
    // webhooks, curl, server-to-server. Allowing it grants nothing (CORS only
    // gates browser cross-origin reads, and browsers always send Origin
    // cross-origin); rejecting it 500'd the whole API behind the worker.
    // Cross-origin abuse is still blocked below; CSRF is handled by the
    // custom-header + token checks, not by requiring Origin.
    if (!origin) {
      return callback(null, true);
    }

    // Capacitor iOS / Android WebView origins
    if (
      origin === 'capacitor://localhost' ||
      origin === 'https://localhost' ||
      origin === 'http://localhost' ||
      origin === 'ionic://localhost'
    ) {
      return callback(null, true);
    }

    // Explicit opt-in: allow any onrender.com origin (use sparingly)
    if (ALLOW_RENDER_WILDCARD_ORIGINS && origin.includes('onrender.com')) {
      return callback(null, true);
    }

    // In development, allow all localhost origins
    if (
      isDevelopment &&
      (origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:') ||
        /^http:\/\/192\.168\.\d+\.\d+:\d+$/.test(origin) ||
        /^http:\/\/100\.\d+\.\d+\.\d+:\d+$/.test(origin))
    ) {
      return callback(null, true);
    }

    // Check exact matches
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Check Vercel preview URL pattern
    if (vercelProjectPattern.test(origin)) {
      return callback(null, true);
    }

    // Optional: allow any Render.com subdomain (less permissive than includes(), still opt-in)
    if (ALLOW_RENDER_WILDCARD_ORIGINS && renderPattern.test(origin)) {
      return callback(null, true);
    }

    console.warn(`CORS blocked for origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Tenant-Id',
    'X-Request-Id',
    'X-CSRF-Token',
    'X-Test-Mode',
    'X-Test-Mode-Secret',
  ],
};

export function applyCors(app: express.Express): void {
  app.use((req, res, next) =>
    cors({ ...corsOptions, origin: corsOptions.origin.bind({ req }) })(req, res, next)
  );

  // Handle preflight requests explicitly
  app.options('*', (req, res, next) =>
    cors({ ...corsOptions, origin: corsOptions.origin.bind({ req }) })(req, res, next)
  );
}
