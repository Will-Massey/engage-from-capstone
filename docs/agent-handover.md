# Engage — Build Handover Prompt (for an autonomous coding agent)

You are taking over active development of **Engage by Capstone**, a commercial
multi-tenant SaaS for UK accountancy practices (proposals, e-signing, pricing,
AML, Xero/QuickBooks/Revolut/Stripe, AI copilot). You are expected to work
autonomously with minimal check-ins. Read this whole document before writing
any code, then read `docs/world-class-plan.md` and `docs/audits/2026-07-07-*.md`
in this repo — they are your roadmap and evidence base.

---

## 1. System facts (do not rediscover these — they are verified)

- **Repo:** `Will-Massey/engage-from-capstone`, default branch `master`.
  npm-workspaces monorepo: `backend/` (Express + Prisma + Postgres),
  `frontend/` (React 18 + Vite + zustand + Tailwind), `shared/` (canonical
  pricing engine + shared types), `e2e-tests/` (Playwright),
  `workers/engage-proxy` (Cloudflare Worker).
- **Production topology:** Cloudflare Worker `engage-proxy` routes
  `capstonesoftware.co.uk/engage*` → Render (`engage-backend` web service
  `srv-d6qkjlua2pns73a2r1fg`, `engage-frontend` static
  `srv-d6qkjbma2pns73a2qod0`) → Neon Postgres (project
  `purple-scene-01932805`). All API traffic is SAME-ORIGIN through the worker.
- **Deploys:** `autoDeploy` is OFF on Render. The ONLY deploy path is the
  `Deploy to Render` job in `.github/workflows/ci-cd.yml`, which runs on
  master only after lint + typecheck + unit tests + full Playwright e2e are
  green, takes a pre-deploy Neon backup branch, deploys backend then frontend
  via the Render API, and health-checks. Branch protection on master requires
  the three CI checks. Railway/Vercel/GHCR/Docker configs in the repo are
  vestigial — ignore them (a failing non-required "Vercel" PR check is noise).
- **Migrations** run at container boot via `backend/start-prod.mjs`
  (fail-closed). Every migration must be additive/idempotent-safe.
- **Prod env var names** (values in Render dashboard; never commit values):

  ```text
  DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY,
  OAUTH_STATE_SECRET, FRONTEND_URL, NODE_ENV=production, SMTP_*, EMAIL_*,
  REVOLUT_*, XERO_REDIRECT_URI, XAI_MODEL, XAI_API_KEY,
  COMPANIES_HOUSE_API_KEY, SUPERADMIN_*, E2E_BYPASS_SECRET, AML_WEBHOOK_SECRET
  NOT yet set (user actions): SENTRY_DSN, STRIPE_*
  GitHub Actions secrets: RENDER_API_KEY, RENDER_BACKEND_SERVICE_ID,
  RENDER_FRONTEND_SERVICE_ID, NEON_API_KEY, NEON_PROJECT_ID
  ```

## 2. Working agreement (non-negotiable)

1. **Never push to master.** Branch (`w1/<topic>` or `fix/<topic>`) → PR →
   CI green → merge. Merging deploys to production.
2. **Every fix ships with a test** that would have caught the bug. Every
   refactor is behavior-preserving and proves it (see §5 verification
   recipes). No drive-by refactors inside fix PRs.
3. **Match existing idioms**: zod for input validation, `asyncHandler` +
   `ApiError` for routes, `authenticate` + `authorize(...)` middleware,
   tenant scoping via `where: { id, tenantId: req.tenantId }` on every lookup,
   ESM imports with `.js` extensions in backend, prettier + eslint clean
   (`npm run format:check` and `npm run lint` are CI-gated at max-warnings 0).
4. **Money rules:** all pricing math goes through
   `shared/src/pricingEngine.ts` (`calculateLineItem`, `roundMoney`,
   `vatAmountFor`, `annualEquivalentFor`/`monthlyEquivalentFor` with explicit
   `oneTime` semantics). Persisted money is whole pence (2dp floats). The
   invariant `grossTotal === lineTotal + vatAmount` must hold EXACTLY on
   stored values (tests exist: `backend/src/utils/__tests__/proposalPricing.test.ts`).
5. **Registration order is load-bearing** in `backend/src/index.ts` →
   `backend/src/app/*.ts` (middleware/mount order) and in the route barrels
   (`routes/proposals.ts`, `routes/proposals-share.ts`, `routes/tenants.ts`):
   static paths mount before parameterized (`/:id`) routes. Never reorder.
6. Commit messages: conventional-commits style with a body explaining WHY;
   include `Co-Authored-By` for your agent identity.

## 3. Commands that matter

```bash
npm ci                                  # root, installs all workspaces
npm run build:shared                    # ALWAYS before backend/frontend builds
npm run build:backend && npm run build:frontend
npm run typecheck && npm run lint && npm run format:check   # all workspaces
cd backend && npm test                  # jest; shared/src tests run here too
cd frontend && npx vitest run
```

**Local e2e stack (macOS dev box has native Postgres+Redis):**

```bash
cd backend
export DATABASE_URL=postgresql://capstone@localhost:5432/engage_e2e
npx prisma migrate deploy && npx tsx prisma/seed-enhanced.ts
# build all three, frontend with: VITE_APP_BASE=/ VITE_API_URL=/api
# run backend: DATABASE_URL=... REDIS_URL=redis://localhost:6379 \
#   JWT_SECRET=<32+ chars> NODE_ENV=development EMAIL_DEV_LOG=true PORT=3001 npm start
# run frontend: cd frontend && npx vite preview --port 5173
cd e2e-tests
TEST_USER_EMAIL=admin@demo.practice TEST_USER_PASSWORD='DemoPass123!' \
  npx playwright test --project=chromium                       # core suite
  npx playwright test --config=playwright.build.config.ts --project=chromium  # smoke suite
```

Seeded admin is "Sarah Johnson" (admin@demo.practice). Kill stale servers on
:3001/:5173 first. AI (Clara) specs auto-skip without XAI_API_KEY.

**Render production-simulation boot (run before merging anything that touches
boot/middleware/env):**

```bash
# clean clone; NODE_ENV=production npm ci && npm run build:shared && npm run build:backend
# then boot dist/index.js with NODE_ENV=production + required env (JWT_SECRET,
# JWT_REFRESH_SECRET, ENCRYPTION_KEY, OAUTH_STATE_SECRET all 32+ chars) and probe:
# /ping→200 JSON · GET /api/auth/me→401 JSON · /api/nonexistent→404 fast ·
# POST /api/proposal-templates (no CSRF)→403 · evil-Origin GET→blocked
```

This matrix catches middleware-order and env regressions that CI cannot
(CI runs NODE_ENV=development).

## 4. Landmines (all of these caused real production incidents this week)

- **Never load dotenv files in production.** `.env.development` is committed;
  the guard in `backend/src/index.ts` (`NODE_ENV !== 'production'`) must stay.
  A leaked `REDIS_URL` from that file once hung every rate-limited request.
- **Never run compilers/generators in npm `postinstall`** — Render installs
  with NODE_ENV=production and it breaks in ways CI can't see.
- **Redis must fail open**: `rateLimitStore` uses `disableOfflineQueue` +
  `passOnStoreError`; `config/redis.ts` has no localhost fallback. Keep it so.
- **CORS**: requests WITHOUT an Origin header are same-origin/not-CORS —
  always allowed. Browsers omit Origin on same-origin GETs; all app traffic is
  same-origin behind the worker. Don't "harden" this back.
- **The worker** (`workers/engage-proxy`) is deployed manually via
  `wrangler deploy` (user-run). If `/engage/api/*` ever returns HTML, the
  worker routes are detached — that's the signature.
- **CI health check hits `/ping` through Cloudflare** — a 200 can be the SPA
  fallback, not the API. Trust JSON bodies, not status codes.
- **Another human session sometimes pushes to master as admin** (bypasses
  branch protection). If a PR's format-check fails on a file you didn't touch,
  merge master into your branch and `npx prettier --write` the offender.
- Prettier also formats **markdown** — run it on docs before committing.

## 5. Verification recipes by change type

| Change           | Required proof before merge                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| Route/middleware | unit/supertest + local e2e core suite + prod-sim probe matrix                                    |
| Pricing/money    | invariant tests extended; exact-identity (no toBeCloseTo)                                        |
| Schema/migration | apply to local `engage_e2e` twice (idempotent); additive only                                    |
| Refactor/split   | tsc + full tests + byte-identical extraction diff + (routes) method/path sequence diff vs master |
| Frontend         | tsc + vitest + lint + production build with `VITE_APP_BASE=/ VITE_API_URL=/api`                  |
| Boot/env         | prod-sim boot matrix (§3)                                                                        |
| Deploy pipeline  | never test on prod; use the CI run itself as the gate                                            |

## 6. State of play (2026-07-07 afternoon)

**Done and deployed:** P0-P2 (see git history + memory docs), pricing
consolidation, exact-pence money storage (Stage 0+0.5), `ApiResponse<T>`
envelope on the frontend api client, all six god-files split
(proposals/proposals-share/tenants routes, backend bootstrap,
ProposalBuilder, ProposalDetail), branch protection, CI-gated deploys with
Neon pre-deploy backups.

**Possibly in flight — CHECK OPEN PRs FIRST:** a security hardening batch
(`w1/security-hardening-batch`: role gates M1, HTML-escape M2, accept-route
validation M3, diagnostics-route removal L1, timing-safe compare L2, generic
errors L3) and an ops hardening batch (`w1/ops-hardening-batch`: composite
indexes, shared PrismaClient in health.ts, SIGTERM drain, job
failure→Sentry + `/api/status` job health, TOUCHPOINT_WEBHOOK_URL precedence
fix, single-UPDATE renewal backfill, immutable asset cache headers). If these
PRs exist, review/merge them before starting overlapping work; if not,
implement them from `docs/audits/2026-07-07-*.md` exactly as specced there.

**Blocked on the human (do not attempt):** setting SENTRY*DSN + STRIPE*\* env
vars in Render; rotating XAI_API_KEY + COMPANIES_HOUSE_API_KEY (leaked in git
history); external uptime-monitor signup; LEGAL_VERSION sign-off;
`wrangler deploy`.

## 7. Your backlog, in order (specs in the plan + audits)

1. **Money-path tests** (audit top-7): Revolut webhook signature + fulfilment
   idempotency; `lib/revolut/splits.ts` fee-bps math; supertest for
   `/view/:token/payment/setup|skip|status`; Stripe platform webhook →
   subscription mutations; `middleware/auth.ts` supertest; promote
   `backend/tests/smoke/*` into the default jest run (remove
   `--testPathIgnorePatterns=/smoke/`) and extend the cross-tenant isolation
   matrix. Also add `collectCoverageFrom: ['src/**/*.ts']` to
   `backend/jest.config.cjs` (coverage is currently lying).
2. **Replace the tautological frontend test**: `api.csrf.test.ts` asserts on
   its own inline copy — rewrite against the real `utils/api.ts` axios
   instance (msw or axios-mock-adapter): 401→single-refresh→replay queue,
   refresh-fail→logout, CSRF header on mutations.
3. **e2e money-path spec**: sign → payment (mock provider via `page.route`)
   → paid state → split recorded. Then decline flow, approval reject +
   role-denial, share-token expiry.
4. **Frontend performance**: route-level `lazy()` in `App.tsx` — public pages
   first (`PublicProposalView`, `ClientPortal`, `AmlOnboarding` must not
   download the staff app), then builder cluster, settings/legal, analytics.
   Budget: public signing page < 150 kB gzip JS. Verify with the vite build
   output in the PR description.
5. **Worker edge caching**: Cache API on `/engage/assets/*` + immutable
   Cache-Control; 60s TTL on index.html. (Deploy is user-run — prepare the PR
   and ask.)
6. **e2e coverage for AML, GDPR export/close, Xero mock-connect, tenant
   signup→first proposal** (audit items 12, 13, 18, 20).
7. **`any` burn-down**: pass `T` through `apiClient.get<T>()` module-by-module
   (~289 annotations); no `any` in new code.
8. Remaining plan NEXT tier: email verification (when public reg turns on),
   AML HMAC, CSRF session-binding, backup restore drill doc, deploy health
   gate that asserts JSON from `/api/auth/me` (not just 200s), analytics
   dashboard memoization, pg_trgm search indexes when client counts warrant.

**Definition of done, every item:** tests written and passing locally, CI
fully green, merged via PR, deploy verified against production with a probe
relevant to the change, and a one-line entry appended to
`docs/world-class-plan.md` flipping the item to ✅.

## 8. If something breaks in production

1. `curl https://capstonesoftware.co.uk/engage/ping` — JSON = app up;
   HTML = worker routing broken (user must `wrangler deploy`).
2. Render logs API: `GET /v1/logs?ownerId=tea-d6m1tuchg0os73b285p0&resource=<srv-id>`
   (needs RENDER_API_KEY). Boot log line "Rate limiting backed by Redis"
   appearing = phantom REDIS_URL regression.
3. Rollback = redeploy previous commit via the Render API or revert-merge the
   offending PR; DB rollback = restore the newest `pre-deploy-*` Neon branch.
4. The runbook: `docs/` rollback runbook + `docs/audits/` for known weak spots.
