import dotenv from 'dotenv';
import path from 'path';

// Load environment variables FIRST, before any other imports
// backend/.env wins over repo-root dev files (override on last load)
const backendRoot = path.resolve(process.cwd());
const repoRoot = path.resolve(backendRoot, '..');
dotenv.config({ path: path.join(repoRoot, '.env.development') });
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(backendRoot, '.env'), override: true });

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { shouldSkipRateLimit } from './utils/securityFlags.js';
import stripeWebhookRoutes from './routes/stripeWebhook.js';
import { handleOAuthProviderCallback } from './handlers/oauthCallback.js';
import { handleXeroOAuthCallback } from './handlers/xeroOAuthCallback.js';
import { handleQuickBooksOAuthCallback } from './handlers/quickbooksOAuthCallback.js';

// Import routes
import authRoutes from './routes/auth.js';
import companiesHouseRoutes from './routes/companiesHouse.js';
import proposalRoutes from './routes/proposals.js';
import proposalShareRoutes from './routes/proposals-share.js';
import clientRoutes from './routes/clients.js';
import serviceRoutes from './routes/services.js';
import enhancedServiceRoutes from './routes/services-new.js';
import tenantRoutes from './routes/tenants.js';
import emailRoutes from './routes/email.js';
import paymentRoutes from './routes/payments.js';
import billingRoutes from './routes/billing.js';
import payoutRoutes from './routes/payout.js';
import coverLetterTemplateRoutes from './routes/coverLetterTemplates.js';
import proposalTemplateRoutes from './routes/proposal-templates.js';
import engagementLibraryRoutes from './routes/engagementLibrary.js';
import analyticsRoutes from './routes/analytics.js';
import touchpointRoutes from './routes/touchpoints.js';
import onboardingRoutes from './routes/onboarding.js';
import aiRoutes from './routes/ai.js';
import pricingRoutes from './routes/pricing.js';
import automationRoutes from './routes/automation.js';
import uploadsRoutes from './routes/uploads.js';
import integrationsRoutes from './routes/integrations.js';
import diagnosticsRoutes from './routes/diagnostics.js';
import xeroRoutes from './routes/xero.js';
import amlRoutes from './routes/aml.js';
import regulatoryRoutes from './routes/regulatory.js';
import quickbooksRoutes from './routes/quickbooks.js';
import statusRoutes from './routes/status.js';
import { asyncHandler, ApiError } from './middleware/errorHandler.js';
import { EmailService } from './services/emailService.js';

// Import middleware
import { extractTenant } from './middleware/tenant.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import logger, { requestLogger } from './utils/logger.js';
import { checkDatabaseHealth } from './config/database.js';
import { cache } from './utils/cache.js';
import healthRouter from './routes/health.js';
import setupRouter from './routes/setup.js';
import adminRouter from './routes/admin.js';
import { initEngageSuperadmin } from './lib/superadmin.js';
import { syncEngageToSuperadmin, isSuperadminSyncConfigured } from './services/superadminSyncService.js';

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

// Security middleware - CSP configured for production
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://sandbox-checkout.revolut.com',
          'https://checkout.revolut.com',
        ],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: [
          "'self'",
          process.env.FRONTEND_URL || 'http://localhost:5173',
          'https://sandbox-merchant.revolut.com',
          'https://merchant.revolut.com',
          'https://sandbox-checkout.revolut.com',
          'https://checkout.revolut.com',
        ],
        frameSrc: [
          "'self'",
          'https://sandbox-checkout.revolut.com',
          'https://checkout.revolut.com',
        ],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    // HSTS - HTTP Strict Transport Security
    hsts: {
      maxAge: 31536000, // 1 year in seconds
      includeSubDomains: true,
      preload: true,
    },
    // Additional security headers
    hidePoweredBy: true,
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true,
  })
);

// CORS configuration - allow multiple origins
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://capstonesoftware.co.uk',
  'https://www.capstonesoftware.co.uk',
  'https://engage.capstonesoftware.co.uk',
  'https://engage-frontend-0g6u.onrender.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://192.168.1.86:5173',
  'http://100.83.223.249:5173',
  'https://frontend-fawn-eta-13.vercel.app',
  'https://frontend-7bwwe5u7u-will-masseys-projects-b935486d.vercel.app',
  'https://frontend-o4blqd5z2-will-masseys-projects-b935486d.vercel.app',
  'https://frontend-go1ntbkne-will-masseys-projects-b935486d.vercel.app',
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

const corsOptions = {
  origin: function (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id', 'X-Request-Id', 'X-CSRF-Token', 'X-Test-Mode'],
};

app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Login: only count failed attempts (successful logins do not consume quota)
const loginLimiter = rateLimit({
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

const privilegedLimiter = rateLimit({
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

app.use('/api/admin', privilegedLimiter);
app.use('/api/seed-services-public', privilegedLimiter);
app.use('/api/setup', privilegedLimiter);

const tenantSignupLimiter = rateLimit({
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

app.use('/api/tenants', (req, res, next) => {
  if (req.method === 'POST' && req.path === '/') {
    return tenantSignupLimiter(req, res, next);
  }
  next();
});

// Stricter rate limiting for public proposal endpoints (viewing/signing)
const publicProposalLimiter = rateLimit({
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

app.use('/api/proposals/view', publicProposalLimiter);

// Logging
app.use(
  morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim()),
    },
  })
);

// Cookie parsing (required for CSRF and auth cookies)
app.use(cookieParser());

// Stripe webhook must receive raw body — mount before express.json()
app.use('/api/payments/webhook', stripeWebhookRoutes);

// Revolut billing webhook — raw body for HMAC verification (handler mounted with /api/billing below)
app.use(
  '/api/billing/webhook',
  express.json({
    limit: '64kb',
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);

// Body parsing — SendGrid webhook needs raw body for signature verification
import sendgridWebhookRoutes from './routes/webhooks/sendgrid.js';
import emailEventsWebhookRoutes from './routes/webhooks/email-events.js';

app.use(
  '/api/webhooks/sendgrid',
  express.raw({ type: 'application/json' }),
  (req, _res, next) => {
    const buf = req.body as Buffer;
    (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    try {
      req.body = JSON.parse(buf.toString('utf8'));
    } catch {
      req.body = [];
    }
    next();
  },
  sendgridWebhookRoutes
);

app.use('/api/webhooks/email-events', emailEventsWebhookRoutes);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

import cloudflareEmailWebhookRoutes from './routes/webhooks/cloudflare-email.js';
app.use('/api/webhooks/cloudflare-email', cloudflareEmailWebhookRoutes);

// Mount auth routes BEFORE CSRF protection
app.use('/api/auth', extractTenant, authRoutes);

// Setup endpoint - no auth required, one-time database initialization
app.use('/api/setup', setupRouter);

// Admin routes - protected by secret key, no auth required
app.use('/api/admin', adminRouter);

// Public one-click seed endpoint (no auth/CSRF required — protected by env secret key)
import { prisma } from './config/database.js';
app.get('/api/seed-services-public', async (req, res) => {
  const enabled =
    process.env.NODE_ENV !== 'production' || process.env.ENABLE_PUBLIC_SEED === 'true';

  if (!enabled) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
    return;
  }

  const expected = process.env.PUBLIC_SEED_KEY;
  if (!expected) {
    res.status(503).json({
      success: false,
      error: { code: 'NOT_CONFIGURED', message: 'Missing PUBLIC_SEED_KEY' },
    });
    return;
  }

  const secret = req.headers['x-public-seed-key'];
  if (req.query.key) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_AUTH',
        message: 'Pass PUBLIC_SEED_KEY via X-Public-Seed-Key header only',
      },
    });
    return;
  }
  if (secret !== expected) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Invalid key' } });
    return;
  }

  try {
    let tenant = await prisma.tenant.findFirst({ where: { subdomain: 'demo-practice' } });
    if (!tenant) tenant = await prisma.tenant.findFirst({ where: { subdomain: 'demo' } });
    if (!tenant) {
      res
        .status(404)
        .json({ success: false, error: { code: 'NO_TENANT', message: 'No demo tenant found' } });
      return;
    }

    // Check if services already exist - fix billingCycle/priceAmount if needed
    const existingCount = await prisma.serviceTemplate.count({ where: { tenantId: tenant.id } });
    if (existingCount > 0) {
      const servicesToFix = await prisma.serviceTemplate.findMany({ where: { tenantId: tenant.id } });
      let fixed = 0;
      for (const s of servicesToFix) {
        const correctBillingCycle = s.defaultFrequency === 'ONE_TIME' ? 'MONTHLY' : (s.defaultFrequency || 'MONTHLY');
        const correctPrice = s.basePrice || s.priceAmount || 0;
        if (s.billingCycle !== correctBillingCycle || s.priceAmount !== correctPrice) {
          await prisma.serviceTemplate.update({
            where: { id: s.id },
            data: { billingCycle: correctBillingCycle, priceAmount: correctPrice },
          });
          fixed++;
        }
      }
      res.json({
        success: true,
        data: {
          message: fixed > 0 ? `Fixed ${fixed} services.` : `Tenant already has ${existingCount} services. No changes made.`,
          servicesCount: existingCount,
          fixed,
        },
      });
      return;
    }

    // Only clean up service templates, NOT proposals
    await prisma.pricingRule.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.serviceTemplate.deleteMany({ where: { tenantId: tenant.id } });

    const servicesData = [
      {
        category: 'COMPLIANCE',
        name: 'Annual Accounts Preparation & Filing',
        description:
          'Preparation of statutory annual accounts in accordance with UK GAAP or FRS 102, including all disclosures, notes, and electronic filing with Companies House.',
        longDescription:
          "We prepare your company's statutory annual accounts from your bookkeeping records, ensuring full compliance with UK GAAP, FRS 102, or FRS 105 as applicable. Our service includes: trial balance review, statutory format accounts (Statement of Financial Position, Statement of Comprehensive Income, Directors' Report, Notes to the Accounts), iXBRL tagging where required, and electronic submission to Companies House before the statutory deadline. We also advise on late filing penalties, audit exemptions, and dormant company considerations.",
        basePrice: 71,
        baseHours: 6,
        pricingModel: 'FIXED',
        frequencyOptions: 'MONTHLY',
        defaultFrequency: 'MONTHLY',
        applicableEntityTypes: 'LIMITED_COMPANY,LLP',
        tags: 'annual-accounts,companies-house,uk-gaap,frs-102,compliance',
        isPopular: true,
        regulatoryNotes:
          'Filing deadline: 9 months after accounting reference date (private companies). Late filing penalties from £150 to £1,500.',
      },
      {
        category: 'COMPLIANCE',
        name: 'Corporation Tax Return (CT600)',
        description:
          'Preparation and electronic submission of your Corporation Tax Return (CT600) to HMRC, including tax computations and iXBRL tagging.',
        longDescription:
          "We calculate your company's corporation tax liability and prepare the CT600 return for electronic submission to HMRC. This includes: review of profits chargeable to corporation tax, capital allowances computations (AIA, FYA, WDA), loss relief claims, group relief considerations, R&D tax relief screening, and iXBRL tagging of computations and accounts. We ensure payment deadlines are met (9 months and 1 day after the end of the accounting period) and advise on quarterly instalment payments (QIPs) for large companies.",
        basePrice: 54,
        baseHours: 4,
        pricingModel: 'FIXED',
        frequencyOptions: 'MONTHLY',
        defaultFrequency: 'MONTHLY',
        applicableEntityTypes: 'LIMITED_COMPANY',
        tags: 'corporation-tax,ct600,hmrc,tax-computation',
        isPopular: true,
        regulatoryNotes:
          'Filing deadline: 12 months after the end of the accounting period. Penalties for late filing and interest on late payment apply.',
      },
      {
        category: 'COMPLIANCE',
        name: 'Prior Year Annual Accounts & CT600',
        description:
          'Catch-up filing for overdue annual accounts and corporation tax returns from previous accounting periods.',
        longDescription:
          'If you have missed prior year filing deadlines, we can prepare and submit your overdue annual accounts and CT600 returns to bring your company back into good standing with Companies House and HMRC. This service includes: reconstruction of prior year records, preparation of statutory accounts and tax computations, negotiation with HMRC regarding penalties and interest, and advice on Time to Pay arrangements if corporation tax is outstanding. We will also advise on steps to prevent future late filing and can set up a compliance calendar for your business.',
        basePrice: 1200,
        baseHours: 8,
        pricingModel: 'FIXED',
        frequencyOptions: 'ANNUALLY',
        defaultFrequency: 'ANNUALLY',
        applicableEntityTypes: 'LIMITED_COMPANY,LLP',
        tags: 'catch-up,overdue,late-filing,penalty-negotiation',
        regulatoryNotes:
          'Late filing penalties accumulate. Companies House may strike off a company for persistent non-compliance.',
      },
      {
        category: 'COMPLIANCE',
        name: 'Confirmation Statement (CS01)',
        description:
          'Annual Confirmation Statement filing with Companies House.',
        longDescription:
          "We prepare and file your annual Confirmation Statement (previously the Annual Return), confirming that your company's registered details are accurate and up to date. This includes verification of: registered office address, directors and secretary details, shareholders and share capital, SIC codes, and Persons with Significant Control (PSC) register. If changes are required, we will advise on the necessary filings (e.g., CH01 for director changes, SH01 for allotment of shares) and ensure the Confirmation Statement is submitted within the 14-day filing window.",
        basePrice: 8,
        baseHours: 0.5,
        pricingModel: 'FIXED',
        frequencyOptions: 'MONTHLY',
        defaultFrequency: 'MONTHLY',
        applicableEntityTypes: 'LIMITED_COMPANY,LLP',
        tags: 'confirmation-statement,cs01,companies-house',
        regulatoryNotes:
          'Must be filed at least once every 12 months. Late filing is a criminal offence and may lead to prosecution or company strike-off.',
      },
      {
        category: 'COMPLIANCE',
        name: 'Dormant Company Accounts',
        description: 'Annual dormant company accounts filing.',
        longDescription:
          'If your company has not traded and has no significant accounting transactions during the financial year, we can prepare and file dormant company accounts (DCA) with Companies House on your behalf. This service includes: preparation of the simplified DCA form, confirmation of dormant status under the Companies Act 2006, and electronic filing. We also advise on when a company ceases to be dormant, the requirement to file full accounts, and whether the company should remain active or be voluntarily struck off.',
        basePrice: 15,
        baseHours: 0.5,
        pricingModel: 'FIXED',
        frequencyOptions: 'ANNUALLY',
        defaultFrequency: 'ANNUALLY',
        applicableEntityTypes: 'LIMITED_COMPANY',
        tags: 'dormant-accounts,dca,non-trading',
        regulatoryNotes:
          'A company is dormant if it has had no significant accounting transactions. Dormant companies must still file annual accounts and confirmation statements.',
      },
      {
        category: 'COMPLIANCE',
        name: 'Limited Company Formation',
        description:
          'Incorporation of a new private limited company in England, Wales, Scotland, or Northern Ireland.',
        longDescription:
          'We handle the full company formation process from start to finish, ensuring your new business is incorporated correctly and compliantly. Our service includes: name availability check and reservation, preparation of the Memorandum and Articles of Association, completion of the IN01 form, appointment of directors and shareholders, issue of share certificates, registration for Corporation Tax with HMRC, and guidance on opening a business bank account. We also provide advice on share structure, director responsibilities, and whether your company should be limited by shares or by guarantee.',
        basePrice: 125,
        baseHours: 1,
        pricingModel: 'FIXED',
        frequencyOptions: 'ANNUALLY',
        defaultFrequency: 'ANNUALLY',
        applicableEntityTypes: 'LIMITED_COMPANY',
        tags: 'formation,incorporation,in01,companies-house',
        isPopular: true,
        regulatoryNotes:
          'Companies House standard incorporation fee included. Same-day incorporation available for an additional fee.',
      },
      {
        category: 'COMPLIANCE',
        name: 'Anti-Money Laundering (AML) Check',
        description:
          'Client due diligence and AML compliance checks including ID verification, source of funds checks, and risk assessment.',
        longDescription:
          'We conduct comprehensive Anti-Money Laundering (AML) checks to satisfy your regulatory obligations under the Money Laundering, Terrorist Financing and Transfer of Funds (Information on the Payer) Regulations 2017 (as amended). This includes: identity verification using government-issued documents, proof of address verification, Politically Exposed Persons (PEP) and sanctions screening, source of funds/source of wealth checks where required, and risk profiling (low, medium, high). We provide you with a documented risk assessment and ongoing monitoring recommendations to ensure your firm remains compliant with the requirements of your supervisory body (e.g., ICAEW, ACCA, AAT, HMRC).',
        basePrice: 6,
        baseHours: 0.5,
        pricingModel: 'FIXED',
        frequencyOptions: 'MONTHLY',
        defaultFrequency: 'MONTHLY',
        applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP,LLP',
        tags: 'aml,compliance,dued diligence,kyc,pep-check',
        regulatoryNotes:
          'Required under MLRs 2017. Must be completed before engagement and refreshed periodically based on risk rating.',
      },
      {
        category: 'TAX',
        name: 'Self Assessment Tax Return',
        description:
          'Annual preparation and submission of personal Self Assessment tax returns.',
        longDescription:
          'We prepare your Self Assessment tax return accurately and on time, ensuring you claim all allowable reliefs and expenses while remaining fully compliant with HMRC. Our service covers: employment income (P60, P11D, P45), self-employment income and expenses, property rental income and capital gains, dividends and investment income, pension contributions and tax relief, student loan repayments, and child benefit charge calculations. We file your return online before the 31 January deadline, calculate your tax liability, and advise on payment on account requirements and any tax planning opportunities.',
        basePrice: 25,
        baseHours: 2.5,
        pricingModel: 'FIXED',
        frequencyOptions: 'ANNUALLY',
        defaultFrequency: 'ANNUALLY',
        applicableEntityTypes: 'SOLE_TRADER,PARTNERSHIP,LIMITED_COMPANY',
        tags: 'self-assessment,sat,personal-tax,hmrc',
        isPopular: true,
        regulatoryNotes:
          'Filing deadline: 31 January following the end of the tax year. Late filing penalties: £100 initial penalty, escalating thereafter.',
      },
      {
        category: 'TAX',
        name: 'VAT Return Preparation & Filing',
        description:
          'Monthly VAT return preparation, Making Tax Digital (MTD) submission, and ongoing VAT advisory.',
        longDescription:
          'We handle your VAT compliance from bookkeeping review to MTD-compatible submission. Our service includes: review of sales and purchase invoices for VAT accuracy, reconciliation of VAT control accounts, preparation of the VAT return (Box 1–9), submission via HMRC MTD-compatible software, and advice on VAT schemes (Standard, Flat Rate, Cash Accounting, Annual Accounting, Margin Scheme). We also advise on partial exemption calculations, EU/NI trade post-Brexit, reverse charge mechanisms for construction services (CIS), and domestic reverse charge for VAT.',
        basePrice: 45,
        baseHours: 2,
        pricingModel: 'FIXED',
        frequencyOptions: 'MONTHLY',
        defaultFrequency: 'MONTHLY',
        applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP,LLP',
        tags: 'vat,mtd,hmrc,vat-return,flat-rate',
        isPopular: true,
        regulatoryNotes:
          'MTD for VAT mandatory for VAT-registered businesses. Filing deadline: 1 month and 7 days after the end of the VAT period.',
      },
      {
        category: 'TAX',
        name: 'MTD ITSA 2026/27 Transition & Quarterly Filing',
        description:
          'Full Making Tax Digital for Income Tax Self Assessment (MTD ITSA) support for businesses mandated from April 2026.',
        longDescription:
          'From April 2026, self-employed individuals and landlords with gross income over £50,000 must comply with MTD ITSA. We provide end-to-end transition support and ongoing quarterly filing. Our service includes: MTD-compatible cloud software setup and training, quarterly income and expense summaries, quarterly submission to HMRC, End of Period Statement (EOPS) preparation, and Final Declaration submission. We ensure your records are kept digitally, your quarterly obligations are met, and your tax position is reviewed proactively throughout the year.',
        basePrice: 120,
        baseHours: 1,
        pricingModel: 'FIXED',
        frequencyOptions: 'QUARTERLY',
        defaultFrequency: 'QUARTERLY',
        applicableEntityTypes: 'SOLE_TRADER,PARTNERSHIP',
        tags: 'mtd-itsa,quarterly,hmrc,2026-27,digital-tax',
        isPopular: true,
        regulatoryNotes:
          'Mandatory from April 2026 for sole traders and landlords with gross income over £50,000. Quarterly updates, EOPS, and Final Declaration required.',
      },
      {
        category: 'TAX',
        name: 'MTD ITSA 2027/28 Transition & Quarterly Filing',
        description:
          'MTD ITSA compliance support for businesses with income over £30,000 mandated from April 2027.',
        longDescription:
          'From April 2027, the MTD ITSA threshold drops to £30,000, bringing thousands more self-employed individuals and landlords into scope. We help you prepare early so the transition is seamless. Our service includes: pre-mandate readiness review, MTD-compatible software migration and setup, quarterly income and expense tracking, quarterly HMRC submissions, End of Period Statement (EOPS), and Final Declaration. We also provide tailored advice on allowable expenses, capital allowances, and property income allowances to optimise your tax position under MTD ITSA.',
        basePrice: 120,
        baseHours: 1,
        pricingModel: 'FIXED',
        frequencyOptions: 'QUARTERLY',
        defaultFrequency: 'QUARTERLY',
        applicableEntityTypes: 'SOLE_TRADER,PARTNERSHIP',
        tags: 'mtd-itsa,quarterly,hmrc,2027-28,digital-tax',
        regulatoryNotes:
          'Mandatory from April 2027 for sole traders and landlords with gross income over £30,000.',
      },
      {
        category: 'TAX',
        name: 'P11D Benefits in Kind',
        description:
          'Annual P11D forms preparation and submission for directors and employees.',
        longDescription:
          'We prepare and submit P11D forms for each employee or director who has received taxable benefits or reimbursed expenses during the tax year. Our service covers: company cars and fuel benefit calculations, private medical insurance, interest-free and low-interest loans, accommodation benefits, asset transfers, and mileage payments above HMRC approved rates. We also prepare the P11D(b) return, calculate Class 1A National Insurance Contributions, and advise on payrolling of benefits as an alternative to P11D reporting.',
        basePrice: 5,
        baseHours: 0.5,
        pricingModel: 'FIXED',
        frequencyOptions: 'ANNUALLY',
        defaultFrequency: 'ANNUALLY',
        applicableEntityTypes: 'LIMITED_COMPANY',
        tags: 'p11d,benefits-in-kind,class-1a-nic,hmrc',
        regulatoryNotes:
          'Filing deadline: 6 July following the end of the tax year. Class 1A NIC payment deadline: 19 July (22 July if paying electronically).',
      },
      {
        category: 'PAYROLL',
        name: 'Payroll — Fixed Salary Employees',
        description:
          'Monthly payroll processing for employees on fixed salaries, including payslips, RTI submissions, and year-end P60s.',
        longDescription:
          'We run your monthly payroll for employees on fixed salaries, ensuring full HMRC Real Time Information (RTI) compliance. Our service includes: gross-to-net calculations, PAYE and National Insurance deductions, pension auto-enrolment assessments and deductions, student loan and postgraduate loan deductions, attachment of earnings orders, and generation of secure digital payslips. We submit Full Payment Submissions (FPS) on or before each payday and Employer Payment Summaries (EPS) where required. Year-end services include P60 production and P11D preparation if applicable.',
        basePrice: 22,
        baseHours: 0.3,
        pricingModel: 'FIXED',
        frequencyOptions: 'MONTHLY',
        defaultFrequency: 'MONTHLY',
        applicableEntityTypes: 'LIMITED_COMPANY,LLP,PARTNERSHIP',
        tags: 'payroll,rti,paye,payslip,p60,auto-enrolment',
        isPopular: true,
        regulatoryNotes:
          'FPS must be submitted on or before each payday. Late filing penalties apply.',
      },
      {
        category: 'PAYROLL',
        name: 'Payroll — Variable/Hourly Employees',
        description:
          'Monthly payroll processing for employees with variable hours, commissions, bonuses, or overtime.',
        longDescription:
          'We manage payroll complexity for employees with variable pay elements, ensuring accurate calculations and timely RTI submissions every pay run. This service includes: processing of hourly rates, overtime, commission, bonuses, and statutory payments (SSP, SMP, SAP, SPP, ShPP), PAYE and NIC calculations, pension auto-enrolment re-assessments, and secure digital payslip distribution. We also handle leaver processing (P45s), new starter declarations, and year-end reconciliations. Ideal for retail, hospitality, construction, and seasonal businesses.',
        basePrice: 28,
        baseHours: 0.4,
        pricingModel: 'FIXED',
        frequencyOptions: 'MONTHLY,WEEKLY',
        defaultFrequency: 'MONTHLY',
        applicableEntityTypes: 'LIMITED_COMPANY,LLP,PARTNERSHIP',
        tags: 'payroll,variable-pay,overtime,commission,rti',
        regulatoryNotes:
          'Variable pay must be reported accurately via FPS. Statutory payment calculations must follow HMRC rates and rules.',
      },
      {
        category: 'PAYROLL',
        name: 'Auto Enrolment & Pension Submissions',
        description:
          'Workplace pension auto-enrolment administration, including assessments, enrolment letters, and monthly pension submissions.',
        longDescription:
          'We manage your workplace pension auto-enrolment duties under the Pensions Act 2008, ensuring you remain compliant with The Pensions Regulator (TPR). Our service includes: monthly eligibility assessments for all workers, enrolment of eligible jobholders, production of statutory communications (joiner letters, opt-out notices), calculation and deduction of employee and employer contributions, and monthly data submission to your pension provider. We also handle re-enrolment every three years, opt-out and opt-in processing, and compliance with minimum contribution rates (currently 8% total, with at least 3% employer).',
        basePrice: 12,
        baseHours: 0.2,
        pricingModel: 'FIXED',
        frequencyOptions: 'MONTHLY',
        defaultFrequency: 'MONTHLY',
        applicableEntityTypes: 'LIMITED_COMPANY,LLP,PARTNERSHIP',
        tags: 'auto-enrolment,pension,tpr,workplace-pension,nest',
        regulatoryNotes:
          'Employers must assess workers each pay period. Minimum total contribution: 8% (employer minimum 3%). Re-enrolment required every 3 years.',
      },
      {
        category: 'BOOKKEEPING',
        name: 'Comprehensive Bookkeeping',
        description:
          'Complete monthly bookkeeping service including bank reconciliation, supplier and customer ledger management, and management reports.',
        longDescription:
          'Our comprehensive bookkeeping service ensures your financial records are accurate, up to date, and ready for year-end accounts and VAT returns. We handle: posting of sales and purchase invoices, bank and credit card reconciliations, supplier and customer ledger management, VAT coding and control account reconciliations, accruals and prepayments, fixed asset register maintenance, and monthly management reports (P&L, Balance Sheet, Aged Debtors/Creditors). We work with leading cloud accounting software including Xero, QuickBooks, Sage, and FreeAgent, and can provide you with real-time dashboards and cash flow visibility.',
        basePrice: 85,
        baseHours: 4,
        pricingModel: 'FIXED',
        frequencyOptions: 'MONTHLY',
        defaultFrequency: 'MONTHLY',
        applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP,LLP',
        tags: 'bookkeeping,bank-reconciliation,ledgers,management-reports',
        isPopular: true,
        regulatoryNotes:
          'Businesses must keep adequate accounting records for 6 years (HMRC requirement).',
      },
      {
        category: 'TECHNICAL',
        name: 'Xero Setup & Integration',
        description:
          'Full Xero cloud accounting software implementation, including bank feed setup, chart of accounts tailoring, and user training.',
        longDescription:
          'We implement Xero from scratch or migrate your existing data, ensuring your cloud accounting is configured correctly for your business. Our service includes: company and user setup, bespoke chart of accounts configuration, bank feed connections and reconciliations, VAT scheme and MTD setup, invoice and quote branding, payroll and pension integration, apps and add-on integration (e.g., Dext, Stripe, GoCardless), and one-to-one staff training. We ensure your Xero file is compliant with UK VAT and MTD requirements and provide ongoing support as your business grows.',
        basePrice: 650,
        baseHours: 5,
        pricingModel: 'FIXED',
        frequencyOptions: 'ONE_TIME',
        defaultFrequency: 'ONE_TIME',
        applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP,LLP',
        tags: 'xero,cloud-accounting,software-setup,training,mtd',
        isPopular: true,
        regulatoryNotes: 'Xero subscription fees are separate and billed directly by Xero.',
      },
      {
        category: 'TECHNICAL',
        name: 'Xero Subscription Management',
        description:
          'Ongoing Xero subscription administration, user management, and monthly health checks.',
        longDescription:
          'We act as your Xero administrator, ensuring your subscription remains optimised and your data stays clean and compliant. Our service includes: monthly Xero health checks (reconciliation reviews, duplicate transaction checks, VAT coding accuracy), user access management and permissions, chart of accounts adjustments, bank feed troubleshooting, software updates and feature rollouts, and quarterly review calls to maximise your use of Xero. We also liaise with Xero support on your behalf for technical issues and can recommend add-on apps to streamline your workflows.',
        basePrice: 75,
        baseHours: 0.5,
        pricingModel: 'FIXED',
        frequencyOptions: 'MONTHLY',
        defaultFrequency: 'MONTHLY',
        applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP,LLP',
        tags: 'xero,subscription,admin,support,health-check',
        regulatoryNotes:
          'Xero subscription fees billed separately by Xero. This service covers administration and compliance support only.',
      },
      {
        category: 'TECHNICAL',
        name: 'Dext Subscription & Setup',
        description:
          'Dext (formerly Receipt Bank) implementation for automated receipt and invoice capture, including supplier rules and publishing workflows.',
        longDescription:
          'We set up Dext to automate your receipt and invoice processing, reducing manual data entry and improving record-keeping accuracy. Our service includes: Dext account configuration, supplier rule creation, integration with your accounting software (Xero, QuickBooks, Sage), mobile app training for directors and staff, multi-user setup, and automated publishing workflows. We configure Dext to handle VAT splits, foreign currency invoices, and mileage claims, ensuring your bookkeeping is as efficient and paperless as possible.',
        basePrice: 350,
        baseHours: 2,
        pricingModel: 'FIXED',
        frequencyOptions: 'ONE_TIME',
        defaultFrequency: 'ONE_TIME',
        applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP,LLP',
        tags: 'dext,receipt-bank,automation,expenses,integration',
        regulatoryNotes: 'Dext subscription fees are separate and billed directly by Dext.',
      },
      {
        category: 'SPECIALIZED',
        name: 'Registered Office Address Service',
        description:
          'Monthly service for professional registered office address with Companies House and HMRC correspondence handling.',
        longDescription:
          'Use our prestigious UK registered office address for your company, ensuring your personal address remains private and your statutory mail is handled professionally. Our service includes: registered office address for Companies House and HMRC, same-day scanning and email forwarding of statutory mail, secure storage of original documents, reminder service for filing deadlines, and assistance with official correspondence from Companies House and HMRC. This is an ideal solution for home-based business owners, non-UK directors, and anyone who values privacy and professionalism.',
        basePrice: 15,
        baseHours: 0.1,
        pricingModel: 'FIXED',
        frequencyOptions: 'MONTHLY',
        defaultFrequency: 'MONTHLY',
        applicableEntityTypes: 'LIMITED_COMPANY,LLP',
        tags: 'registered-office,address,companies-house,mail-forwarding',
        isPopular: true,
        regulatoryNotes:
          'A UK company must maintain a registered office address in the same jurisdiction where it is incorporated (England & Wales, Scotland, or Northern Ireland).',
      },
    ];

    // Ensure PostgreSQL enums have all required values for the UK catalog
    await prisma.$executeRawUnsafe(`DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'ServiceCategory' AND e.enumlabel = 'TECHNICAL') THEN
        ALTER TYPE "ServiceCategory" ADD VALUE 'TECHNICAL';
      END IF;
    END $$;`);
    await prisma.$executeRawUnsafe(`DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'ServiceCategory' AND e.enumlabel = 'SPECIALIZED') THEN
        ALTER TYPE "ServiceCategory" ADD VALUE 'SPECIALIZED';
      END IF;
    END $$;`);
    await prisma.$executeRawUnsafe(`DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'PricingModel' AND e.enumlabel = 'PER_EMPLOYEE') THEN
        ALTER TYPE "PricingModel" ADD VALUE 'PER_EMPLOYEE';
      END IF;
    END $$;`);

    const data = servicesData.map((s: any) => ({
      tenantId: tenant.id,
      category: s.category,
      name: s.name,
      description: s.description,
      longDescription: s.longDescription,
      basePrice: s.basePrice,
      priceAmount: s.basePrice,
      baseHours: s.baseHours,
      pricingModel: s.pricingModel,
      frequencyOptions: s.frequencyOptions,
      defaultFrequency: s.defaultFrequency,
      billingCycle: s.defaultFrequency === 'ONE_TIME' ? 'MONTHLY' : s.defaultFrequency,
      applicableEntityTypes: s.applicableEntityTypes,
      tags: s.tags,
      isActive: true,
      isPopular: s.isPopular || false,
      regulatoryNotes: s.regulatoryNotes || null,
      complexityFactors: JSON.stringify([]),
      requirements: JSON.stringify([]),
      deliverables: JSON.stringify([]),
    }));

    const result = await prisma.serviceTemplate.createMany({ data });

    res.json({
      success: true,
      data: { created: result.count, totalExpected: servicesData.length },
      message: `Seeded ${result.count} UK accountancy services`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'SEED_ERROR', message: error.message } });
  }
});

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

// Rate limiting - skip health + CSRF (has its own limiter) when disabled via env
const limiter = rateLimit({
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

app.use('/api/', limiter);

// OAuth callback — server-side code exchange (no auth code in frontend URL)
app.get('/api/oauth/callback/outlook', (req, res) => {
  void handleOAuthProviderCallback(req, res, 'outlook');
});
app.get('/api/oauth/callback/microsoft365', (req, res) => {
  void handleOAuthProviderCallback(req, res, 'microsoft365');
});
app.get('/api/oauth/callback/gmail', (req, res) => {
  void handleOAuthProviderCallback(req, res, 'gmail');
});
app.get('/api/oauth/callback/xero', (req, res) => {
  void handleXeroOAuthCallback(req, res);
});
app.get('/api/oauth/callback/quickbooks', (req, res) => {
  void handleQuickBooksOAuthCallback(req, res);
});
app.get('/api/quickbooks/callback', (req, res) => {
  void handleQuickBooksOAuthCallback(req, res);
});

// API routes (auth already mounted above)
// Share/portal/public routes first (before authenticated /:id handlers)
app.use('/api/proposals', proposalShareRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/proposals', extractTenant, proposalRoutes);
app.use('/api/clients', extractTenant, clientRoutes);
app.use('/api/services', extractTenant, serviceRoutes);
app.use('/api/services/v2', extractTenant, enhancedServiceRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/email', extractTenant, emailRoutes);
app.use('/api/payments', extractTenant, paymentRoutes);
app.use('/api/billing', extractTenant, billingRoutes);
app.use('/api/payout', extractTenant, payoutRoutes);
app.use('/api/companies-house', extractTenant, companiesHouseRoutes);
app.use('/api/cover-letter-templates', extractTenant, coverLetterTemplateRoutes);
app.use('/api/proposal-templates', extractTenant, proposalTemplateRoutes);
app.use('/api/engagement-library', extractTenant, engagementLibraryRoutes);
app.use('/api/analytics', extractTenant, analyticsRoutes);
app.use('/api/touchpoints', extractTenant, touchpointRoutes);
app.use('/api/automation', extractTenant, automationRoutes);
app.use('/api/uploads', extractTenant, uploadsRoutes);
app.use('/api/ai', extractTenant, aiRoutes);
app.use('/api/integrations', extractTenant, integrationsRoutes);

// W4.5 — Public status page API (no auth)
app.use('/api/status', statusRoutes);

// Uploads are served via authenticated /api/uploads routes only (no public static dir)

// Health check routes (must be BEFORE static files and SPA handler)
app.use('/ping', async (_req, res) => {
  const dbHealth = await checkDatabaseHealth();
  if (dbHealth.healthy) {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  } else {
    res.status(503).json({
      status: 'error',
      message: 'Database unavailable',
      timestamp: new Date().toISOString(),
    });
  }
});
app.use('/health', healthRouter);

// Serve static frontend files
const publicPath = path.join(process.cwd(), 'public');
app.use(express.static(publicPath));

// Serve index.html for all non-API routes (SPA support)
app.get('*', (req, res, next) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
    return next();
  }
  res.sendFile(path.join(publicPath, 'index.html'), (err) => {
    if (err) {
      // If index.html doesn't exist, return a message
      res.status(404).json({
        success: false,
        error: {
          code: 'FRONTEND_NOT_BUILT',
          message:
            'Frontend build not found. The application backend is running but the frontend has not been deployed.',
          publicPath: publicPath,
        },
      });
    }
  });
});

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

// Schedule renewal reminder job (daily at 9 AM)
import { runRenewalReminders } from './jobs/renewalReminders.js';
import { runProposalChaseJob } from './jobs/proposalChaseJob.js';

// Client touchpoint / lifecycle automation engine
import { runTouchpointEngine } from './jobs/touchpointEngine.js';
import { runEmailAutomation } from './jobs/emailAutomation.js';

// Run immediately on startup in production, or every 24 hours
const RENEWAL_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

function scheduleRenewalReminders() {
  logger.info('📅 Scheduling renewal reminder job...');

  // Run once at startup (with delay to let server fully start)
  setTimeout(() => {
    runRenewalReminders().catch((err) => {
      logger.error('Initial renewal reminder check failed:', err);
    });
  }, 60000); // 1 minute delay

  // Then run every 24 hours
  setInterval(() => {
    runRenewalReminders().catch((err) => {
      logger.error('Scheduled renewal reminder check failed:', err);
    });
  }, RENEWAL_CHECK_INTERVAL);

  logger.info('✅ Renewal reminder job scheduled (every 24 hours)');
}

function scheduleProposalChaseJob() {
  logger.info('📅 Scheduling proposal chase job...');

  setTimeout(() => {
    runProposalChaseJob().catch((err) => {
      logger.error('Initial proposal chase check failed:', err);
    });
  }, 120_000);

  setInterval(() => {
    runProposalChaseJob().catch((err) => {
      logger.error('Scheduled proposal chase check failed:', err);
    });
  }, RENEWAL_CHECK_INTERVAL);

  logger.info('✅ Proposal chase job scheduled (every 24 hours)');
}

function scheduleTouchpointEngine() {
  logger.info('📅 Scheduling client touchpoint engine...');

  const INTERVAL = 15 * 60 * 1000; // every 15 minutes

  // Run once after startup
  setTimeout(() => {
    runTouchpointEngine().catch((err) => logger.error('Initial touchpoint engine run failed:', err));
  }, 90_000);

  setInterval(() => {
    runTouchpointEngine().catch((err) => logger.error('Scheduled touchpoint engine run failed:', err));
  }, INTERVAL);

  logger.info('✅ Touchpoint engine scheduled (every 15 minutes)');
}

function scheduleEmailAutomation() {
  logger.info('📅 Scheduling proposal email automation (unopened 3d, unsigned 7d, expiring 30d)...');

  const INTERVAL = 24 * 60 * 60 * 1000; // daily

  setTimeout(() => {
    runEmailAutomation().catch((err) => logger.error('Initial email automation run failed:', err));
  }, 120_000);

  setInterval(() => {
    runEmailAutomation().catch((err) => logger.error('Scheduled email automation failed:', err));
  }, INTERVAL);

  logger.info('✅ Email automation scheduled (every 24 hours)');
}

// Start server (skipped in Jest so supertest can import the app)
const shouldStartServer =
  process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID;

if (shouldStartServer) {
  app.listen(PORT, () => {
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

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await cache.disconnect();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully');
    await cache.disconnect();
    process.exit(0);
  });
}

export default app;
// Deploy trigger: Fri Apr 10 15:47:18 BST 2026
