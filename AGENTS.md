# Engage by Capstone — Agent Guide

> **Purpose:** This document exists for AI coding agents. It summarises the project architecture, conventions, and workflows so you can be productive immediately.  
> **Last updated:** 2026-04-15

---

## 1. Project Overview

**Engage by Capstone** is a world-class professional proposal-generation platform built for UK accountancy practices. It enables firms to create, share, and electronically sign compliant engagement letters and proposals in under five minutes.

### Key Capabilities

- **World-Class UX** — Command palette (Cmd+K), keyboard shortcuts, glassmorphism UI, dark/light themes
- **Multi-tenant architecture** — One database with row-level tenant isolation via `tenantId`
- **Role-based access control** — `ADMIN`, `PARTNER`, `MANAGER`, `SENIOR`, `JUNIOR`
- **UK-specific compliance** — MTD ITSA assessment, Companies House lookup, VAT handling
- **Smart Pricing** — Frequency-aware pricing (Monthly/Quarterly/Annual) with line-level VAT
- **PDF generation** — Print-ready professional proposals
- **Electronic signatures** — UK-compliant signature capture and storage
- **Proposal activity tracking** — View tracking with duration and IP logging
- **Stripe subscription billing** — Webhook handling for payments
- **Public proposal sharing** — Secure tokens with view tracking
- **Renewal reminders** — Automated daily job for proposal renewals
- **CSRF Protection** — Auto-retry mechanism for seamless UX

---

## 2. Technology Stack

| Layer                | Technology                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Monorepo**         | npm workspaces (`package.json` `workspaces`). Optional: `pnpm-workspace.yaml` / `turbo.json` for tooling compatibility only      |
| **Backend**          | Node.js 20+, Express.js 4, TypeScript 5.9+, Prisma 5.22, PostgreSQL 15                                                          |
| **Frontend**         | React 18, TypeScript 5.2, Vite 5, Tailwind CSS 3.4, Zustand 4.4                                                                 |
| **Shared**           | TypeScript package (`@uk-proposal-platform/shared`) exposing enums, interfaces, validation, pricing engine, MTD ITSA calculator |
| **Testing**          | Playwright 1.51 (E2E, active). Jest 29 (backend, has tests). Vitest 1.1 (frontend, installed but no tests)         |
| **Caching**          | Redis 7 (via `ioredis`) — optional but configured                                                                               |
| **Package Manager**  | **npm** (`package-lock.json`) — use `npm ci` in CI and on servers for reproducible installs                                     |
| **CI/CD**            | GitHub Actions (`ci-cd.yml`, `e2e-scheduled.yml`, `security.yml`, deploy workflows)                                             |
| **Containerization** | Docker + Docker Compose                                                                                                         |
| **Deployment**       | Render (primary, free tier). Railway (backend) + Vercel (frontend) as secondary/staging-production path                         |

---

## 3. Repository Layout

```
engage/
├── backend/                  # Express API
│   ├── src/
│   │   ├── config/           # database, env, logger, redis, stripe
│   │   ├── data/             # seed data (ukAccountancyServices.ts, defaultCoverLetters.ts)
│   │   ├── errors/           # custom error classes (ApiError, etc.)
│   │   ├── jobs/             # background jobs (renewalReminders.ts, emailAutomation.ts)
│   │   ├── middleware/       # auth, errorHandler, healthCheck, tenant extraction
│   │   ├── routes/           # Express route modules (auth, proposals, clients, payments, etc.)
│   │   ├── scripts/          # one-off scripts (seedServices.ts, startup.ts, autoMigrateOnStartup.ts)
│   │   ├── services/         # business logic (pdfGenerator, emailService, pricingEngine, MTD ITSA)
│   │   ├── templates/        # email and document templates
│   │   ├── utils/            # cache, encryption, logger helpers
│   │   └── index.ts          # Main Express entry point
│   ├── prisma/
│   │   ├── schema.prisma     # Full Prisma schema
│   │   ├── migrations/       # Prisma migration files
│   │   └── seed-enhanced.ts  # Database seeding
│   ├── dist/                 # Compiled JavaScript output
│   ├── start-prod.mjs        # Production startup orchestrator
│   └── Dockerfile / Dockerfile.backend.optimized
├── frontend/                 # React SPA
│   ├── src/
│   │   ├── components/       # React components
│   │   │   ├── billing/           # BillingCycleSelector, VATSelector
│   │   │   ├── command-palette/   # Cmd+K command palette
│   │   │   ├── email/             # EmailSettings, OAuthConnect
│   │   │   ├── keyboard/          # Keyboard shortcuts help
│   │   │   ├── layout/            # DashboardLayout, Header, Sidebar
│   │   │   ├── onboarding/        # OnboardingTour
│   │   │   ├── payments/          # StripePaymentForm
│   │   │   ├── proposals/         # ProposalBuilder, ShareProposalDialog
│   │   │   ├── services/          # ServiceCatalog
│   │   │   ├── signature/         # SignaturePad
│   │   │   ├── skeleton/          # Loading skeletons
│   │   │   ├── theme/             # Theme toggle
│   │   │   └── ui/                # UI primitives (Button, Card, Input)
│   │   ├── pages/            # Route-level pages (Dashboard, Proposals, Clients, Settings, etc.)
│   │   ├── stores/           # Zustand stores (auth, theme)
│   │   ├── hooks/            # Custom hooks (useCommandPalette)
│   │   ├── utils/            # helpers (api.ts)
│   │   ├── styles/           # CSS variables (base.css)
│   │   ├── index.css         # Tailwind directives + @layer components
│   │   ├── main.tsx          # React entry point
│   │   └── App.tsx           # Router and route guards
│   ├── public/               # Static assets
│   └── dist/                 # Vite build output
├── shared/                   # Cross-package types & utilities
│   ├── src/
│   │   └── index.ts          # Enums, interfaces, validation, pricing engine, MTD ITSA
│   └── dist/                 # Compiled CommonJS output with declarations
├── e2e-tests/                # Playwright E2E tests (only active test suite)
│   ├── specs/                # proposal-pricing.spec.ts, unit-calculations.spec.ts
│   ├── fixtures/             # Test helpers
│   └── playwright.config.ts
├── scripts/                  # Deployment and utility scripts
│   ├── deploy.sh             # Trigger Render deploys
│   ├── deploy.ps1            # Windows equivalent
│   ├── db-backup.sh
│   ├── db-restore.sh
│   ├── migrate.sh
│   └── debug-and-test.js     # Standalone debug/validation runner
├── .github/workflows/        # GitHub Actions CI/CD
├── docker-compose.yml        # Local development stack
├── render.yaml               # Render Blueprint (primary deployment)
├── railway.toml              # Railway deployment config
├── Dockerfile                # Root backend Dockerfile
├── Dockerfile.backend.optimized
├── Dockerfile.frontend.optimized
└── nginx.conf                # Nginx configuration for frontend SPA
```

---

## 4. Key Configuration Files

| File                           | Purpose                                                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `package.json` (root)          | Workspace scripts, shared devDeps. No `test` script at root.                                                                 |
| `pnpm-workspace.yaml`          | Workspace packages: `backend`, `frontend`, `shared`. `sharedWorkspaceLockfile: true`                                         |
| `turbo.json`                   | Turbo pipeline: `build`, `test`, `lint`, `typecheck`, `dev`, `clean`                                                         |
| `backend/package.json`         | Express deps, Prisma scripts, Jest script (no test files exist)                                                              |
| `backend/tsconfig.json`        | **Strict mode OFF** (`"strict": false`). Output to `dist/`. Path aliases: `@/*` → `src/*`, `@shared/*` → `../shared/src/*`   |
| `backend/prisma/schema.prisma` | PostgreSQL datasource. Models: `Tenant`, `User`, `Client`, `Proposal`, `ServiceTemplate`, `PricingRule`, `ActivityLog`, etc. |
| `frontend/package.json`        | React + Vite deps. `"type": "module"`. Vitest script (no test files exist)                                                   |
| `frontend/tsconfig.json`       | **Strict mode OFF**. `moduleResolution: bundler`. Same path aliases as backend.                                              |
| `frontend/vite.config.ts`      | Dev proxy to `localhost:3001`, PWA plugin, manual chunks (vendor)                                                            |
| `frontend/tailwind.config.js`  | Custom colours, glass utilities, animations, dark mode via `class`                                                           |
| `shared/tsconfig.json`         | `strict: true`. Outputs CommonJS to `dist/` with declarations.                                                               |
| `.github/workflows/ci-cd.yml`  | Main pipeline: lint, typecheck, test (against PG+Redis), build/push Docker images, deploy to dev/staging/prod                |
| `docker-compose.yml`           | **Local dev (hot reload)** — Node containers + Postgres + Redis + Adminer + Redis Commander                                    |
| `docker-compose.prod.yml`      | **Production-like** stack — builds `Dockerfile.*.optimized` images                                                               |
| `render.yaml`                  | Render Infrastructure-as-Code (primary target)                                                                               |

---

## 5. World-Class UX Features

### Command Palette (Cmd+K)

Access from anywhere with `Cmd/Ctrl + K`:

- **Navigation**: `G D` (Dashboard), `G P` (Proposals), `G C` (Clients), `G S` (Services)
- **Actions**: `C P` (Create Proposal), `C C` (Create Client)
- **Search**: Filter commands in real-time
- **Keyboard Navigation**: Arrow keys + Enter to select

**Implementation**: `frontend/src/components/command-palette/CommandPalette.tsx`

### Keyboard Shortcuts (?)

Press `?` anywhere to view all shortcuts:

- Global: Cmd+K, ?, Esc
- Navigation: G + letter combinations
- Actions: C + letter combinations
- Lists: J/K navigation, / for search

**Implementation**: `frontend/src/components/keyboard/KeyboardShortcuts.tsx`

### Glassmorphism Design System

- **Frosted glass cards**: Backdrop blur (12-20px) with transparency
- **Theme support**: Light/Dark/System modes
- **Gradient accents**: Purple/indigo gradient buttons
- **Smooth animations**: Hover lifts, transitions, micro-interactions via Framer Motion
- **Mobile responsive**: Touch-friendly 44px targets

**Key Classes**:

```css
.glass-card      /* Glass card container */
.glass-tile      /* Interactive glass tile */
.btn-primary     /* Gradient glass button */
.input-field     /* Glass form input */
.card            /* Standard glass card */
```

**Implementation**: `frontend/src/index.css`, `frontend/tailwind.config.js`

### Skeleton Loading States

Content-aware loading placeholders:

- `SkeletonCard` - Dashboard cards
- `SkeletonTable` - Data tables
- `SkeletonStats` - Statistics grid
- `SkeletonForm` - Form fields
- `SkeletonProposalDetail` - Proposal detail page

**Implementation**: `frontend/src/components/skeleton/SkeletonCard.tsx`

### Theme System

- **Store**: `frontend/src/stores/themeStore.ts` (Zustand)
- **Toggle**: `frontend/src/components/theme/ThemeToggle.tsx`
- **CSS Variables**: Dynamic theming with CSS custom properties
- **Persistence**: Saved to localStorage
- **System Detection**: Auto-detects OS preference

---

## 6. Build, Dev & Test Commands

### Install Dependencies

```bash
npm install
# reproducible (CI / clean machines)
npm ci
```

### Development

```bash
# One terminal — backend + frontend
npm run dev
```

Or run packages separately:

```bash
cd backend && npm run dev      # tsx watch src/index.ts
cd frontend && npm run dev     # vite --host
```

### Build (Production)

```bash
npm run build            # builds shared → backend → frontend
npm run build:shared     # cd shared && npm run build
npm run build:backend    # cd backend && npm run build
npm run build:frontend   # cd frontend && npm run build
```

### Database

```bash
npm run db:generate      # Prisma client generation
npm run db:migrate       # Prisma migrate dev
npm run db:seed          # Runs backend/prisma/seed-enhanced.ts
npm run db:studio        # Prisma Studio
```

### Testing

> **Important:** Only the E2E test suite contains actual test files. Backend Jest and frontend Vitest are installed but have **zero test files** at present.

```bash
# E2E Tests (Playwright) — Active test suite
cd e2e-tests && npx playwright test
cd e2e-tests && npx playwright test --headed     # visible browser
cd e2e-tests && npx playwright show-report       # view HTML report
npm run test:e2e                                  # from root

# Backend — Jest 29 with ts-jest
cd backend && npm test                            # run pricing + mtditsa tests

# Frontend — Vitest is installed but has no tests
cd frontend && npm test

# Standalone debug/validation script
node scripts/debug-and-test.js          # run all checks
node scripts/debug-and-test.js --pricing
node scripts/debug-and-test.js --vat
node scripts/debug-and-test.js --csrf
```

### Linting

```bash
cd backend && npm run lint   # eslint src --ext .ts
cd frontend && npm run lint  # eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0
```

### Docker (Local Development)

```bash
docker compose up
```

For a production-like image build locally:

```bash
docker compose -f docker-compose.prod.yml up --build
```

Services (dev compose):

- PostgreSQL: `:5432`
- Redis: `:6379`
- Backend API: `:3001` (Vite dev server on frontend: `:5173`)
- Adminer: `:8080`
- Redis Commander: `:8081`

---

## 7. Runtime Architecture

### Backend (`backend/src/index.ts`)

- **Port:** `process.env.PORT || 3001`
- **Security Stack:** Helmet (CSP + HSTS), CORS, rate-limiting, cookie-parser, CSRF double-submit cookies

**Request Flow:**

1. `dotenv.config()` loads env vars **first**, before any other imports
2. Security middleware: `helmet` (strict CSP, HSTS 1 year), `cors` (whitelisted origins + regex for Vercel/Render), `cookie-parser`
3. **Auth routes mounted BEFORE CSRF** (`/api/auth`)
4. CSRF cookie set globally; CSRF validation applied to `/api/*`
5. `extractTenant` middleware (`backend/src/middleware/tenant.ts`) on API routes
6. API routes mounted
7. Static files served from `public/`; uploads from `/uploads`
8. SPA fallback (`index.html`) for non-API routes

**Background Jobs:**

- **Renewal reminders** scheduled daily (`runRenewalReminders`) + immediate startup run after 60s
- **Auto-migration** runs non-blocking 5s after server start

**CORS Origins:**

- Whitelisted: localhost, Render subdomains, Vercel preview URLs
- Production: `https://engage.capstonesoftware.co.uk`
- Regex patterns for Vercel previews and Render subdomains

**Rate Limiting:**

- Auth endpoints: 10 requests per 15 minutes
- Public proposals (`/api/proposals/view`): 30 requests per 15 minutes
- General API: 100 requests per 15 minutes (health checks skipped)

**Health Check:** `GET /ping` returns `{ "status": "ok" }`

**Production Startup (`backend/start-prod.mjs`):**

1. Schema fix checks (adds missing columns if needed)
2. Prisma migration resolve/deploy
3. Seeds UK services via `seed-uk-services.js`
4. Fixes billing cycle via `fix-billing-cycle.js`
5. Imports `dist/index.js` to start server

**Render deployment specifics (current code):**

- `tenant.ts` extracts tenant from subdomain for custom domains, and falls back to `demo` for localhost, Railway, and Render
- **CORS:** permissive `*.onrender.com` behaviour is **opt-in** via `ALLOW_RENDER_WILDCARD_ORIGINS=true` (do not enable unless you need it)
- **Public seed / admin keys:** use env vars (`PUBLIC_SEED_KEY`, `ADMIN_SECRET_KEY`, etc.); see `backend/.env.example` — no hardcoded keys in source

### Frontend

- **Dev Server:** `localhost:5173`
- **Build Output:** `frontend/dist`
- **API Client:** `frontend/src/utils/api.ts` — axios pointing at `VITE_API_URL`
- **Auth State:** `useAuthStore` (Zustand + persist). **Token is NOT persisted** to localStorage — memory only. `user`, `tenant`, and `isAuthenticated` are persisted.
- **Theme State:** `useThemeStore` (Zustand + persist). Theme preference persisted
- **PWA:** Configured via `vite-plugin-pwa` with service worker, manifest, offline support
- **Command Palette:** `useCommandPalette` hook for global Cmd+K access
- **CSRF Handling:** Sophisticated in-memory caching + automatic retry on `CSRF_MISSING` / `CSRF_INVALID` failures

### Shared Package

- Built to `shared/dist/` as CommonJS with `.d.ts` declarations
- Imported via `@shared/*` path alias
- Contains: enums, interfaces, validation functions, pricing engine, MTD ITSA calculator
- **Important:** Must be built before backend/frontend builds
- **Note on `UserRole` discrepancy:** The Prisma schema defines `ADMIN, PARTNER, MANAGER, SENIOR, JUNIOR`. The `shared` package defines `PARTNER, MANAGER, SENIOR, JUNIOR, CLIENT` (no `ADMIN`, adds `CLIENT`). Code referencing roles must use the correct source.

---

## 8. Code Style & Conventions

### TypeScript

- **Strict mode is intentionally DISABLED** in both `backend/tsconfig.json` and `frontend/tsconfig.json`. Do NOT enable without extensive testing.
- Backend compiled output goes to `backend/dist/`. Use **`.js` extensions** in backend imports (e.g., `from './auth.js'`)
- Frontend uses ES modules (`"type": "module"`)
- `shared` package has `strict: true` for type safety at the boundary

### Path Aliases

- `@/*` → `src/*`
- `@shared/*` → `../shared/src/*`

### API Response Format

All backend routes return:

```typescript
{
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details? };
  meta?: { page?; limit?; total?; totalPages? };
}
```

### Naming Conventions

- React components: PascalCase files + PascalCase exports
- Utility files / hooks: camelCase
- Route modules: camelCase (e.g., `proposals.ts`, `auth.ts`)
- Database models: PascalCase (Prisma convention)

### Styling

- Tailwind CSS only. No CSS modules or styled-components.
- Dark mode toggled by `dark` class on parent (`darkMode: 'class'`)
- Custom glass utilities in `tailwind.config.js`
- CSS variables for theming in `frontend/src/styles/base.css`

---

## 9. Database Schema Overview

### Main Models

| Model                 | Purpose                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------- |
| `Tenant`              | Multi-tenant isolation; subdomain, branding, VAT settings, Stripe IDs                   |
| `User`                | Firm users with `UserRole` (ADMIN→JUNIOR), tenant-scoped                                |
| `RefreshToken`        | Stored JWT refresh tokens                                                               |
| `Client`              | Client records with Companies House data, MTD ITSA status                               |
| `Proposal`            | Core proposal with pricing, status tracking, signatures, share tokens, payment tracking |
| `ProposalService`     | Line items with display pricing, billing frequency, per-line VAT                        |
| `ProposalDocument`    | Attached files                                                                          |
| `ProposalView`        | View tracking (IP, user agent, duration)                                                |
| `ProposalSignature`   | UK-compliant e-signature records                                                        |
| `ServiceTemplate`     | Reusable service catalog with pricing models                                            |
| `ProposalTemplate`    | Pre-configured proposals                                                                |
| `CoverLetterTemplate` | Merge-field cover letters with tone settings                                            |
| `PricingRule`         | Dynamic conditional pricing adjustments                                                 |
| `ActivityLog`         | Audit trail                                                                             |

### Key Enums

- `UserRole` (Prisma): ADMIN, PARTNER, MANAGER, SENIOR, JUNIOR
- `UserRole` (shared): PARTNER, MANAGER, SENIOR, JUNIOR, CLIENT
- `CompanyType`: SOLE_TRADER, PARTNERSHIP, LIMITED_COMPANY, LLP, CHARITY, NON_PROFIT
- `ProposalStatus`: DRAFT, SENT, VIEWED, ACCEPTED, DECLINED, EXPIRED
- `MTDITSAStatus`: NOT_REQUIRED, ELIGIBLE, MANDATORY, OPTED_IN, EXEMPT, REQUIRED_2026, REQUIRED_2027, REQUIRED_2028
- `ServiceCategory`: COMPLIANCE, ADVISORY, TAX, PAYROLL, BOOKKEEPING, AUDIT, CONSULTING, TECHNICAL, SPECIALIZED
- `PricingModel`: FIXED, HOURLY, TIERED, CUSTOM, PER_EMPLOYEE, PER_TRANSACTION
- `BillingCycle` / `PricingFrequency`: ONE_TIME, WEEKLY, MONTHLY, QUARTERLY, ANNUALLY
- `PriceDisplayMode`: PER_MONTH, PER_QUARTER, PER_YEAR, ONE_TIME, PER_HOUR, PER_UNIT
- `CoverLetterTone`: PROFESSIONAL, FRIENDLY, MODERN

---

## 10. Testing Strategy

### E2E Testing (Playwright) — Active

- **Config:** `e2e-tests/playwright.config.ts`
- **Specs:** `e2e-tests/specs/`
  - `proposal-pricing.spec.ts` — Pricing frequency, VAT calculation, CSRF handling
  - `unit-calculations.spec.ts` — Math tests for frequency conversions, VAT, discounts
- **Fixtures:** `e2e-tests/fixtures/helpers.ts` — `loginAsPartner()`, `createTestClient()`, `createTestProposal()`, `calculateVAT()`, etc.
- **Browsers:** Chromium, Firefox, WebKit
- **Features:** Auto-retry on failure (2 in CI, 1 local), screenshots on failure, video on failure, trace on first retry
- **Run:** `cd e2e-tests && npx playwright test`

### Backend Testing — Active

- **Framework:** Jest 29 with `ts-jest`
- **Config:** `backend/jest.config.js`
- **Scripts:** `cd backend && npm test` (jest), `npm run test:watch` (jest --watch)
- **Test files:** `backend/src/services/__tests__/pricing.test.ts`, `backend/src/services/__tests__/mtditsa.test.ts`
- **Status:** 20 tests passing. Tests import from `@shared/*` via `moduleNameMapper`.

### Frontend Testing — Installed but empty

- **Framework:** Vitest 1.1
- **Script:** `cd frontend && npm test`
- **Status:** No `vitest.config.ts` and **no `.test.` / `.spec.` files** exist under `frontend/src/`. Running the script starts Vitest in watch mode with no tests found.

### Custom Debug Script

- **`scripts/debug-and-test.js`** — Standalone Node.js runner that validates recent fixes:
  - Pricing frequency calculations (`--pricing`)
  - VAT calculations (`--vat`)
  - Database schema validation (`--schema`)
  - CSRF token handling (`--csrf`)
  - Service template frequencies (`--templates`)
  - File changes verification (`--files`)

### CI/CD Testing

The `.github/workflows/ci-cd.yml` **test** job spins up PostgreSQL 15 and Redis 7, runs `npm ci`, Prisma generate/migrate, then **`cd backend && npm test -- --coverage`**. The **E2E** job builds all packages, starts backend + frontend, and runs Playwright (Chromium).

---

## 11. Security Considerations

### Authentication & Authorization

- **JWT:** Required `JWT_SECRET` env var. Tokens expire per `JWT_EXPIRES_IN` (default: 24h)
- **Refresh Tokens:** Stored in database, expire per `JWT_REFRESH_EXPIRES_IN` (default: 7d)
- **Password Hashing:** `bcryptjs` with `BCRYPT_ROUNDS` (default: 12)

### CSRF Protection

- **Pattern:** Double-submit cookie
- **Cookie:** `csrfToken` — `httpOnly: false` (JS readable)
- **Header:** State-changing requests must include `X-CSRF-Token`
- **Auto-retry:** Frontend automatically retries on CSRF failure
- **Exemptions:** `GET`, `HEAD`, `OPTIONS`, plus public paths (`/auth`, `/payments/webhook`, `/oauth/callback`, `/proposals/view`, admin/automation setup paths)
- **Production note:** CSRF cookie uses `sameSite: 'none'` in production for cross-domain deployments (e.g., Vercel frontend + Render/Railway backend)

### Rate Limiting

- **Auth endpoints:** 10 requests per 15 minutes (`/api/auth/login`, `/api/auth/register`)
- **Public proposals:** 30 requests per 15 minutes (`/api/proposals/view`)
- **General API:** 100 requests per 15 minutes

### Other Security Measures

- **Helmet:** CSP configured for production, HSTS enabled (1 year)
- **File Uploads:** `multer` with 10 MB JSON body limit
- **CORS:** Explicit origin whitelist, credentials enabled
- **Input Validation:** `express-validator` and Zod schemas

---

## 12. Deployment

### Git branches & what they trigger

| Branch / action | Typical outcome |
| ---------------- | ---------------- |
| **`main`** | **Staging path** in `ci-cd.yml` (Railway backend staging + Vercel staging) when that workflow’s deploy jobs run; **`deploy-render.yml`** also runs on push to **`main` or `master`** and triggers **Render** backend then frontend deploy via the Render API |
| **`develop`** | **Development** deploy job in `ci-cd.yml` (Railway dev + Vercel dev), when enabled |
| **`workflow_dispatch`** | **Production** deploy in `ci-cd.yml` is **manual only** (includes DB backup, migrations, Slack) |

**Render auto-deploy:** If each Render service is connected to the same GitHub repo, pushing the linked branch can start a deploy **without** the GitHub Action — check the service’s **Auto-Deploy** branch in the Render dashboard.

**Manual Render API deploy:** `scripts/deploy.sh` / `scripts/deploy.ps1` (requires `RENDER_API_KEY` and service IDs). Same idea as `.github/workflows/deploy-render.yml`.

### Cursor hooks (project)

- **Config:** `engage/.cursor/hooks.json`
- **Scripts:** `engage/.cursor/hooks/*` (tracked in git)
- **Current behaviour:** `beforeShellExecution` on `git push` runs `git-push-guard.sh` — prompts (does not block by default) to run **`npm run verify`** and confirm Render secrets / `scripts/deploy.sh`. Set **`SKIP_DEPLOY_GUARD=1`** to skip the prompt.

### npm: `Unknown env config "devdir"` warning

npm 10+ rejects the legacy **`devdir`** key. If you see this when running `npm ci` locally, remove **`devdir=...`** from **`~/.npmrc`** (or from any parent `.npmrc` loaded before the project). This repository does not set `devdir`.

### CI/CD Pipeline (GitHub Actions)

There are multiple workflows in `.github/workflows/` (including a **reusable** `playwright-e2e.yml`).

#### `ci-cd.yml` (Main Pipeline)

A unified pipeline using **npm** and **Docker Buildx**:

1. **Lint & Type Check** — `npm ci`; runs `npm run lint`, `npm run typecheck`, `npm run format:check`
2. **Test Suite** — PostgreSQL 15 + Redis 7; Prisma generate/migrate; **`cd backend && npm test -- --coverage`**; coverage upload reads **`backend/coverage/lcov.info`**
3. **E2E Tests** — Runs after lint + unit tests; calls **`playwright-e2e.yml`** (builds shared/backend/frontend, seeds UK services, starts backend + `vite preview`, Playwright Chromium)
4. **Build & Push Images** — Runs only after **lint, test, and E2E** succeed on **push**; logs into GHCR and pushes `backend` / `frontend` images with Git SHA tags
5. **Deploy Dev** (`develop` branch) — Backend to Railway (`engage-backend-dev`); frontend to Vercel (dev)
6. **Deploy Staging** (`main` branch) — Backend to Railway (`engage-backend-staging`); runs migrations; frontend to Vercel (staging); health checks
7. **Deploy Production** (manual `workflow_dispatch` only) — Backs up DB with `pg_dump`; deploys backend to Railway (`engage-backend-prod`); runs migrations; deploys frontend to Vercel with `--prod`; health checks; notifies Slack

#### `e2e-scheduled.yml`

Weekday **06:00 UTC** cron plus **workflow_dispatch**; calls the same **`playwright-e2e.yml`** reusable job so regressions are caught between merges (uses the workflow file from the **default branch**).

#### `deploy-render.yml`

Triggered on push to **`master`** or **`main`**. Uses the Render REST API to trigger a **backend** deploy, then a **frontend** deploy (frontend uses **`clearCache: true`**). Requires GitHub secrets: `RENDER_API_KEY`, `RENDER_BACKEND_SERVICE_ID`, `RENDER_FRONTEND_SERVICE_ID`.

#### `deploy-to-render.yml` & `deploy.yml`

Earlier/simpler Render deploy workflows.

#### `security.yml` (Comprehensive Security Scanning)

Runs on schedule (daily 2 AM), PRs, and pushes to `main`/`develop`:

- Dependency scan (`npm audit`, Snyk)
- CodeQL (JavaScript/TypeScript)
- Container scan (Trivy on backend/frontend images)
- Secret scan (GitLeaks)
- Infrastructure scan (Checkov)
- SSL check (SSL Labs grade A or A+)

### Render (Primary — Free Tier)

- **`render.yaml`:** Blueprint for Infrastructure-as-Code
  - **Backend:** Node web service (`engage-backend`), free plan, auto-sleeps after 15 min. Build (blueprint): `npm ci && npm run build:shared && npm run build:backend` (compiles `dist/`; Prisma client runs in `backend` prebuild). Start: `cd backend && npm start` → `start-prod.mjs` (runs `prisma migrate deploy` on boot). Health check: `/ping`. Port: `10000`.
  - **Frontend:** Static site (`engage-frontend`), rootDir `frontend/`. Build: cache-busting `rm -rf dist ... && npm install --include=dev && npm run build`. Publish: `./dist`. SPA fallback to `index.html`.
  - **Database:** Render PostgreSQL free tier (`engage-db`)
- **`scripts/deploy.sh`:** Manual bash script to trigger Render deploys via API
- **`nginx.conf`:** Config for serving the frontend SPA with gzip, security headers, long-term asset caching, and API proxying

### Railway + Vercel (Secondary / Staging-Production)

- **`railway.toml`:** Points to root `Dockerfile`, healthcheck `/ping`, custom domain `engage.capstonesoftware.co.uk`
- **`DEPLOYMENT_GUIDE.md`:** Documents the preferred production path with Neon PostgreSQL (Frankfurt), Railway backend, Vercel frontend

### Docker

```bash
docker-compose up --build
```

Three Dockerfiles exist:

1. **`Dockerfile` (root):** Multi-stage backend build (`node:20-alpine`). **Now uses `start-prod.mjs` as CMD** to ensure migrations run on container start.
2. **`Dockerfile.backend.optimized`:** Used by `docker-compose.yml` and CI. **Now uses `start-prod.mjs` as CMD** for the same reason.
3. **`Dockerfile.frontend.optimized`:** Builds Vite frontend and serves via nginx

### Required Environment Variables

| Variable                                           | Description                  |
| -------------------------------------------------- | ---------------------------- |
| `DATABASE_URL`                                     | PostgreSQL connection string |
| `JWT_SECRET`                                       | Min 32 characters            |
| `JWT_EXPIRES_IN`                                   | e.g. `24h`                   |
| `JWT_REFRESH_EXPIRES_IN`                           | e.g. `7d`                    |
| `FRONTEND_URL`                                     | CORS origin                  |
| `REDIS_URL`                                        | Optional but recommended     |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Email delivery               |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`       | Payments                     |
| `STRIPE_PUBLISHABLE_KEY`                           | Frontend Stripe integration  |
| `COMPANIES_HOUSE_API_KEY`                          | UK company lookup            |

---

## 13. Common Pitfalls

1. **Import extensions in backend:** Always use `.js` in backend TypeScript imports (e.g., `from './auth.js'`). The TS compiler does not rewrite them.

2. **Shared package must be built first:** Run `npm run build:shared` before building backend or frontend.

3. **Prisma client regeneration:** After any schema change, run `npm run db:generate` before building or running.

4. **CSRF on public routes:** The backend skips CSRF for `/api/proposals/view/*`, `/api/payments/webhook`, OAuth callbacks. Add new webhooks to `publicPaths` in `backend/src/middleware/auth.ts`.

5. **CORS whitelisting:** Render and Vercel preview URLs are regex-matched. Add new domains to `allowedOrigins` in `backend/src/index.ts`.

6. **TypeScript strict mode:** Both backend and frontend have `strict: false`. Do not enable without extensive testing.

7. **Package manager consistency:** Use **npm** and commit **`package-lock.json`**. Prefer `npm ci` on CI and clean machines.

8. **Theme class:** Dark mode requires `dark` class on `html` element. Use `useThemeStore` to toggle.

9. **UserRole mismatch:** Prisma schema includes `ADMIN`; the `shared` package does not. Be careful which source you import `UserRole` from.

10. **Render tenant resolution:** `backend/src/middleware/tenant.ts` handles subdomain extraction for custom domains while still defaulting to `demo` for localhost, Railway, and Render.

---

## 14. Quick Reference — File-to-Concern Map

| Concern                   | File(s)                                                                          |
| ------------------------- | -------------------------------------------------------------------------------- |
| Auth (JWT + CSRF)         | `backend/src/middleware/auth.ts`                                                 |
| API client                | `frontend/src/utils/api.ts`                                                      |
| Auth state                | `frontend/src/stores/authStore.ts`                                               |
| Theme state               | `frontend/src/stores/themeStore.ts`                                              |
| Command palette           | `frontend/src/components/command-palette/CommandPalette.tsx`                     |
| Keyboard shortcuts        | `frontend/src/components/keyboard/KeyboardShortcuts.tsx`                         |
| Skeleton loading          | `frontend/src/components/skeleton/SkeletonCard.tsx`                              |
| Theme toggle              | `frontend/src/components/theme/ThemeToggle.tsx`                                  |
| Database / Prisma         | `backend/src/config/database.ts`, `backend/prisma/schema.prisma`                 |
| Pricing engine            | `backend/src/services/pricingEngine.ts`, `shared/src/index.ts`                   |
| PDF generation            | `backend/src/services/pdfGenerator.ts`                                           |
| MTD ITSA logic            | `backend/src/services/mtditsa.ts`, `shared/src/index.ts`                         |
| Email service             | `backend/src/services/emailService.ts`                                           |
| Error handling            | `backend/src/middleware/errorHandler.ts`                                         |
| Route definitions (React) | `frontend/src/App.tsx`                                                           |
| Tailwind theme            | `frontend/tailwind.config.js`                                                    |
| Vite config               | `frontend/vite.config.ts`                                                        |
| Shared types              | `shared/src/index.ts`                                                            |
| Proposal sharing          | `backend/src/services/proposalSharingService.ts`                                 |
| Companies House           | `backend/src/services/companiesHouse.ts`, `backend/src/routes/companiesHouse.ts` |
| Tenant middleware         | `backend/src/middleware/tenant.ts`                                               |
| Redis config              | `backend/src/config/redis.ts`                                                    |
| Stripe config             | `backend/src/config/stripe.ts`                                                   |
| Environment validation    | `backend/src/config/env.ts`                                                      |
| Logger                    | `backend/src/utils/logger.ts`                                                    |
| Production startup        | `backend/start-prod.mjs`                                                         |
| Debug/test runner         | `scripts/debug-and-test.js`                                                      |

---

## 15. External Integrations

| Service               | Purpose                        | Key Files                                                        |
| --------------------- | ------------------------------ | ---------------------------------------------------------------- |
| **Stripe**            | Subscription billing, payments | `backend/src/routes/payments.ts`, `backend/src/config/stripe.ts` |
| **Adfin**             | Alternative payment provider   | `backend/src/routes/adfin.ts`, `backend/src/services/adfin.ts`   |
| **Companies House**   | UK company lookup              | `backend/src/services/companiesHouse.ts`                         |
| **SMTP (Nodemailer)** | Email delivery                 | `backend/src/services/emailService.ts`                           |
| **Redis**             | Caching, session storage       | `backend/src/config/redis.ts`                                    |
| **PDFKit**            | PDF generation                 | `backend/src/services/pdfGenerator.ts`                           |
| **Google APIs**       | OAuth, Gmail integration       | `backend/src/services/emailService.ts`                           |

---

## 16. Development Workflow

### Adding a New Feature

1. Update Prisma schema if needed
2. Run `npm run db:generate` and `npm run db:migrate`
3. Add backend route in `backend/src/routes/`
4. Add frontend page/component in `frontend/src/`
5. Update shared types in `shared/src/index.ts` if needed
6. Build shared: `npm run build:shared`
7. Test locally with `npm run dev:backend` and `npm run dev:frontend`

### Before Committing

1. Run `npm run build` to ensure everything compiles
2. Check for TypeScript errors (despite `strict: false`)
3. Test critical paths (auth, proposal creation, PDF generation)
4. Test dark/light theme switching
5. Verify command palette works (Cmd+K)

### Emergency Rollback

- Production deploys create database backups automatically via CI
- Rollback to previous Docker image tag in Railway dashboard
- Database migrations are forward-only; plan accordingly

---

## 17. Environment Setup

### Required Files

Copy `.env.example` to `.env` and fill in values:

```bash
cp .env.example .env
```

Key environment variables:

- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — Minimum 32 characters
- `VITE_API_URL` — Backend URL for frontend
- `FRONTEND_URL` — Frontend URL for CORS

### Local Development

1. Start Docker services: `docker-compose up -d postgres redis`
2. Run migrations: `npm run db:migrate`
3. Seed database: `npm run db:seed`
4. Start backend: `npm run dev:backend`
5. Start frontend: `npm run dev:frontend`

---

_Built with ❤️ by Capstone_
