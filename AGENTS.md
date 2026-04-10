# Engage by Capstone — Agent Guide

> **Purpose:** This document exists for AI coding agents. It summarises the project architecture, conventions, and workflows so you can be productive immediately.  
> **Last updated:** 2026-04-10

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

| Layer | Technology |
|-------|------------|
| **Monorepo** | npm workspaces + pnpm (`pnpm-workspace.yaml`) + Turbo (`turbo.json`) |
| **Backend** | Node.js 20+, Express.js 4, TypeScript 5.3+, Prisma 5.22, PostgreSQL 15 |
| **Frontend** | React 18, TypeScript, Vite 5, Tailwind CSS 3, Zustand 4 |
| **Shared** | TypeScript package exposing enums, interfaces, validation, pricing engine |
| **Testing** | Jest (backend), Vitest (frontend), Playwright (E2E) |
| **Caching** | Redis 7 (via `ioredis`) — optional but configured |
| **Package Manager** | npm + pnpm hybrid (npm for local, pnpm in CI) |
| **CI/CD** | GitHub Actions (`.github/workflows/ci-cd.yml`) |
| **Containerization** | Docker + Docker Compose |
| **Deployment** | Railway (backend), Vercel (frontend), Render (alternative) |

---

## 3. Repository Layout

```
engage/
├── backend/                  # Express API
│   ├── src/
│   │   ├── config/           # database, env, logger, redis, stripe
│   │   ├── data/             # seed data (UK accountancy services, cover letters)
│   │   ├── errors/           # custom error classes
│   │   ├── jobs/             # background jobs (renewal reminders)
│   │   ├── middleware/       # auth, errorHandler, healthCheck, tenant extraction
│   │   ├── routes/           # Express route modules
│   │   ├── scripts/          # one-off scripts (seedServices, startup)
│   │   ├── services/         # business logic (pdf, email, pricing, MTD ITSA)
│   │   ├── templates/        # email and document templates
│   │   └── utils/            # cache, encryption, logger helpers
│   ├── prisma/
│   │   ├── schema.prisma     # Full Prisma schema (600+ lines)
│   │   ├── migrations/       # Prisma migration files
│   │   └── seed-enhanced.ts  # Database seeding
│   └── dist/                 # Compiled JavaScript output
├── frontend/                 # React SPA
│   ├── src/
│   │   ├── components/       # React components
│   │   │   ├── command-palette/   # Cmd+K command palette
│   │   │   ├── keyboard/          # Keyboard shortcuts help
│   │   │   ├── layout/            # Dashboard, Sidebar, Header
│   │   │   ├── skeleton/          # Loading skeletons
│   │   │   ├── theme/             # Theme toggle
│   │   │   └── ui/                # UI primitives
│   │   ├── hooks/            # Custom hooks (useCommandPalette)
│   │   ├── pages/            # route-level page components
│   │   ├── stores/           # Zustand stores (auth, theme)
│   │   ├── styles/           # CSS styles (base.css)
│   │   └── utils/            # helpers (api.ts)
│   ├── public/               # static assets
│   └── dist/                 # Vite build output
├── shared/                   # Cross-package types & utilities
│   ├── src/
│   │   └── index.ts          # Enums, interfaces, validation, pricing engine, MTD ITSA
│   └── dist/                 # Compiled CommonJS output with declarations
├── e2e-tests/                # Playwright E2E tests
├── scripts/                  # Deployment and utility scripts
├── .github/workflows/        # GitHub Actions CI/CD
├── docker-compose.yml        # Local development stack
├── render.yaml               # Render Blueprint for deployment
├── railway.toml              # Railway deployment config
├── Dockerfile                # Production Docker build (root)
├── Dockerfile.backend.optimized
├── Dockerfile.frontend.optimized
└── nginx.conf                # Nginx configuration for frontend
```

---

## 4. Key Configuration Files

| File | Purpose |
|------|---------|
| `package.json` (root) | Workspace scripts, shared devDeps |
| `pnpm-workspace.yaml` | Workspace packages: `backend`, `frontend`, `shared` |
| `turbo.json` | Turbo pipeline: `build`, `test`, `lint`, `typecheck`, `dev`, `clean` |
| `backend/package.json` | Express deps, Prisma scripts, Jest |
| `backend/tsconfig.json` | **Strict mode OFF** (`"strict": false`). Output to `dist/`. Path aliases: `@/*` → `src/*`, `@shared/*` → `../shared/src/*` |
| `backend/prisma/schema.prisma` | PostgreSQL datasource. Models: `Tenant`, `User`, `Client`, `Proposal`, `ServiceTemplate`, `PricingRule`, `ActivityLog`, etc. |
| `frontend/package.json` | React + Vite deps, Vitest. `"type": "module"` |
| `frontend/tsconfig.json` | **Strict mode OFF**. `moduleResolution: bundler`. Same path aliases as backend. |
| `frontend/vite.config.ts` | Dev proxy to `localhost:3001`, PWA plugin, manual chunks |
| `frontend/tailwind.config.js` | Custom colours, glass utilities, animations, dark mode via `class` |
| `shared/tsconfig.json` | `strict: true`. Outputs CommonJS to `dist/` with declarations. |
| `.github/workflows/ci-cd.yml` | Lint, test, build, and deploy pipeline |
| `docker-compose.yml` | PostgreSQL, Redis, backend, frontend, Adminer, Redis Commander |

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
- **Smooth animations**: Hover lifts, transitions, micro-interactions
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
- `SkeletonProposalBuilder` - Multi-step forms

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
# or
pnpm install
```

### Development (Two Terminals)

```bash
# Terminal 1 — backend
cd backend && npm run dev      # tsx watch src/index.ts

# Terminal 2 — frontend  
cd frontend && npm run dev     # vite --host
```

> On Windows: Use `start-dev.bat` which launches both.

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

```bash
# Backend
cd backend && npm test   # Jest

# Frontend
cd frontend && npm test  # Vitest

# E2E Tests
cd e2e-tests && npx playwright test
```

### Linting

```bash
cd backend && npm run lint   # eslint src --ext .ts
cd frontend && npm run lint  # eslint . --ext ts,tsx
```

### Docker (Local Development)

```bash
docker-compose up --build
```

Services:
- PostgreSQL: `:5432`
- Redis: `:6379`
- Backend API: `:3001`
- Frontend: `:80`
- Adminer: `:8080`
- Redis Commander: `:8081`

---

## 7. Runtime Architecture

### Backend (`backend/src/index.ts`)

- **Port:** `process.env.PORT || 3001`
- **Security Stack:** Helmet (CSP + HSTS), CORS, rate-limiting, cookie-parser, CSRF double-submit cookies

**Request Flow:**
1. `dotenv.config()` loads env vars **first**, before any other imports
2. Auth routes mounted **before** CSRF protection
3. CSRF cookie set globally; CSRF validation applied to `/api/*`
4. Tenant extraction middleware (`extractTenant` from `tenant-simple.ts`) on API routes
5. API routes mounted
6. Static files served from `public/`
7. SPA fallback (`index.html`) for non-API routes

**CORS Origins:**
- Whitelisted: localhost, Render subdomains, Vercel preview URLs
- Production: `https://engage.capstonesoftware.co.uk`
- Regex patterns for Vercel previews and Render subdomains

**Health Check:** `GET /ping` returns `{ "status": "ok" }`

### Frontend

- **Dev Server:** `localhost:5173`
- **Build Output:** `frontend/dist`
- **API Client:** `frontend/src/utils/api.ts` — axios pointing at `VITE_API_URL`
- **Auth State:** `useAuthStore` (Zustand + persist). Token NOT persisted to localStorage — memory only
- **Theme State:** `useThemeStore` (Zustand + persist). Theme preference persisted
- **PWA:** Configured via `vite-plugin-pwa` with service worker, manifest, offline support
- **Command Palette:** `useCommandPalette` hook for global Cmd+K access

### Shared Package

- Built to `shared/dist/` as CommonJS with `.d.ts` declarations
- Imported via `@shared/*` path alias
- Contains: enums, interfaces, validation functions, pricing engine, MTD ITSA calculator
- **Important:** Must be built before backend/frontend builds

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
- Utility files: camelCase
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

| Model | Purpose |
|-------|---------|
| `Tenant` | Multi-tenant isolation; subdomain, branding, VAT, Stripe IDs |
| `User` | Account users with role-based access |
| `Client` | Client records with Companies House data, MTD ITSA status |
| `Proposal` | Core proposal entity with pricing, status tracking, signatures |
| `ProposalService` | Line items for proposals (includes vatRate, vatAmount, grossTotal) |
| `ServiceTemplate` | Reusable service definitions with pricing models |
| `ProposalTemplate` | Pre-configured proposal templates |
| `CoverLetterTemplate` | Customizable cover letter templates with merge fields |
| `PricingRule` | Dynamic pricing adjustments |
| `ActivityLog` | Audit trail for tenant activities |
| `RefreshToken` | JWT refresh token storage |
| `ProposalView` | Proposal view tracking for analytics |
| `ProposalSignature` | Electronic signature records (UK compliant) |
| `ProposalDocument` | Attached documents to proposals |

### Key Enums

- `UserRole`: ADMIN, PARTNER, MANAGER, SENIOR, JUNIOR
- `CompanyType`: SOLE_TRADER, PARTNERSHIP, LIMITED_COMPANY, LLP, CHARITY, NON_PROFIT
- `ProposalStatus`: DRAFT, SENT, VIEWED, ACCEPTED, DECLINED, EXPIRED
- `MTDITSAStatus`: NOT_REQUIRED, ELIGIBLE, MANDATORY, OPTED_IN, EXEMPT, REQUIRED_2026, REQUIRED_2027, REQUIRED_2028
- `ServiceCategory`: COMPLIANCE, ADVISORY, TAX, PAYROLL, BOOKKEEPING, AUDIT, CONSULTING, TECHNICAL, SPECIALIZED
- `PricingModel`: FIXED, HOURLY, TIERED, CUSTOM, PER_EMPLOYEE, PER_TRANSACTION
- `PricingFrequency`: MONTHLY, QUARTERLY, ANNUALLY, ONE_TIME

---

## 10. Testing Strategy

### Backend Testing

- **Framework:** Jest with `ts-jest`
- **Location:** `backend/tests/`
- **Run:** `cd backend && npm test`

### Frontend Testing

- **Framework:** Vitest + Playwright
- **Location:** `frontend/src/**/*.test.tsx`, `e2e-tests/`
- **Run:** `cd frontend && npm test` or `cd e2e-tests && npx playwright test`

### E2E Testing (Playwright)

- **Config:** `e2e-tests/playwright.config.ts`
- **Specs:** `e2e-tests/specs/`
- **Browsers:** Chromium, Firefox, WebKit
- **Features:** Auto-retry on failure, screenshots on failure, video recording

### CI/CD Testing

- GitHub Actions runs lint, typecheck, and test jobs
- Tests run against PostgreSQL 15 and Redis 7 services
- Coverage uploaded to Codecov

---

## 11. Security Considerations

### Authentication & Authorization

- **JWT:** Required `JWT_SECRET` env var. Tokens expire per `JWT_EXPIRES_IN` (default: 24h)
- **Refresh Tokens:** Stored in database, expire per `JWT_REFRESH_EXPIRES_IN` (default: 7d)
- **Password Hashing:** `bcryptjs` with `BCRYPT_ROUNDS` (default: 12)

### CSRF Protection

- **Pattern:** Double-submit cookie
- **Cookie:** `csrfToken` — `httpOnly: false` (JS readable), `sameSite: 'strict'`
- **Header:** State-changing requests must include `X-CSRF-Token`
- **Auto-retry:** Frontend automatically retries on CSRF failure
- **Exemptions:** `GET`, `HEAD`, `OPTIONS`, plus configured public paths

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

### CI/CD Pipeline (GitHub Actions)

Defined in `.github/workflows/ci-cd.yml`:

1. **Lint & Type Check** — Runs on PRs and pushes to `main`/`develop`
2. **Test** — Jest/Vitest with PostgreSQL and Redis services
3. **Build & Push** — Docker images to GHCR
4. **Deploy** — Automatic deploys to Railway (backend) and Vercel (frontend)

**Environments:**
- `develop` branch → Development environment
- `main` branch → Staging environment
- Manual trigger → Production (with approval)

### Docker

```bash
docker-compose up --build
```

### Railway

- `railway.toml` points to root `Dockerfile`
- Health check: `/ping`
- Automatic deploys from GitHub Actions or git pushes

### Render

- `render.yaml` defines Blueprint with free tier
- Backend: Node.js web service
- Frontend: Static site
- Database: PostgreSQL free tier

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Min 32 characters |
| `JWT_EXPIRES_IN` | e.g. `24h` |
| `JWT_REFRESH_EXPIRES_IN` | e.g. `7d` |
| `FRONTEND_URL` | CORS origin |
| `REDIS_URL` | Optional but recommended |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Email delivery |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Payments |
| `STRIPE_PUBLISHABLE_KEY` | Frontend Stripe integration |
| `COMPANIES_HOUSE_API_KEY` | UK company lookup |

---

## 13. Common Pitfalls

1. **Import extensions in backend:** Always use `.js` in backend TypeScript imports (e.g., `from './auth.js'`). The TS compiler does not rewrite them.

2. **Shared package must be built first:** Run `npm run build:shared` before building backend or frontend.

3. **Prisma client regeneration:** After any schema change, run `npm run db:generate` before building or running.

4. **CSRF on public routes:** The backend skips CSRF for `/api/proposals/view/*`, `/api/payments/webhook`, OAuth callbacks. Add new webhooks to `publicPaths` in `backend/src/middleware/auth.ts`.

5. **CORS whitelisting:** Render and Vercel preview URLs are regex-matched. Add new domains to `allowedOrigins` in `backend/src/index.ts`.

6. **TypeScript strict mode:** Both backend and frontend have `strict: false`. Do not enable without extensive testing.

7. **Package manager consistency:** Project uses npm locally but pnpm in CI. Prefer `npm install` locally to avoid lockfile conflicts.

8. **Theme class:** Dark mode requires `dark` class on `html` element. Use `useThemeStore` to toggle.

---

## 14. Quick Reference — File-to-Concern Map

| Concern | File(s) |
|---------|---------|
| Auth (JWT + CSRF) | `backend/src/middleware/auth.ts` |
| API client | `frontend/src/utils/api.ts` |
| Auth state | `frontend/src/stores/authStore.ts` |
| Theme state | `frontend/src/stores/themeStore.ts` |
| Command palette | `frontend/src/components/command-palette/CommandPalette.tsx` |
| Keyboard shortcuts | `frontend/src/components/keyboard/KeyboardShortcuts.tsx` |
| Skeleton loading | `frontend/src/components/skeleton/SkeletonCard.tsx` |
| Theme toggle | `frontend/src/components/theme/ThemeToggle.tsx` |
| Database / Prisma | `backend/src/config/database.ts`, `backend/prisma/schema.prisma` |
| Pricing engine | `backend/src/services/pricingEngine.ts`, `shared/src/index.ts` |
| PDF generation | `backend/src/services/pdfGenerator.ts` |
| MTD ITSA logic | `backend/src/services/mtditsa.ts`, `shared/src/index.ts` |
| Email service | `backend/src/services/emailService.ts` |
| Error handling | `backend/src/middleware/errorHandler.ts` |
| Route definitions (React) | `frontend/src/App.tsx` |
| Tailwind theme | `frontend/tailwind.config.js` |
| Vite config | `frontend/vite.config.ts` |
| Shared types | `shared/src/index.ts` |
| Proposal sharing | `backend/src/services/proposalSharingService.ts` |
| Companies House | `backend/src/services/companiesHouse.ts`, `backend/src/routes/companiesHouse.ts` |
| Tenant middleware | `backend/src/middleware/tenant-simple.ts` |
| Redis config | `backend/src/config/redis.ts` |
| Stripe config | `backend/src/config/stripe.ts` |
| Environment validation | `backend/src/config/env.ts` |
| Logger | `backend/src/utils/logger.ts` |

---

## 15. External Integrations

| Service | Purpose | Key Files |
|---------|---------|-----------|
| **Stripe** | Subscription billing, payments | `backend/src/routes/payments.ts`, `backend/src/config/stripe.ts` |
| **Companies House** | UK company lookup | `backend/src/services/companiesHouse.ts` |
| **SMTP (Nodemailer)** | Email delivery | `backend/src/services/emailService.ts` |
| **Redis** | Caching, session storage | `backend/src/config/redis.ts` |
| **PDFKit** | PDF generation | `backend/src/services/pdfGenerator.ts` |
| **Google APIs** | OAuth, Gmail integration | `backend/src/services/emailService.ts` |

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

*Built with ❤️ by Capstone*
