# Grok bot connector

How a remote assistant connects to Engage so it can draft a proposal for one user. Caroline Marks is the only person using Engage today. William Massey approved this build. The connector does not send, email, or e-sign.

## Decision

Engage already speaks Streamable HTTP for practice AI clients at `POST /api/mcp`. That server is the wrong place for this job.

- Its tokens belong to a whole practice, not one user.
- Its tool list includes job notes and a practice snapshot.
- A bot pointed at it can see tools this task must not grow into sending.

The connector is a second Streamable HTTP endpoint on the same Engage process:

`POST /api/grok/mcp`

The Cloudflare worker already forwards `/engage/api/*` to the backend `/api/*`, so the public URL is:

`https://capstonesoftware.co.uk/engage/api/grok/mcp`

A bare `/mcp` on the process root would sit outside the `/api` stack. CSRF exemptions, rate limits, and the worker proxy are all hung off `/api`. Reusing that stack is why the path is `/api/grok/mcp` and not a new hostname.

The transport matches the MCP Streamable HTTP profile Engage already runs: stateless JSON-RPC (`initialize`, `tools/list`, `tools/call`, `ping`). There is no server-sent event stream, because the connector never pushes a message of its own. Each call is one JSON body and one JSON response. Auth is `Authorization: Bearer <token>`.

## What the bot can call

| Tool                           | Writes?    |
| ------------------------------ | ---------- |
| `engage_list_clients`          | no         |
| `engage_list_proposals`        | no         |
| `engage_get_proposal`          | no         |
| `engage_list_services`         | no         |
| `engage_create_draft_proposal` | draft only |
| `engage_add_draft_line`        | draft only |
| `engage_update_draft_line`     | draft only |
| `engage_remove_draft_line`     | draft only |
| `engage_update_draft_notes`    | draft only |

`engage_get_proposal` returns the commercial proposal: client, notes, cover letter, summary, terms, every line with its id, fee, quantity, billing frequency, hourly mode, VAT, and totals. It does not return signature images, share tokens, or payment secrets.

Create always stores `status = DRAFT`. No tool accepts a status field. If a caller passes `status`, the tool refuses. If the proposal is anything other than `DRAFT` (`SENT`, `VIEWED`, `ACCEPTED`, `DECLINED`, `EXPIRED`, `WITHDRAWN`, `ARCHIVED`, `LOST`), every edit refuses with: "This proposal is STATUS. The assistant can only change a draft. Caroline sends it from Engage herself."

There is no tool that sends, emails, requests a signature, accepts, or marks a proposal sent. The existing send and e-sign routes are untouched.

Fees on a new line come from the practice catalogue (`priceAmount`, falling back to `basePrice`) unless the caller passes `display_price_gbp`. The line is then priced by the same function the proposal screen uses (`buildProposalServiceRecord` in `backend/src/utils/proposalPricing.ts`, which calls `calculateLineItem` in `shared/src/pricingEngine.ts`). Header totals are the sum of the line pence amounts. They are not converted into one monthly fee.

The bot instructions for those rules live in `docs/grokbot/SKILL.md`.

## Token

One token acts as one Engage user. The row stores `userId` and that user's `tenantId`. Every query is limited to that practice. New proposals are created by that user.

The plaintext value is `eng_grok_` plus 32 random bytes, hex encoded. Only the SHA-256 hash is stored (`keyHash`). The prefix (first 8 hex characters) is stored so an operator can recognise a token without keeping the secret. `created_at` and `last_used_at` are on the row. `last_used_at` is updated by the endpoint when a token is accepted, including on read calls. The read tools themselves do not write clients, proposals, services, or the audit table.

Minting a new token revokes any earlier active token for that same user. Revoke sets `revoked_at`. A revoked, unknown, inactive-user, or inactive-practice token gets HTTP 401 and the message "Invalid or revoked Engage connector token". The practice MCP prefix `eng_mcp_` is not accepted here.

Scopes on a minted token are `read,draft_proposals`. A token without `draft_proposals` cannot call a write tool. A token without `read` cannot call a read tool.

### Mint and revoke

Preferred, because the secret is printed on the operator's terminal and not returned over HTTP:

```bash
cd backend
DATABASE_URL="postgresql://..." npx tsx src/scripts/grokConnectorToken.ts mint --email "caroline@example.co.uk"
DATABASE_URL="postgresql://..." npx tsx src/scripts/grokConnectorToken.ts status --email "caroline@example.co.uk"
DATABASE_URL="postgresql://..." npx tsx src/scripts/grokConnectorToken.ts revoke --email "caroline@example.co.uk"
DATABASE_URL="postgresql://..." npx tsx src/scripts/grokConnectorToken.ts revoke --prefix eng_grok_abcd1234
```

The script prints the database host and database name before it prints the token, so it is obvious which database was used. It prints the token once. It does not write the token to a file.

Alternative, using the existing admin secret (`ADMIN_SECRET_KEY`, header `X-Admin-Key`, never the query string):

- `POST /api/admin/grok-connector/mint` with `{ "email": "..." }` or `{ "userId": "..." }`
- `POST /api/admin/grok-connector/revoke` with `{ "email" }`, `{ "userId" }`, or `{ "prefix" }`
- `GET /api/admin/grok-connector?email=...` lists prefixes and times only

The mint response contains the token once. Server logs record the action, not the token. Combined access logs do not include response bodies.

Do not commit a token, a database URL, or `ADMIN_SECRET_KEY`.

## Audit and limit

Every create, add, update, remove, and notes change writes one row to `grok_connector_audits`: who (`userId`), which proposal, which tool, a short summary, a JSON `changes` payload, and `created_at`. The same summary is copied onto the proposal activity timeline so it shows in Engage. Read tools do not insert those rows.

The route is limited to 60 requests per 15 minutes per IP (`grokMcpLimiter`), on top of the general API limit. The JSON-RPC path is CSRF-exempt because the caller sends a bearer token and no session cookie. Cookie CSRF does not apply to a header the browser will not attach on a foreign site.

## Data

Migration `20261126120000_grok_connector` adds `grok_connector_tokens` and `grok_connector_audits`. It does not change proposal, send, or signature tables. It is applied by the existing `prisma migrate deploy` on backend boot. No backfill.

## Production configuration

No new environment variable. The process already has `DATABASE_URL`. The admin mint route uses the existing `ADMIN_SECRET_KEY`. The URL printed by the script uses `PUBLIC_APP_URL` or `FRONTEND_URL` when one of those is set, otherwise `https://capstonesoftware.co.uk/engage`. The path the server listens on is always `POST /api/grok/mcp`.

## Out of scope

Sending, email, e-sign, acceptance, approval, and any status change. The practice MCP at `/api/mcp` is unchanged. This is not deployed from this change.
