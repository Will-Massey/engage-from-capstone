# Engage — World-Class Readiness Plan

_Drafted 2026-07-07. Working definition of "world class" for a commercial
multi-tenant UK accountancy SaaS: a paying accountant can rely on it daily —
money is always right, the app is never mysteriously down, a stranger can sign
up → propose → get signed → get paid without a founder in the loop, and every
change ships through gates that would have caught our last five incidents._

Status keys: ✅ done · 🔶 partial · ⬜ open. Tiers: **NOW** (blocks charging
customers) · **NEXT** (blocks scale/trust) · **LATER** (excellence).
Every item lists its **test/verification gate** — nothing counts as done
without one.

---

## Pillar 0 — Already banked (context)

✅ CI: lint, typecheck, unit (172), e2e green + branch protection; single
CI-gated deploy path; pre-deploy Neon backups; rollback runbook.
✅ Money: single canonical pricing engine; exact-pence storage (Stage 0+0.5);
invariant tests; payments already int-pence.
✅ Security base: tenant-scoped JWT auth, 2FA, lockout, CSRF, CSP, webhook
signatures, GDPR export/close, fail-open rate limiting.
✅ Structure: 5 god-files split (~9k lines), route order proven.

---

## Pillar 1 — Correctness & Testing

| #   | Item                                                                                                                                                       | Why                                                                                    | Test gate                                                                                                                                          | Effort      | Tier  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----- |
| 1.1 | ✅ **Money-path e2e**: create → send → public view → sign → (stubbed) payment → split records                                                              | The revenue path has unit tests per hop but no single end-to-end proof                 | New Playwright spec `money-path.spec.ts` in the build suite; asserts stored totals = displayed = charged pence                                     | M           | NOW   |
| 1.2 | ⬜ **Frontend test foundation**: only 18 vitest tests exist for ~200 components                                                                            | Every UI regression currently rides on 8 smoke specs                                   | Vitest + testing-library for: auth store, api interceptors (CSRF/refresh), ProposalBuilderContext actions (the 97-field core), public signing page | M           | NOW   |
| 1.3 | 🔶 **AuthZ regression suite**: table-driven test hitting every mutating route as wrong-role and wrong-tenant                                               | The 2 worst historical bugs were missing authz/scoping; today only samples are covered | One jest suite enumerating the route table; CI-gated                                                                                               | M           | NOW   |
| 1.4 | ⬜ e2e for approval workflow (submit → approve/reject roles), renewals, agency sub-accounts, GDPR close-account                                            | Multi-user flows are untested beyond units                                             | Playwright specs, seeded multi-user tenant                                                                                                         | M           | NEXT  |
| 1.5 | ⬜ Backend coverage floor: identify 15 worst business-logic files, bring services/ to a measured floor; add coverage ratchet to CI (fail if below current) | Prevent silent decay                                                                   | Codecov threshold or jest `coverageThreshold` ratchet                                                                                              | M           | NEXT  |
| 1.6 | 🔶 `any` burn-down (289): type api call sites module-by-module with `ApiResponse<T>`                                                                       | Typed seams catch integration drift at compile time                                    | tsc strict; count tracked in CI log                                                                                                                | M (rolling) | NEXT  |
| 1.7 | ⬜ Contract tests: shared DTO types generated or asserted against real API responses (zod `.parse` on the frontend for the top 10 endpoints)               | Backend/DTO drift currently surfaces only at runtime                                   | Runtime zod guards + unit tests                                                                                                                    | M           | LATER |
| 1.8 | ⬜ Flake policy: quarantine tag + retry budget; ban `Date.now`-coupled assertions                                                                          | e2e trust erodes fast once flakes appear                                               | CI job fails on new quarantine entries                                                                                                             | S           | LATER |

_2026-07-07 (w1/money-path-tests): Revolut webhook sig + fulfilment idempotency, split fee-bps/idempotency, Stripe webhook mutations, auth middleware, public payment routes supertest, smoke suite promoted into default jest run with CI seed + honest `collectCoverageFrom`._

_2026-07-07 (w1/e2e-compliance-journeys): `compliance-journeys.spec.ts` in build suite — AML portal→stub check→webhook clear, GDPR export + close-account (disposable tenants), Xero `mock-connect` (no OAuth in CI), signup UI→first-proposal wizard; backend `POST /api/xero/mock-connect|mock-disconnect` gated by `X-Test-Mode`._

## Pillar 2 — Security (remaining)

| #   | Item                                                                                                                                                          | Why                                                   | Test gate                                                     | Effort | Tier  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------- | ------ | ----- |
| 2.1 | ⬜ **Rotate `XAI_API_KEY` + `COMPANIES_HOUSE_API_KEY`** (in git history) — _user action_                                                                      | Leaked-in-repo keys                                   | Old keys revoked → e2e AI probe still green with new keys     | S      | NOW   |
| 2.2 | ⬜ Email verification enforcement (public registration is live in prod topology)                                                                              | Spam tenants, deliverability damage                   | e2e: register → blocked until verify → verify → in            | M      | NOW   |
| 2.3 | ⬜ Share/portal token audit: entropy, expiry, per-token rate limit, no enumeration                                                                            | Public money documents live behind these              | Unit tests on token service + e2e brute probe returns 404/429 | S–M    | NOW   |
| 2.4 | ⬜ AML webhook HMAC (currently shared-secret only)                                                                                                            | Compliance-grade inbound data                         | Signature unit tests + rejected-tamper e2e                    | S      | NEXT  |
| 2.5 | ⬜ CSRF token session-binding                                                                                                                                 | Defense-in-depth (custom-header+CORS already gate it) | csrfStore unit tests                                          | S      | NEXT  |
| 2.6 | ⬜ Secrets hygiene: purge committed dev keys from `.env.development`, add gitleaks to CI (Secret Detection job exists — verify it scans history/PRs properly) | Prevent recurrence of the leak class                  | CI secret scan on every PR                                    | S      | NEXT  |
| 2.7 | ⬜ Pen-test pass (external or scripted OWASP) before first paying tenant                                                                                      | Unknown unknowns                                      | Findings triaged to zero criticals                            | L      | LATER |

## Pillar 3 — Reliability & Operations

| #   | Item                                                                                                                                                               | Why                                                                | Test gate                                                  | Effort | Tier  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------- | ------ | ----- |
| 3.1 | ⬜ **Error monitoring actually on**: set `SENTRY_DSN` in prod (backend wiring exists but is a no-op today); add frontend Sentry with release tagging + source maps | We were blind through every incident this week                     | Deliberate test error appears in Sentry from both tiers    | S      | NOW   |
| 3.2 | ⬜ **Uptime monitoring + alerting** on `/engage/ping` + `/api/status` (UptimeRobot/Better Stack), alert to email/phone                                             | Prod was down ~12h before anyone noticed                           | Kill staging container → alert fires                       | S      | NOW   |
| 3.3 | ⬜ Job observability: the 4 locked interval jobs log failures but alert no one                                                                                     | Silent chase/renewal/email failures = silent revenue loss          | Job failure increments Sentry event; test via forced throw | S      | NEXT  |
| 3.4 | ⬜ Backup restore drill: document + actually restore a Neon `pre-deploy-*` branch to a scratch project once                                                        | Untested backups aren't backups                                    | Runbook executed, timed, committed                         | S      | NEXT  |
| 3.5 | ⬜ Deploy health gate: post-deploy step probes the real app (not just `/health` 200 — it lied to us during the worker outage); auto-rollback on failure            | The CI "Health check" passed while prod served index.html for APIs | Deploy job fails on synthetic bad deploy in a test         | M      | NEXT  |
| 3.6 | ⬜ Scale-out readiness: Render instance =1 today; verify advisory-lock jobs + memory rate limits under 2 instances (Redis decision point), document the knob       | First traffic spike shouldn't be novel                             | Staging with 2 instances passes e2e                        | M      | LATER |
| 3.7 | ⬜ Staging environment (Render preview or second service pair + Neon branch) so migrations/deploys rehearse before prod                                            | We currently rehearse in prod                                      | Staging deploy in CI before prod job                       | M      | LATER |

## Pillar 4 — Performance

| #   | Item                                                                                                                                         | Why                                                        | Test gate                                                                      | Effort | Tier  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------ | ------ | ----- |
| 4.1 | ⬜ DB index pass: composite indexes for tenant+status list queries, clients search, analytics aggregates (audit to confirm exact set)        | Neon + growing tenants; avoid the first slow-page incident | `EXPLAIN` before/after in the PR; query time assertions in an integration test | M      | NEXT  |
| 4.2 | ✅ Frontend code-splitting: route-level `lazy()` (bundle currently warns on chunk size; public signing page should not download the builder) | First-load and public-page speed = conversion              | Bundle report in CI; public page JS budget < 300KB                             | M      | NEXT  |
| 4.3 | ⬜ Pagination/`take` guards on unbounded tenant-scale queries                                                                                | One big tenant shouldn't OOM a request                     | Unit tests on limits                                                           | S      | NEXT  |
| 4.4 | ✅ CF worker edge cache on `/engage/assets/*` (immutable) + SPA `index.html` (60s); ⬜ memory cache on hot API paths                         | Cheap latency wins, fewer DB hits                          | Worker cache-policy unit tests; wrangler deploy to activate edge cache         | S–M    | LATER |
| 4.5 | ⬜ Cold-start UX: Render starter sleeps; either keep-alive ping or a polished wake screen (transient toast exists)                           | First impression for returning users                       | Manual + synthetic check                                                       | S      | LATER |

## Pillar 5 — Product & Commercial

| #   | Item                                                                                                                                                                                                             | Why                                                  | Test gate                                                              | Effort | Tier       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- | ------ | ---------- |
| 5.1 | ⬜ **Stripe live in prod**: `STRIPE_SECRET_KEY`/`PUBLISHABLE`/price IDs absent from prod env → subscribe button can't render; end-to-end platform billing test in Stripe test mode; webhook → tier flip verified | You cannot take money today                          | e2e (test mode): subscribe → webhook → tier upgraded → invoice visible | M      | NOW        |
| 5.2 | ⬜ Trial → paywall journey: expiry states, grace, dunning emails                                                                                                                                                 | The 7-day trial must convert without support tickets | e2e with clock-shifted tenant                                          | M      | NOW        |
| 5.3 | 🔶 Onboarding polish: first-run wizard → first proposal in <10 min without docs; empty states everywhere a new tenant lands                                                                                      | Activation is the business                           | Scripted new-tenant walkthrough (e2e uat-style spec)                   | M      | NEXT       |
| 5.4 | ⬜ Transactional email audit: every template (send, sign, receipt, chase, trial) rendered + link-checked; SPF/DKIM/DMARC verified for the sending domain                                                         | Emails are half the product for proposals            | Snapshot tests per template + deliverability check                     | M      | NEXT       |
| 5.5 | ⬜ PDF quality pass: fonts, page-breaks, long-service names, discounts (bug fixed but no visual regression net), branding                                                                                        | The PDF is the artifact clients keep                 | PDF snapshot tests (pixel or structural)                               | M      | NEXT       |
| 5.6 | ⬜ LEGAL_VERSION sign-off + terms flow (open item from readiness report)                                                                                                                                         | Contractual soundness of e-sign                      | Legal review recorded; version pinned in audit trail                   | ?      | NOW (user) |
| 5.7 | ⬜ Billing/ops docs: pricing page accuracy, cancellation, VAT invoices (Stripe Tax work from other session ties in)                                                                                              | Trust surface                                        | Manual checklist                                                       | S      | NEXT       |
| 5.8 | ⬜ Accessibility pass on public pages (signing/portal): keyboard, contrast, screen-reader labels                                                                                                                 | Clients of clients use these; also a legal nicety    | axe-core in e2e for public pages                                       | M      | LATER      |

## Pillar 6 — Code Quality (rolling)

| #   | Item                                                                                     | Test gate                            | Tier      |
| --- | ---------------------------------------------------------------------------------------- | ------------------------------------ | --------- |
| 6.1 | 🔶 ProposalDetail.tsx split (2255) — same context pattern                                | tsc/tests/build + e2e                | NEXT      |
| 6.2 | ⬜ Hook-extraction inside ProposalBuilderContext (2365) — deliberate, one hook at a time | vitest on each extracted hook        | LATER     |
| 6.3 | ⬜ Stage-1 pence columns (parked; design doc in repo) — revisit after paying customers   | migration rehearsal on staging (3.7) | LATER     |
| 6.4 | ⬜ Dead-surface sweep: vestigial Vercel check on PRs, unused routes/flags                | CI green minus noise                 | S / LATER |

---

## Sequencing (proposed)

**Wave 1 — "can take money, can see problems" (NOW tier):**
3.1 Sentry on → 3.2 uptime alerts → 5.1 Stripe live+tested → 2.1 key rotation
(user) → 1.1 money-path e2e → 2.2 email verification → 2.3 token audit →
1.3 authz suite → 1.2 frontend test foundation → 5.2 trial journey → 5.6 legal (user).

**Wave 2 — "trustworthy at small scale" (NEXT tier):** 3.3–3.5, 4.1–4.3,
1.4–1.6, 2.4–2.6, 5.3–5.5, 5.7, 6.1.

**Wave 3 — "excellence" (LATER tier):** the rest, re-prioritized against
real customer feedback.

_Three audits (test-coverage, security, perf/ops) are queued to verify the
🔶/⬜ assumptions in code and will amend this doc with file:line evidence._
