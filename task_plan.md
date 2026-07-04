# Build Plan: Engage by Capstone
<!-- Token handoff file — update at every Render deploy checkpoint. Fresh sessions read THIS, not chat history. -->

## Goal
Become the **premier UK accountancy proposal platform** — see `PREMIER_SERVICE_STRATEGY.md` and `PREMIER_SERVICE_TODO.md`.

## Current Phase
Phase: **Premier Service — Deploy & verify** — `in_progress` (sendit v4.0 live)

## Next Up
<!-- 3–5 bullets ONLY. Next fresh session starts here. Rewrite every checkpoint. -->
1. William: browser UAT — Settings → Billing → Receive Payments Through Engage (opt-in + bank details)
2. Production smoke: client sign → Revolut checkout flow at capstonesoftware.co.uk/engage
3. William: confirm UI fixes — sidebar full name, header safe-area, AI panel scales on resize
4. Revolut live webhook smoke + verify payout ledger + Superadmin payment events

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

## Strategic docs (Jul 2026)
| Doc | Purpose |
|-----|---------|
| `PREMIER_SERVICE_STRATEGY.md` | Pricing research, SWOT, gap analysis |
| `PREMIER_SERVICE_TODO.md` | Canonical premier build list |

## Notes
- `/sendit` = push + hooks + checkpoint + `sendit.resume`
- Full todo detail lives in `PREMIER_SERVICE_TODO.md` — not duplicated here