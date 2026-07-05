# Build Plan: Engage by Capstone
<!-- Token handoff file — update at every Render deploy checkpoint. Fresh sessions read THIS, not chat history. -->

## Goal
Become the **premier UK accountancy proposal platform** — see `PREMIER_SERVICE_STRATEGY.md` and `PREMIER_SERVICE_TODO.md`.

## Current Phase
Phase: **Premier Service — Payout UAT done** — `in_progress` (demo tenant payout enabled; sign → Revolut checkout PASS)

## Next Up
<!-- 3–5 bullets ONLY. Next fresh session starts here. Rewrite every checkpoint. -->
1. **Deploy P0 security** (code done 5 Jul, 137 tests pass): push + set `EMAIL_WEBHOOK_SECRET`, `AML_WEBHOOK_SECRET`, `E2E_BYPASS_SECRET` on Render — without the webhook secrets those two webhooks 503 in prod (intended); without `E2E_BYPASS_SECRET` prod smokes lose rate-limit bypass
2. **Revolut Business API:** Run `revolut-business-setup.mjs` + `wire-revolut-business-render.ps1` (OAuth cert from Revolut Business → Settings → APIs) — code + wire scripts ready; credentials not on disk yet
3. **Xero:** Render `XERO_*` env + Settings → Integrations connect smoke
4. ~~**P0 security code:** email-events webhook auth, portal shareToken leak, env.ts boot, validUntil, AML secret, E2E bypass~~ — all six implemented (`SECURITY_TODO.md`)

## Phases

### Phase 1–5: AI, UI, Clara surfaces
- **Status:** complete (see `AI_IMPLEMENTATION_PROGRESS.md`, deploy fdbc3e8)

### Phase 6: Premier Service — P0 Trust & Revenue
- Pricing integrity, e-sign forensics, billing go-live, production reliability
- **Status:** complete (code — 91 Jest tests pass)

### Phase 7: Premier Service — P1 Differentiators
- Clara wizard, MTD/regulatory fit, client journey, GTM copy
- **Status:** complete (code)

### Phase 8: Premier Service — P2 Scale (partial)
- Dashboard analytics, templates, CSV import, command palette, email webhook stub
- **Status:** partial — integrations + commercial expansion remain

### Phase 9: Deploy & verify
- Render, migration, live smoke, landing publish
- **Status:** in_progress

## Deploy Checkpoints

| # | Date (UTC) | Commit | Branch | Render services | Status | Notes |
|---|------------|--------|--------|-----------------|--------|-------|
| 1 | 2026-06-30 | fdbc3e8 | master | engage-backend, engage-frontend | live | UI dark/light + Clara surfaces |
| 2 | 2026-07-03 | 6372c68 | master | engage-backend, engage-frontend | live | sendit v3.5 — 7-day trial, backlog, schema/test fix, superadmin payment reporting; 123 tests pass; all endpoints 200 |
| 3 | 2026-07-04 | 6338cf2 | master | engage-backend, engage-frontend | live | sendit v4.0 — Revolut payout collection, tenant payout settings, legal terms, UI fixes; TS build fix in splits.ts |
| 4 | 2026-07-04 | 53f9d47 | master | engage-backend, engage-frontend | live | Analytics routes + win-loss normalise, regulatory mount, /2fa-setup, e2e auth hardening; prod smoke 11/11 |
| 5 | 2026-07-04 | 6686892 | master | engage-backend, engage-frontend | live | sendit v4 — P1/P2 security hardening (items 7–35); JWT_REFRESH_SECRET wired; `/health` + login 200 |

## Strategic docs (Jul 2026)
| Doc | Purpose |
|-----|---------|
| `PREMIER_SERVICE_STRATEGY.md` | Pricing research, SWOT, gap analysis |
| `PREMIER_SERVICE_TODO.md` | Canonical premier build list |

## Notes
- `/sendit` = push + hooks + checkpoint + `sendit.resume`
- Full todo detail lives in `PREMIER_SERVICE_TODO.md` — not duplicated here