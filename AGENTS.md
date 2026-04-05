# Engage by Capstone — Agent Guide

> **Purpose:** This document exists for AI coding agents. It summarises the project architecture, conventions, and workflows so you can be productive immediately.  
> **Last updated:** 2026-04-05

---

## 1. Project Overview

**Engage by Capstone** is a professional proposal-generation platform built for UK accountancy practices. It enables firms to create, share, and electronically sign compliant engagement letters and proposals in under five minutes. Key capabilities include:

- **Multi-tenant architecture** (one database, row-level tenant isolation via `tenantId`)
- **Role-based access control:** `ADMIN`, `PARTNER`, `MANAGER`, `SENIOR`, `JUNIOR`
- **UK-specific compliance:** MTD ITSA assessment, Companies House lookup, VAT handling
- **PDF generation, electronic signatures, and proposal activity tracking**
- **Stripe subscription billing integration** with webhook handling
- **Public proposal sharing** via secure tokens with view tracking

---

## 2. Technology Stack

| Layer | Tech |
|-------|------|
| **Monorepo tooling** | npm workspaces + Turbo (`turbo.json`) + pnpm-workspace.yaml |
| **Backend** | Node.js 18+, Express.js, TypeScript, Prisma 5.22, PostgreSQL 14+ |
| **Frontend** | React 18, TypeScript, Vite 5, Tailwind CSS 3, Zustand 4 |
| **Shared code** | Plain TypeScript package (`shared/`) exposing enums, interfaces, and utilities |
| **Testing** | Jest (backend), Vitest (frontend) |
| **Caching** | Redis (via `ioredis` / `redis`) — optional but configured |
| **Package manager** | npm (root `package-lock.json` exists) |

---

## 3. Repository Layout

```
engage/
├── backend/               # Express API
│   ├── src/
│   │   ├── config/        # database, env, logger, redis, stripe
│   │   ├── data/          # seed data (UK accountancy services)
│   │   ├── errors/        # custom error classes
│   │   ├── middleware/    # auth, errorHandler, healthCheck, tenant-*
│   │   ├── routes/        # Express route modules
│   │   ├── scripts/       # one-off scripts (seedServices, startup)
│   │   ├── services/      # business logic (pdf, email, pricing, MTD ITSA, etc.)
│   │   ├── templates/     # email and document templates
│   │   ├── types/         # backend-specific TS types
│   │   └── utils/         # cache, encryption, logger helpers
│   ├── prisma/
│   │   ├── schema.prisma  # full Prisma schema (558 lines)
│   │   ├── seed-enhanced.ts
│   │   └── migrations/    # Prisma migration files
│   └── dist/              # Compiled JavaScript output
├── frontend/              # React SPA
│   ├── src/
│   │   ├── components/    # React components (grouped by feature + ui/ primitives)
│   │   ├── data/          # static data (e.g. defaultTerms)
│   │   ├── pages/         # route-level page components
│   │   ├── stores/        # Zustand stores (auth, theme)
│   │   └── utils/         # helpers (api.ts is the main axios client)
│   ├── public/            # static assets
│   └── dist/              # Vite build output
├── shared/                # Cross-package types & utilities
│   ├── src/
│   │   └── index.ts       # Enums, interfaces, validation, pricing engine, MTD ITSA calculator
│   ├── dist/              # Compiled output
│   └── package.json
├── landing/               # Landing page assets
├── scripts/               # Deployment and utility scripts
├── docker-compose.yml     # Local development with PostgreSQL + Redis
├── render.yaml            # Render Blueprint for deployment
├── railway.toml           # Railway deployment config
├── Dockerfile             # Production Docker build
├── Dockerfile.backend.optimized
└── Dockerfile.frontend.optimized
```

---

## 4. Key Configuration Files

| File | What it controls |
|------|------------------|
| `package.json` (root) | Workspace scripts, shared devDeps |
| `pnpm-workspace.yaml` | Workspace packages: `backend`, `frontend`, `shared` |
| `turbo.json` | Turbo pipeline: `build`, `test`, `lint`, `typecheck`, `dev`, `clean` |
| `backend/package.json` | Express deps, Prisma scripts, Jest |
| `backend/tsconfig.json` | **Strict mode is OFF** (`"strict": false`). Output to `dist/`. Path aliases: `@/*` → `src/*`, `@shared/*` → `../shared/src/*` |
| `backend/prisma/schema.prisma` | Single PostgreSQL datasource. Models: `Tenant`, `User`, `Client`, `Proposal`, `ServiceTemplate`, `PricingRule`, `ActivityLog`, etc. |
| `frontend/package.json` | React + Vite deps, Vitest |
| `frontend/tsconfig.json` | **Strict mode is OFF**. `moduleResolution: bundler`. Same path aliases as backend. |
| `frontend/vite.config.ts` | Dev proxy to `localhost:3001`, PWA plugin, manual chunks |
| `frontend/tailwind.config.js` | Custom colour palette (`primary`, `capstone`, `slate`, `success`, `warning`, `danger`), dark mode via `class` |
| `shared/tsconfig.json` | `strict: true`. Outputs CommonJS to `dist/` with declarations. |

---

## 5. Build, Dev & Test Commands

### Install dependencies
```bash
npm install
```

### Development (two terminals)
```bash
# Terminal 1 — backend
npm run dev:backend      # cd backend && tsx watch src/index.ts

# Terminal 2 — frontend
npm run dev:frontend     # cd frontend && vite --host
```

> On Windows there is also `start-dev.bat` which launches both.

### Build (production)
```bash
npm run build            # builds shared → backend → frontend
```

### Database
```bash
npm run db:generate      # Prisma client generation
npm run db:migrate       # Prisma migrate dev
npm run db:seed          # Runs `backend/prisma/seed-enhanced.ts`
npm run db:studio        # Prisma Studio
```

### Testing
```bash
# Backend
cd backend && npm test   # Jest

# Frontend
cd frontend && npm test  # Vitest
```

### Linting
```bash
cd backend && npm run lint   # eslint src --ext .ts
cd frontend && npm run lint  # eslint . --ext ts,tsx
```

---

## 6. Runtime Architecture

### Backend (`backend/src/index.ts`)
- **Port:** `process.env.PORT || 3001`
- **Security stack:** Helmet (CSP + HSTS), CORS, rate-limiting, cookie-parser, CSRF double-submit cookies
- **Request flow:**
  1. `dotenv.config()` loads env vars **first**
  2. Auth routes mounted **before** CSRF protection
  3. CSRF cookie set globally; CSRF validation applied to `/api/*`
  4. Tenant extraction middleware (`extractTenant` from `tenant-simple.ts`) on API routes
  5. API routes mounted
  6. Static files served from `public/`
  7. SPA fallback (`index.html`) for non-API routes
- **CORS origins:** explicitly whitelists localhost, Render subdomains, Vercel preview URLs, and `https://engage.capstonesoftware.co.uk`

### Frontend
- **Dev server:** `localhost:5173`
- **Build output:** `frontend/dist`
- **API client:** `frontend/src/utils/api.ts` — axios instance pointing at `VITE_API_URL` (defaults to `http://localhost:3001/api`)
- **Auth state:** `useAuthStore` (Zustand + persist). **Important:** the JWT token is **not** persisted to `localStorage`; it is kept in memory only. An `httpOnly` cookie flow is intended.

### Shared package
- Built to `shared/dist/` as CommonJS with `.d.ts` declarations.
- Imported in other packages via the `@shared/*` path alias.

---

## 7. Code Style & Conventions

### TypeScript
- **Strict mode is intentionally disabled** in both `backend/tsconfig.json` and `frontend/tsconfig.json`. Do not flip it on without a dedicated migration — it will break the build.
- Backend compiled output goes to `backend/dist/`. Imports in backend source use **`.js` extensions** (e.g. `import foo from './bar.js'`) because the compiler emits CommonJS and the runtime resolves `.js` files.
- Frontend uses standard ES modules (`"type": "module"` in `frontend/package.json`).

### Path aliases
- `@/*` → `src/*`
- `@shared/*` → `../shared/src/*`

### API response format
All backend routes should return:
```ts
{
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details? };
  meta?: { page?, limit?, total?, totalPages? };
}
```

### Naming
- React components: PascalCase files + PascalCase exports
- Utility files: camelCase
- Route modules: camelCase (e.g. `proposals.ts`, `auth.ts`)
- Database models: PascalCase (Prisma convention)

### Styling
- Tailwind CSS only. No CSS modules or styled-components in use.
- Dark mode is toggled by a `dark` class on a parent element (`darkMode: 'class'`).
- Custom colours are defined in `tailwind.config.js` — prefer `primary-600`, `capstone-700`, `success-500`, `danger-500`, etc.

---

## 8. Testing Strategy

- **Backend:** Jest with `ts-jest`. Test directory is `backend/tests/` (currently empty).
- **Frontend:** Vitest. No test files are currently committed.
- **Integration / E2E:** Playwright MCP traces exist in `.playwright-mcp/`, but no active Playwright test suite is configured in `package.json`.

When adding tests:
- Place backend tests next to the code under `backend/tests/` or co-located (`*.test.ts`).
- Place frontend tests co-located (`*.test.tsx`) or in `frontend/src/__tests__/`. Tests should use `*.test.ts` or `*.spec.ts` naming.

---

## 9. Security Considerations

- **JWT secret:** `JWT_SECRET` is required; the app throws on startup if missing.
- **CSRF:** Double-submit cookie pattern. `csrfToken` cookie is `httpOnly: false` (so JS can read it), `sameSite: 'strict'`. State-changing requests must include `X-CSRF-Token` header.
- **Rate limiting:** Auth endpoints (`/api/auth/login`, `/api/auth/register`) are limited to 10 requests per 15 minutes. General API is 100 per 15 minutes.
- **Password hashing:** `bcryptjs` with `BCRYPT_ROUNDS` (default 12).
- **File uploads:** `multer` with a 10 MB JSON body limit.
- **Helmet:** CSP configured for production; HSTS enabled.

---

## 10. Deployment

### Docker (local / self-hosted)
```bash
docker-compose up --build
```
Services: PostgreSQL, Redis, backend (`:3001`), frontend (`:80`), Adminer (`:8080`), Redis Commander (`:8081`).

### Render
- `render.yaml` defines a Blueprint with a free Node.js web service (`engage-backend`), a static frontend site (`engage-frontend`), and a free PostgreSQL database.
- Build command generates Prisma client, builds shared, then builds backend.
- Start command: `cd backend && npm start`.

### Railway
- `railway.toml` points to the root `Dockerfile`.
- Health check path: `/ping`.

### Environment variables (required for production)
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

## 11. Database Schema Overview

The Prisma schema defines the following main models:

| Model | Purpose |
|-------|---------|
| `Tenant` | Multi-tenant isolation; contains subdomain, branding colors, VAT settings, Stripe IDs |
| `User` | Account users with role-based access (ADMIN, PARTNER, MANAGER, SENIOR, JUNIOR) |
| `Client` | Client records with Companies House data, MTD ITSA status, addresses |
| `Proposal` | Core proposal entity with pricing, status tracking, signatures |
| `ProposalService` | Line items for proposals linked to service templates |
| `ServiceTemplate` | Reusable service definitions with pricing models |
| `ProposalTemplate` | Pre-configured proposal templates |
| `PricingRule` | Dynamic pricing adjustments based on conditions |
| `ActivityLog` | Audit trail for tenant activities |
| `RefreshToken` | JWT refresh token storage |
| `ProposalView` | Proposal view tracking for analytics |
| `ProposalSignature` | Electronic signature records (UK compliant) |

### Key Enums
- `UserRole`: ADMIN, PARTNER, MANAGER, SENIOR, JUNIOR
- `CompanyType`: SOLE_TRADER, PARTNERSHIP, LIMITED_COMPANY, LLP, CHARITY, NON_PROFIT
- `ProposalStatus`: DRAFT, SENT, VIEWED, ACCEPTED, DECLINED, EXPIRED
- `MTDITSAStatus`: NOT_REQUIRED, ELIGIBLE, MANDATORY, OPTED_IN, EXEMPT, REQUIRED_2026, REQUIRED_2027, REQUIRED_2028
- `ServiceCategory`: COMPLIANCE, ADVISORY, TAX, PAYROLL, BOOKKEEPING, AUDIT, CONSULTING, TECHNICAL, SPECIALIZED

---

## 12. Common Pitfalls

1. **Import extensions in backend:** Always use `.js` in backend TypeScript imports (e.g. `from './auth.js'`). The TS compiler does not rewrite them because `module: "CommonJS"` is paired with `esModuleInterop`.

2. **Shared package must be built first:** Run `npm run build:shared` before building backend or frontend, otherwise path-alias resolution may fail.

3. **Prisma client regeneration:** After any schema change, run `npm run db:generate` before building or running.

4. **CSRF on public routes:** The backend skips CSRF for `/api/proposals/view/*`, `/api/payments/webhook`, and OAuth callbacks. If you add new webhook or public endpoints, add them to the `publicPaths` array in `backend/src/middleware/auth.ts`.

5. **CORS whitelisting:** Render and Vercel preview URLs are regex-matched. If deploying to a new domain, add it to `allowedOrigins` in `backend/src/index.ts`.

6. **TypeScript strict mode:** Both backend and frontend have `strict: false`. Do not enable without extensive testing as the codebase relies on loose type checking.

---

## 13. Quick Reference — File-to-Concern Map

| Concern | File(s) |
|---------|---------|
| Auth (JWT + CSRF) | `backend/src/middleware/auth.ts` |
| API client | `frontend/src/utils/api.ts` |
| Auth state | `frontend/src/stores/authStore.ts` |
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

---

## 14. External Integrations

| Service | Purpose | Key Files |
|---------|---------|-----------|
| **Stripe** | Subscription billing, payments | `backend/src/routes/payments.ts`, `backend/src/config/stripe.ts` |
| **Companies House** | UK company lookup | `backend/src/services/companiesHouse.ts` |
| **SMTP (Nodemailer)** | Email delivery | `backend/src/services/emailService.ts` |
| **Redis** | Caching, session storage | `backend/src/config/redis.ts` |
| **PDFKit** | PDF generation | `backend/src/services/pdfGenerator.ts` |

---

## 15. Development Workflow

### Adding a new feature
1. Update Prisma schema if needed
2. Run `npm run db:generate` and `npm run db:migrate`
3. Add backend route in `backend/src/routes/`
4. Add frontend page/component in `frontend/src/`
5. Update shared types in `shared/src/index.ts` if needed
6. Build shared: `npm run build:shared`
7. Test locally with `npm run dev:backend` and `npm run dev:frontend`

### Before committing
1. Run `npm run build` to ensure everything compiles
2. Check for TypeScript errors (despite `strict: false`)
3. Test critical paths (auth, proposal creation, PDF generation)

---

*Built with ❤️ by Capstone*
