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

## Shipped 2026-08-05 PM (tandem session engage-commercial-push)

- **#99 MERGED** — cover-letter greeting round 2 (recovered from stash, 19 shared tests)
- **#100 MERGED** — R2 storage for portal/job documents. Root cause of "portal not working": disk-only storage on Render's ephemeral filesystem deleted every client upload on each deploy. Legacy dead rows now 410 with a re-upload message.
- **#101 MERGED** — document requests + Documents hub + portal checklist: request email (tenant-branded, carries auto-minted portal link) → client uploads per item → auto-complete → staff notifications; resend/cancel/manual override; duplicate-title 409
- AF `ca9680b` — mesh migrations 102/103 now reach the prod boot runner; 001 fresh-install fix; db/migrations drift README
- render.yaml declares `ACCOUNTFLOW_MESH_INBOUND_SECRET` (Blueprint-deletion guard)
- Stripe re-check: still zero Engage payment events on platform account (webhook watch stands)

Also shipped same day (commercial-readiness continuation):

- **#102 catch-up fees** — DEPLOYED + smoked (recurring line → derived ONE_TIME line at months × monthly equivalent; dup-serviceId validation fixed to unique sets)
- **#103 @mention notifications** — MERGED (JOB_MENTION now personal in the bell feed + escaped email ping per mention via jobMentionService; composer chips already existed)
- Prod smokes all green: portal overhaul live (`/api/document-requests` 401-gated), catch-up affordance in the deployed ProposalBuilder chunk

## Next up

1. Prod mesh via deliberate Connect UI + `ALLOW_LIVE` — **William gates**: set `ACCOUNTFLOW_MESH_INBOUND_SECRET` value in Render dashboard (both sides share the AF API key), create prod AF API key, then Connect UI
2. Optional open PRs: #90 marketing root, #80 OAuth TTL (both green, William's call)
3. Remaining scorecard gaps: two-way mailbox depth (M365/Gmail sync), Credas AML (awaits William's partner email), Capacitor iOS after desktop solid
4. Caroline flow to watch: first real document request end-to-end (email → portal checklist → upload → auto-complete)

## Notes

- Never restore practice seed over Neon prod
- AF `ENGAGE_BASE_URL=https://capstonesoftware.co.uk/engage` (not engage. subdomain)
- AF `ENGAGE_MESH_INBOUND_SECRET` must match Engage mesh key for reverse status
- **Engage inbound secret is ENV-ONLY** (`ACCOUNTFLOW_MESH_INBOUND_SECRET` or `ACCOUNTFLOW_API_KEY` on the Engage backend) — the tenant-saved Connect UI key does NOT authorize inbound. For prod mesh (item 3), set the env var on Render or reverse mirror 401s.
- **AF fresh-install migrations are broken** (found building the local loop): `db/migrations/001` creates audit_logs indexes before the table; `020` needs `campaigns` (created in `023`); `db/migrations/` is missing ~25 root files incl. `102`/`103` (mesh tables). Local dev AF DB was built by healing these by hand — container `accountflow-postgres-dev` on host port **5434** (never 5432), practice_id 2, admin `tandemadmin`.
