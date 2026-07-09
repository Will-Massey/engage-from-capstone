# Build Plan: Engage by Capstone

<!-- Token handoff file — update at every Render deploy checkpoint. Fresh sessions read THIS, not chat history. -->

## Goal

Become the **premier UK accountancy proposal platform** — see `PREMIER_SERVICE_STRATEGY.md` and `PREMIER_SERVICE_TODO.md`.

## Current Phase

Phase: **Stripe Connect split payments** — `in_progress` (branch `feat/stripe-connect-split-payments`; Tasks 1–4 done)

## Next Up

<!-- 3–5 bullets ONLY. Next fresh session starts here. Rewrite every checkpoint. -->

1. **Task 5:** Rewrite payout settings + Stripe proposal checkout + collection gating (`payoutSettingsService`, `proposalPaymentStripe`, drop Revolut bank UX)
2. **Task 6–7:** Connect webhook `/api/webhooks/stripe-connect` + payout/onboard API routes
3. **Task 8–9:** Frontend onboarding UI; remove Revolut + GoCardless code
4. **Task 10–11:** Stripe test-mode smoke + rollout docs
5. **Note:** Live Accounts v2 spike still needed with test secret before first deploy

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

| #   | Date (UTC) | Commit  | Branch | Render services                 | Status | Notes                                                                                                                                                                                                                   |
| --- | ---------- | ------- | ------ | ------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 2026-06-30 | fdbc3e8 | master | engage-backend, engage-frontend | live   | UI dark/light + Clara surfaces                                                                                                                                                                                          |
| 2   | 2026-07-03 | 6372c68 | master | engage-backend, engage-frontend | live   | sendit v3.5 — 7-day trial, backlog, schema/test fix, superadmin payment reporting; 123 tests pass; all endpoints 200                                                                                                    |
| 3   | 2026-07-04 | 6338cf2 | master | engage-backend, engage-frontend | live   | sendit v4.0 — Revolut payout collection, tenant payout settings, legal terms, UI fixes; TS build fix in splits.ts                                                                                                       |
| 4   | 2026-07-04 | 53f9d47 | master | engage-backend, engage-frontend | live   | Analytics routes + win-loss normalise, regulatory mount, /2fa-setup, e2e auth hardening; prod smoke 11/11                                                                                                               |
| 5   | 2026-07-04 | 6686892 | master | engage-backend, engage-frontend | live   | sendit v4 — P1/P2 security hardening (items 7–35); JWT_REFRESH_SECRET wired; `/health` + login 200                                                                                                                      |
| 6   | 2026-07-05 | ea0a593 | master | engage-backend, engage-frontend | live   | P0 security (audit 1–6): webhook auth, portal token, env boot, validUntil, E2E bypass. JWT_REFRESH_SECRET restored+rotated (was lost — deploys failing since 13:01 UTC). EMAIL/AML/E2E secrets wired. Payout smoke PASS |

## Strategic docs (Jul 2026)

| Doc                           | Purpose                              |
| ----------------------------- | ------------------------------------ |
| `PREMIER_SERVICE_STRATEGY.md` | Pricing research, SWOT, gap analysis |
| `PREMIER_SERVICE_TODO.md`     | Canonical premier build list         |

## Notes

- `/sendit` = push + hooks + checkpoint + `sendit.resume`
- Full todo detail lives in `PREMIER_SERVICE_TODO.md` — not duplicated here
