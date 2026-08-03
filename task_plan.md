# Engage Build Plan (post-cutover)

## Goal

Exceed Engager on practice ops **while** defending proposal-cash + Clara. Production is live Practice OS on Neon + Render.

## Production

| Item    | Value                                 |
| ------- | ------------------------------------- |
| App     | https://capstonesoftware.co.uk/engage |
| Cutover | Done 2026-08-02                       |

## Current phase

**Post-cutover polish** — desktop practice OS solid; mesh live wiring next.

## Shipped (this wave)

1. Sales board **#94**
2. Capstone Tandem bi-di **#95**
3. Mailbox + bulk forms **#96**
4. Mesh inbound CSRF exempt **#97**
5. Client Documents tab + portal link copy/open **#98**
6. AF main: work status mirror → Engage HELP_NEEDED (`notifyEngageInbound`, `PATCH /work/:id/status`)

## Next up

1. Render deploy smoke — Documents tab + portal copy on prod
2. Local tandem loop (AF :3000 + Engage) with shared mesh secret
3. Prod mesh only via deliberate Connect UI + `ALLOW_LIVE` (not demo)
4. Optional open PRs: #90 marketing root, #80 OAuth TTL
5. Capacitor iOS after desktop solid

## Notes

- Never restore practice seed over Neon prod
- AF `ENGAGE_BASE_URL=https://capstonesoftware.co.uk/engage` (not engage. subdomain)
- AF `ENGAGE_MESH_INBOUND_SECRET` must match Engage mesh key for reverse status
