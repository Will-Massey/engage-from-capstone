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

1. ~~Render deploy smoke — Documents tab + portal copy on prod~~ **DONE 2026-08-05** (health 200, `portal-os` route live 401-gated vs 404 control, deployed ClientDetail chunk contains Documents tab)
2. ~~Local tandem loop (AF :3000 + Engage) with shared mesh secret~~ **DONE 2026-08-05** — full bi-di verified: Connect UI save + test ping → client handoff (AF client + `capstone_client_id`) → proposal accept → job spawn → auto mesh work shell in AF → AF `PATCH /work/:id/status` BLOCKED → Engage board HELP_NEEDED (and back to IN_PROGRESS)
3. Prod mesh only via deliberate Connect UI + `ALLOW_LIVE` (not demo)
4. Optional open PRs: #90 marketing root, #80 OAuth TTL
5. Capacitor iOS after desktop solid
6. **Cover-letter greeting round 2 is in `git stash@{0}`** ("wip-unrelated-cover-letter", 12 files / +278) — never committed; awaiting William's go-ahead. Pop, rebase on current master, re-run shared tests before shipping.

## Notes

- Never restore practice seed over Neon prod
- AF `ENGAGE_BASE_URL=https://capstonesoftware.co.uk/engage` (not engage. subdomain)
- AF `ENGAGE_MESH_INBOUND_SECRET` must match Engage mesh key for reverse status
- **Engage inbound secret is ENV-ONLY** (`ACCOUNTFLOW_MESH_INBOUND_SECRET` or `ACCOUNTFLOW_API_KEY` on the Engage backend) — the tenant-saved Connect UI key does NOT authorize inbound. For prod mesh (item 3), set the env var on Render or reverse mirror 401s.
- **AF fresh-install migrations are broken** (found building the local loop): `db/migrations/001` creates audit_logs indexes before the table; `020` needs `campaigns` (created in `023`); `db/migrations/` is missing ~25 root files incl. `102`/`103` (mesh tables). Local dev AF DB was built by healing these by hand — container `accountflow-postgres-dev` on host port **5434** (never 5432), practice_id 2, admin `tandemadmin`.
