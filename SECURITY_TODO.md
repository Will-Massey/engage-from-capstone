# Engage by Capstone — Security Audit & Remediation TODO

**Audit date:** 4 July 2026  
**Scope:** `engage-from-capstone` backend + frontend + Render production  
**Status:** P1 + P2 implemented 4 Jul 2026 — P0 still open

---

## Executive summary

Engage has **strong foundations**: httpOnly cookie auth, CSRF on protected routes, Helmet on API, layered rate limits, Revolut/Stripe webhook verification, tenant-scoped uploads, AES-256-GCM for bank details and OAuth tokens, login lockout, and forensic e-sign fields.

**Top risks today:**

1. **Unauthenticated webhooks** (`/api/webhooks/email-events`) can forge email events and mutate proposal data  
2. **Client portal API leaks `shareToken`** for every proposal — portal link becomes master key to all proposal sign URLs  
3. **Production env validation** (`config/env.ts`) is defined but **never imported** at startup  
4. **No CSP on the SPA** — XSS would have full impact on staff sessions  
5. **`validUntil` not enforced** on public sign API (UI-only check)  
6. **E2E test header bypasses all rate limits** in production if sent

---

## Already working well (keep)

- [x] JWT in httpOnly cookies; refresh flow; tenant mismatch rejection on `X-Tenant-Id`
- [x] CSRF double-submit on `/api` (except documented public prefixes)
- [x] Revolut billing webhook: raw body + HMAC + timestamp window
- [x] Stripe webhook: `constructEvent` with signing secret
- [x] UK bank details encrypted at rest; only last-4 exposed
- [x] Upload path jail + tenant auth on `GET /api/uploads/signatures/:tenantId/:filename`
- [x] Public proposal view renders terms/cover as text (not raw HTML)
- [x] Share tokens: UUID-derived 32-char hex; expiry + `publicAccessEnabled`
- [x] Login lockout (5 failures / 30 min) + failed-login rate limit
- [x] Prisma parameterised queries — no user-controlled raw SQL found
- [x] Superadmin outbound HMAC (API key removed from Render Jul 2026)

---

## P0 — Critical (this week)

| # | Item | Severity | Location | Fix |
|---|------|----------|----------|-----|
| 1 | **Authenticate email-events webhook** | Critical | `backend/src/routes/webhooks/email-events.ts` | Require `EMAIL_WEBHOOK_SECRET` (Bearer or `X-Webhook-Secret`); reject unsigned in production; set secret on Render |
| 2 | **Stop exposing `shareToken` in client portal** | High | `backend/src/routes/proposals-share.ts` ~1337 | Remove `shareToken` from portal response; use portal-scoped opaque action URLs or server-side redirect to sign flow |
| 3 | **Enforce production env at startup** | High | `backend/src/config/env.ts`, `index.ts` | `import './config/env.js'` immediately after dotenv; fail boot if `ENCRYPTION_KEY` / `OAUTH_STATE_SECRET` missing in prod |
| 4 | **Enforce `validUntil` on sign/decline API** | High | `proposalSharingService.ts` / `proposals-share.ts` | Reject sign/decline when `new Date() > proposal.validUntil` (not just share-token expiry) |
| 5 | **Require `AML_WEBHOOK_SECRET` in production** | High | `backend/src/routes/aml.ts` | Return 503 if secret unset when `NODE_ENV=production` |
| 6 | **Disable E2E rate-limit bypass in production** | High | `backend/src/utils/securityFlags.ts` | `isE2eTestRequest()` must return false when `isProduction` regardless of `X-Test-Mode` header |

---

## P1 — High (next sprint)

| # | Item | Location | Fix | Done |
|---|------|----------|-----|------|
| 7 | **Deploy CSP on SPA** | `frontend/src/plugins/injectBuildTime.ts` | Production build injects CSP meta | [x] |
| 8 | **Sanitize HTML in Settings template preview** | `frontend/src/pages/Settings.tsx` | DOMPurify strict allowlist | [x] |
| 9 | **Verify payment status server-side after Revolut redirect** | `ProposalView.tsx` | `GET /payment-status` before success UI | [x] |
| 10 | **Harden `POST /payment/skip`** | `proposals-share.ts` | `acknowledged: true`, paymentRequired check, audit log, email notify | [x] |
| 11 | **Harden admin migrate endpoint** | `backend/src/routes/admin.ts` | `execFile` (no shell); generic errors; ops audit | [x] |
| 12 | **Separate refresh-token secret** | `middleware/auth.ts` | `JWT_REFRESH_SECRET` + `purpose: 'refresh'` — **set on Render** | [x] |
| 13 | **CSRF on `/api/auth/refresh`** | `middleware/auth.ts` | Removed blanket `/auth` CSRF skip | [x] |
| 14 | **Timing-safe secret comparison** | `utils/secureCompare.ts` | admin, setup, health, aml, revolut, public seed | [x] |
| 15 | **Bump `axios` to ≥1.7.4** | `frontend/package.json` | axios ^1.7.9 | [x] |
| 16 | **Reduce health endpoint data leakage** | `backend/src/routes/health.ts` | `{ status, timestamp }` only on public routes | [x] |
| 17 | **Lock down setup/demo endpoints** | `setup.ts`, `env.ts` | `ENABLE_SETUP_ENDPOINT` default false; `SETUP_SECRET_KEY` required in prod | [x] |

---

## P2 — Medium (hardening)

| # | Item | Location | Fix | Done |
|---|------|----------|-----|------|
| 18 | Reduce PII in `localStorage` | `authStore.ts` | Empty persist slice; session from `/auth/me` | [x] |
| 19 | Proposal drafts in localStorage | `proposalBuilderDraft.ts` | `clearAllProposalDrafts()` on logout | [x] |
| 20 | CSRF token in sessionStorage | `frontend/src/utils/api.ts` | Prefer same-site cookie path; shorten CSRF lifetime | [ ] |
| 21 | Per-endpoint rate limits on sign/decline | `proposals-share.ts` | 5/hour per token+IP | [x] |
| 22 | Portal + AML upload rate limits | `index.ts` | `/proposals/portal` + onboarding POST limiters | [x] |
| 23 | CORS: restrict no-`Origin` requests | `index.ts` | Webhooks + health only without Origin | [x] |
| 24 | Remove hardcoded dev IPs from CORS | `index.ts` | `CORS_EXTRA_ORIGINS` env var | [x] |
| 25 | AML upload DoS | `fileStorage.ts` | Magic-byte validation; rate limit on POST | [x] |
| 26 | Signature PNG validation | `fileStorage.ts` | PNG magic bytes before write | [x] |
| 27 | 2FA setup response | `routes/auth.ts` | No plaintext TOTP secret in JSON (QR only + backup codes) | [x] |
| 28 | Zod validation error leakage | `middleware/errorHandler.ts` | Generic client message | [x] |
| 29 | Admin error responses | `routes/admin.ts` | No stdout/stderr in JSON | [x] |
| 30 | Consolidate ops secrets | Render env | Single break-glass key or documented rotation | [ ] ops |
| 31 | Audit log admin/setup usage | `utils/opsAudit.ts` | Log IP + action on admin/setup calls | [x] |
| 32 | Superadmin command poller | `lib/superadmin.ts` | Allowlist; no payload logging in prod | [x] |
| 33 | `rememberMe` checkbox | `Login.tsx`, `authCookies.ts` | 30-day refresh cookie when checked | [x] |
| 34 | Disable production source maps | `frontend/vite.config.ts` | `sourcemap: false` in production | [x] |
| 35 | Remove unused `VITE_STRIPE_PUBLIC_KEY` | `frontend/.env.production` | Removed | [x] |

---

## P3 — Low / hygiene

| # | Item | Fix |
|---|------|-----|
| 36 | `main.tsx` error path uses `innerHTML` | Use `textContent` |
| 37 | 404 responses include full `originalUrl` | Sanitise path in error handler |
| 38 | `/api/status` exposes `NODE_ENV` | Omit in production |
| 39 | SPA 404 JSON includes `publicPath` | Remove internal paths from client response |
| 40 | `automation/migrate-service-pricing` manual JWT verify | Use `authenticate` + `authorize` middleware |
| 41 | Login without tenantId — user enumeration | Require tenant subdomain; generic error messages |
| 42 | Public sign CAPTCHA (optional) | Cloudflare Turnstile on sign/decline for high-value proposals |
| 43 | Signer email verification (optional) | Match `signerEmail` to client contact or magic-link OTP |
| 44 | Second signatory terms flow | Ensure engagement/terms acceptance reflected in audit trail |
| 45 | `diagnostics` routes unmounted | Delete or gate behind auth if re-enabled |
| 46 | `$executeRawUnsafe` in seed handler | Move to migration script only |
| 47 | Upgrade `react-signature-canvas` | Review canvas data handling; pin version |
| 48 | Dependabot / Renovate | Automate dependency PRs for frontend + backend |
| 49 | Security headers on static frontend | Add `X-Content-Type-Options`, `Referrer-Policy` via Cloudflare worker |
| 50 | Render Starter + 10 GB disk | Persistent uploads/signatures at `/var/data` (manual dashboard) |

---

## Infrastructure & operations

| # | Item | Status | Action |
|---|------|--------|--------|
| 51 | `SUPERADMIN_API_KEY` removed from Render | Done Jul 2026 | — |
| 52 | `SUPERADMIN_WEBHOOK_SECRET` on Render | Done Jul 2026 | Verify sync after redeploy: `node scripts/verify-superadmin-integration.mjs` |
| 53 | `ENCRYPTION_KEY` on Render | Verify | Must be ≥32 chars; required once env.ts wired |
| 54 | `OAUTH_STATE_SECRET` on Render | Verify | Required for Xero/OAuth flows |
| 55 | `EMAIL_WEBHOOK_SECRET` on Render | Missing | Generate + set for email-events webhook |
| 56 | `AML_WEBHOOK_SECRET` on Render | Verify | Required in prod after code fix |
| 57 | `REVOLUT_WEBHOOK_SECRET` on Render | Verify | Live mode smoke |
| 58 | `ADMIN_SECRET_KEY` rotation | Periodic | Rotate quarterly; never commit |
| 59 | JWT secret rotation plan | Document | Rotation procedure without mass logout |
| 60 | Render access control | Review | 2FA on Render account; least-privilege API key |

---

## Compliance & UK context (accountancy platform)

| # | Item | Notes |
|---|------|-------|
| 61 | ICO / privacy page | P3 backlog in `PREMIER_SERVICE_TODO.md` — AI disclosure |
| 62 | E-sign forensics | Strong — document hash, consent text, IP geo; keep audit export path |
| 63 | Payment collection legal | Terms v`ENGAGE-PCT-2026-001`, client auth v`ENGAGE-CPA-2026-001` — ensure version pinned in API |
| 64 | AML document retention | Define retention period; secure deletion workflow |
| 65 | SOC2 audit export | `GET /api/auth/me/audit-export` exists — verify scope and access control |
| 66 | Trial / subscription data | Superadmin events for conversion — verify after Render sync |

---

## Verification checklist (run after each security batch)

```powershell
# Backend tests
cd backend && npm test

# Frontend typecheck
cd frontend && npm run build

# Production smoke (no rate-limit bypass in prod after fix #6)
cd e2e-tests
$env:FRONTEND_URL='https://capstonesoftware.co.uk/engage'
$env:API_URL='https://engage-backend-e1ue.onrender.com'
npx playwright test --config=playwright.build.config.ts --retries=0

# Superadmin integration
node scripts/verify-superadmin-integration.mjs

# Manual probes
curl -X POST https://engage-backend-e1ue.onrender.com/api/webhooks/email-events -H "Content-Type: application/json" -d "{\"event\":\"bounce\"}"
# Expect 401 after fix #1

curl https://engage-backend-e1ue.onrender.com/api/proposals/portal/INVALID
# Portal must not return shareTokens after fix #2
```

---

## Suggested implementation order

**Week 1 (P0):** #1 → #3 → #6 → #4 → #2 → #5  
**Week 2 (P1 security UX):** #7 → #8 → #9 → #10 → #14 → #15  
**Week 3 (P1 auth/admin):** #11 → #12 → #13 → #16 → #17  
**Ongoing (P2/P3):** Pick 2–3 items per sprint; track in `task_plan.md`

---

## Related docs

- `PREMIER_SERVICE_TODO.md` — product backlog  
- `COMMERCIAL_LAUNCH_CHECKLIST.md` — deploy checklist  
- `docs/PAYMENT_COLLECTION.md` — payment security model  
- `TODO_TOMORROW.md` — UAT + Xero (5 Jul 2026)