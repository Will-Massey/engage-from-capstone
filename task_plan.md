# Engage Build Plan (post-cutover)

## Goal

Exceed Engager on practice ops **while** defending proposal-cash + Clara. Production is live Practice OS on Neon + Render.

## Production

| Item    | Value                                 |
| ------- | ------------------------------------- |
| App     | https://capstonesoftware.co.uk/engage |
| Cutover | Done 2026-08-02                       |

## Current phase

**Post-cutover polish** — prod smoke done; mesh live wiring next.

## Shipped this session

1. **Sales board** PR #94 **MERGED**
2. **Capstone Tandem bi-di** PR #95 **MERGED**
3. **Mailbox + bulk forms** PR #96 **MERGED**
4. **Prod smoke** 2026-08-03 (demo tenant) — board/inbox/forms/integrations OK
5. **Mesh CSRF fix** PR #97 — exempt AF inbound from CSRF

## Prod smoke (admin@demo.practice)

| Surface           | Result                                |
| ----------------- | ------------------------------------- |
| Login + /ping     | OK                                    |
| Proposals board   | Pipeline totals + List/Board live     |
| Inbox             | Two-way mailbox; unread surface       |
| Forms             | Overdue + CSV + assign UI             |
| Integrations / AF | **mock** (no live base URL / API key) |
| AF inbound POST   | Blocked by CSRF until #97 deploys     |

## Mesh wiring checklist

### Engage (Render env or Connect UI)

- `ACCOUNTFLOW_MESH_MODE=local` (dev) or `live` (prod, deliberate)
- `ACCOUNTFLOW_BASE_URL` = AF origin (local `http://localhost:3000`)
- `ACCOUNTFLOW_API_KEY` = practice-scoped `af_live_…`
- `ACCOUNTFLOW_MESH_ALLOW_LIVE=true` only when using public AF URL
- `ACCOUNTFLOW_MESH_INBOUND_SECRET` (optional; defaults to API key)
- `ENGAGE_PUBLIC_URL=https://capstonesoftware.co.uk/engage`

### AccountFlow

- Migration `102_capstone_tandem_mesh.sql` applied
- API key scopes: `clients:read` + `clients:write`
- `ENGAGE_BASE_URL=https://capstonesoftware.co.uk/engage` (**not** engage. subdomain)
- Optional reverse notify → `POST …/api/integrations/accountflow/inbound` with same secret

### Local loop (preferred before prod live)

1. AF on :3000, Engage API :3101, SPA :5273
2. Mode `local`, allowLive false
3. Integrations → Test connection
4. Accept proposal / handoff job → AF deep link

## Next up

1. Land **#97** when CI green
2. Local tandem loop with AF agent
3. Prod live mesh only after deliberate Connect UI + ALLOW_LIVE
4. Capacitor iOS after desktop solid

## Notes

- Never restore practice seed over Neon prod
- AccountFlow live mesh: practice Connect UI + ALLOW_LIVE for public URLs
