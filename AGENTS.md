# Engage by Capstone — Agent Guide

> **Purpose:** This document exists for AI coding agents. It summarises the project architecture, conventions, and workflows so you can be productive immediately.  
> **Last updated:** 2026-04-03

---

## 1. Project Overview

**Engage by Capstone** is a professional proposal-generation platform built for UK accountancy practices. It enables firms to create, share, and electronically sign compliant engagement letters and proposals in under five minutes. Key capabilities include:

- Multi-tenant architecture (one database, row-level tenant isolation)
- Role-based access control: `ADMIN`, `PARTNER`, `MANAGER`, `SENIOR`, `JUNIOR`
- UK-specific compliance: MTD ITSA assessment, Companies House lookup, VAT handling
- PDF generation, electronic signatures, and proposal activity tracking
- Stripe subscription billing integration

---

## 2. Technology Stack

| Layer | Tech |
|-------|------|
| **Monorepo tooling** | pnpm workspaces (`pnpm-workspace.yaml`) + Turbo (`turbo.json`) |
| **Backend** | Node.js 18+, Express.js, TypeScript, Prisma 5.22, PostgreSQL 14+ |
| **Frontend** | React 18, TypeScript, Vite 5, Tailwind CSS 3, Zustand 4 |
| **Shared code** | Plain TypeScript package (`shared/`) exposing enums, interfaces, and utilities |
| **Testing** | Jest (backend), Vitest (frontend) |
| **Caching** | Redis (via `ioredis` / `redis`) — optional but configured |
| **Package manager** | npm (root `package-lock.json` exists; `pnpm-workspace.yaml` is also present for pnpm users) |

---

## 3. Repository Layout

```
engage/
├── backend/               # Express API
│   ├── src/
│   │   ├── config/        # database, env, logger, redis, stripe
│   │   ├── data/          # seed data (e.g. UK accountancy services)
│   │   ├── errors/        # custom error classes
│   │   ├── middleware/    # auth, errorHandler, healthCheck, tenant-*
│   │   ├── routes/        # Express route modules
│   │   ├── scripts/       # one-off scripts (seedServices, startup)
│   │   ├── services/      # business logic (pdf, email, pricing, MTD ITSA, etc.)
│   │   ├── templates/     # email and document templates
│   │   ├── types/         # backend-specific TS types
│   │   └── utils/         # cache, encryption, logger helpers
│   ├── prisma/
│   │   └── schema.prisma  # full Prisma schema (616 lines)
│   └── tests/             # Jest tests (currently empty directory)
├── frontend/              # React SPA
│   ├── src/
│   │   ├── components/    # React components (grouped by feature + ui/ primitives)
│   │   ├── data/          # static data (e.g. defaultTerms)
│   │   ├── hooks/         # custom React hooks
│   │   ├── pages/         # route-level page components
│   │   ├── stores/        # Zustand stores (auth, theme)
│   │   ├── types/         # frontend-specific TS types
│   │   └── utils/         # helpers (api.ts is the main axios client)
│   └── public/            # static assets
├── shared/                # Cross-package types & utilities
│   └── src/
│       └── index.ts       # Enums, interfaces, validation, pricing engine, MTD ITSA calculator
├── docs/                  # Additional documentation
├── landing/               # Landing page assets (minimal)
└── scripts/               # Deployment and utility scripts
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
  4. Tenant extraction middleware (`extractTenant` from `tenant-simple.js`) on API routes
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
- Place frontend tests co-located (`*.test.tsx`) or in `frontend/src/__tests__/`.

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
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — min 32 chars
- `JWT_EXPIRES_IN` — e.g. `24h`
- `JWT_REFRESH_EXPIRES_IN` — e.g. `7d`
- `FRONTEND_URL` — CORS origin
- `REDIS_URL` — optional but recommended
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — email delivery
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — payments
- `COMPANIES_HOUSE_API_KEY` — UK company lookup

---

## 11. Common Pitfalls

1. **Import extensions in backend:** Always use `.js` in backend TypeScript imports (e.g. `from './auth.js'`). The TS compiler does not rewrite them because `module: "CommonJS"` is paired with `esModuleInterop`.
2. **Shared package must be built first:** Run `npm run build:shared` before building backend or frontend, otherwise path-alias resolution may fail.
3. **Prisma client regeneration:** After any schema change, run `npm run db:generate` before building or running.
4. **CSRF on public routes:** The backend skips CSRF for `/api/proposals/view/*`, `/api/payments/webhook`, and OAuth callbacks. If you add new webhook or public endpoints, add them to the `publicPaths` array in `backend/src/middleware/auth.ts`.
5. **CORS whitelisting:** Render and Vercel preview URLs are regex-matched. If deploying to a new domain, add it to `allowedOrigins` in `backend/src/index.ts`.

---

## 12. Quick Reference — File-to-Concern Map

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
