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
- **#103 @mention notifications** — DEPLOYED (JOB_MENTION now personal in the bell feed + escaped email ping per mention via jobMentionService; composer chips already existed)
- **#104 scheduled automations + document-request auto-chase** — DEPLOYED + smoked (`/api/automation/schedule` 401-gated). Daily runs are OPT-IN per tenant (Automations page toggle + confirm dialog, audited); 3d cooldown ledger per (rule, entity); `document_request.stale → resend_document_request` closes the records-chasing loop. **A tenant must enable the toggle AND have the DOCS pack (or a matching rule) for auto-chase to fire.**
- Prod smokes all green: portal overhaul live (`/api/document-requests` 401-gated), catch-up affordance in the deployed ProposalBuilder chunk

Also shipped 2026-08-06: **#105** (Documents-hub field fixes: client search, AML docs on Documents tab, download links, deep links) and **prod mesh fully wired** — 5 env vars set + Blueprint-guarded via Render API, prod AF API key minted (practice 6 Fortis), both gates verified live (AF ping 200 / Engage inbound 401-vs-200).

## Next up

1. ~~**Flip live mesh**~~ — **DONE 2026-08-06 PM** via prod DB (William's call): Fortis tenant `accountFlowMesh` set to mode live + allowLive + autoHandoff. Trap caught: a hand-pasted junk tenant apiKey ("Caroline…") would have overridden the env fallback — cleared to null. No redeploy needed (settings read per-request). Watch the first real proposal accept → AF work spawn.
2. ~~Optional open PRs~~ — **ALL MERGED 2026-08-07**: #90 marketing root (worker still needs a manual `wrangler deploy` to go live), #80 OAuth TTL, #106 one-screen signing, #107 two-way mailbox. PR queue is empty.
3. Remaining scorecard gaps: ~~two-way mailbox depth (M365/Gmail sync)~~ — **SHIPPED to prod 2026-08-07** (#107: mail domain model + Graph/Gmail provider clients + delta sync job + Graph webhook + gated paginated API + FirmInbox rework; migration verified live, webhook handshake verified through the public URL). **Activation gates**: Gmail needs `GMAIL_CLIENT_ID`/`SECRET` from Google Cloud (William); first real M365 connect should be watched (first sync is bounded to 90 days / 200 messages). Architecture: `docs/MAILBOX_TWO_WAY.md`. Fast-follows: Graph reply ignores edited To/CC; webhook burst concurrency; provider-mismatch markRead warns; JUNIOR read-state 403. Then: Credas AML (awaits William's partner email), Capacitor iOS after desktop solid
4. Caroline flow to watch: first real document request end-to-end (email → portal checklist → upload → auto-complete)

## Notes

- Never restore practice seed over Neon prod
- AF `ENGAGE_BASE_URL=https://capstonesoftware.co.uk/engage` (not engage. subdomain)
- AF `ENGAGE_MESH_INBOUND_SECRET` must match Engage mesh key for reverse status
- **Engage inbound secret is ENV-ONLY** (`ACCOUNTFLOW_MESH_INBOUND_SECRET` or `ACCOUNTFLOW_API_KEY` on the Engage backend) — the tenant-saved Connect UI key does NOT authorize inbound. For prod mesh (item 3), set the env var on Render or reverse mirror 401s.
- **AF fresh-install migrations are broken** (found building the local loop): `db/migrations/001` creates audit_logs indexes before the table; `020` needs `campaigns` (created in `023`); `db/migrations/` is missing ~25 root files incl. `102`/`103` (mesh tables). Local dev AF DB was built by healing these by hand — container `accountflow-postgres-dev` on host port **5434** (never 5432), practice_id 2, admin `tandemadmin`.
