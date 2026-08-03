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

**Post-cutover polish + Engager gap close** — sales board + Capstone Tandem in flight on PRs.

## Next up (priority)

1. **Sales board** — list/board + DnD + column £ totals (PR #94) → merge when CI green
2. **Capstone Tandem bi-di** — PR #95 + Connect UI on Integrations (landed pieces on master)
3. Two-way mailbox depth (OAuth sync polish)
4. Bulk forms / portal OS depth
5. Capacitor iOS only after desktop solid

## Done recently

- Practice OS cutover (jobs, letters, automations, inbox, forms, GTM, metal UI)
- Caroline backup + data-safe migrations
- Railway refs purged; deploy path = Render only
- Capstone Tandem: AF mesh API + SSO handoff + Engage Connect UI
- Sales board: Draft→Signed columns, pipeline value strip, drag-to-status

## Notes

- Never restore practice seed over Neon prod
- AccountFlow live mesh: explicit env only
