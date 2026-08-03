# Engage Build Plan (post-cutover)

## Goal
Exceed Engager on practice ops **while** defending proposal-cash + Clara. Production is live Practice OS on Neon + Render.

## Production
| Item | Value |
|------|-------|
| App | https://capstonesoftware.co.uk/engage |
| Cutover | Done 2026-08-02 |

## Current phase
**Post-cutover polish** — shipping sales board + mailbox/forms depth + Capstone Tandem.

## Shipped this session
1. **Sales board** PR #94 **MERGED** (list/board, DnD, column totals, pipeline strip)
2. **Capstone Tandem bi-di** PR #95 **MERGED** (+ Connect UI / SSO earlier on master)
3. **Mailbox depth** PR #96 — link client, unread filter, unread in stats
4. **Bulk forms depth** PR #96 — overdue filter, CSV export, view answers, dueInDays on assign-all

## Next up
1. Merge PR #96 when CI green
2. Capacitor iOS after desktop solid
3. Optional: status mirror polish AF blocked → Engage HELP_NEEDED

## Notes
- Never restore practice seed over Neon prod
- AccountFlow live mesh: practice Connect UI + ALLOW_LIVE for public URLs
