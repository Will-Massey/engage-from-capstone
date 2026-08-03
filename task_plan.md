# Engage Build Plan (post-cutover)

## Goal

Exceed Engager on practice ops **while** defending proposal→cash + Clara. Production is live Practice OS on Neon + Render.

## Production

| Item    | Value                                                                |
| ------- | -------------------------------------------------------------------- |
| App     | https://capstonesoftware.co.uk/engage                                |
| Login   | https://capstonesoftware.co.uk/engage/login                          |
| Stack   | Neon Postgres + Render + Cloudflare worker                           |
| Cutover | **Done** 2026-08-02 (PR #91) + deploy hotfix #92                     |
| Railway | Removed from repo (PR #93); disconnect GitHub app if statuses remain |

## Current phase

**Post-cutover polish + Engager gap close** on `master`.

## Next up (priority)

1. **Sales board** (proposals kanban) — shipping this session
2. Two-way mailbox depth (OAuth sync polish)
3. Bulk forms / portal OS depth
4. AccountFlow mesh stays **mock** until ALLOW_LIVE
5. Capacitor iOS only after desktop solid

## Done recently

- Practice OS cutover (jobs, letters, automations, inbox, forms, GTM, metal UI)
- Caroline backup + data-safe migrations
- Railway refs purged; deploy path = Render only

## Notes

- Never restore practice seed over Neon prod
- AccountFlow live mesh: explicit env only
