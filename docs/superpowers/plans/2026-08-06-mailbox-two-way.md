# Two-Way Mailbox Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Tasks are dispatched to implementation subagents; each task carries its own test cycle. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn the demo-grade firm mailbox into real two-way M365/Gmail sync: a proper mail domain model, replies sent through the connected mailbox with provider-side threading, read write-back, scheduled incremental (delta) sync incl. Sent Items, connection health, inbound attachments, and a Graph webhook receiver.

**Architecture:** New `MailMessage`/`MailboxSyncState` Prisma models replace ActivityLog-as-mailbox. A provider-client layer (`graphMailClient.ts`, `gmailMailClient.ts`) owns tokens (cached access token + expiry), delta sync, send/reply, read write-back, and attachments. `mailboxService.ts` becomes orchestration + storage. Routes gain role gates and server-side pagination. A jobs.ts interval syncs connected tenants. FirmInbox consumes the new API and renders sanitized HTML (DOMPurify, already a dep).

**Tech Stack:** Express + Prisma (backend, jest), React + vitest (frontend), Microsoft Graph REST, Gmail REST via googleapis (already a dep).

## Global Constraints

- Repo: worktree `C:\Users\willi\engage-mailbox`, branch `feat/mailbox-two-way` (never master).
- Tests: backend `cd backend && npx jest <path>`; typecheck `npx tsc --noEmit` per workspace; frontend `cd frontend && npx vitest run`.
- Prisma migration naming: `YYYYMMDDHHMMSS_mailbox_two_way` under `backend/prisma/migrations/`. Boot migration runner is fail-closed — migration must be valid on a DB that has the old ActivityLog rows.
- Tokens stay encrypted in `Tenant.settings.email` (existing `tenantEmailSettings.ts` helpers). NO new token storage location. Access-token cache is in-memory only (Map keyed by tenantId) — never persisted.
- Existing outbound funnel `tenantMailerSend` remains the fallback and is NOT refactored.
- Demo seeding (`seedLocalInboundIfEmpty`) must never run when `NODE_ENV === 'production'`.
- Role gates: read endpoints `authorize('ADMIN','PARTNER','MD','MANAGER','SENIOR','JUNIOR')`; mutating endpoints (sync, send, read-state, link-client, create-task, assign-form) `authorize('ADMIN','PARTNER','MD','MANAGER','SENIOR')`.
- UK English in all user-facing copy. No CDN assets.
- Each task: TDD, tsc clean, suite for touched workspace green, then commit with the message given in the task.

---

### Task 1: Schema — MailMessage, MailAttachment, MailboxSyncState (+ backfill migration)

**Files:** Modify `backend/prisma/schema.prisma`; Create `backend/prisma/migrations/<ts>_mailbox_two_way/migration.sql`.

Add to schema.prisma:

```prisma
enum MailDirection {
  INBOUND
  OUTBOUND
}

model MailMessage {
  id                String        @id @default(uuid())
  provider          EmailProvider
  externalId        String        // Graph message id / Gmail message id / local uuid
  conversationId    String?       // Graph conversationId / Gmail threadId
  internetMessageId String?       // RFC 5322 Message-ID
  direction         MailDirection
  fromAddress       String
  toAddresses       String        // comma-separated
  ccAddresses       String?
  subject           String
  bodyText          String        @default("")
  bodyHtml          String?
  snippet           String?
  isRead            Boolean       @default(false)
  hasAttachments    Boolean       @default(false)
  receivedAt        DateTime      // provider receipt time (outbound: sent time)
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  tenantId String
  tenant   Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  clientId String?
  client   Client? @relation(fields: [clientId], references: [id], onDelete: SetNull)
  jobId    String?
  job      Job?    @relation(fields: [jobId], references: [id], onDelete: SetNull)

  attachments MailAttachment[]

  @@unique([tenantId, provider, externalId])
  @@index([tenantId, receivedAt(sort: Desc)])
  @@index([tenantId, conversationId])
  @@index([tenantId, isRead])
  @@index([clientId])
}

model MailAttachment {
  id          String  @id @default(uuid())
  externalId  String  // provider attachment id
  name        String
  contentType String
  sizeBytes   Int
  isInline    Boolean @default(false)

  messageId String
  message   MailMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)

  @@index([messageId])
}

model MailboxSyncState {
  id                 String    @id @default(uuid())
  provider           EmailProvider
  inboxDeltaLink     String?   // Graph delta link / Gmail historyId
  sentDeltaLink      String?
  lastSyncAt         DateTime?
  lastSyncOk         Boolean?
  lastSyncError      String?
  subscriptionId     String?   // Graph webhook subscription
  subscriptionExpiry DateTime?

  tenantId String @unique
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}
```

Add back-relations on `Tenant` (`mailMessages MailMessage[]`, `mailboxSyncState MailboxSyncState?`), `Client` (`mailMessages MailMessage[]`), `Job` (`mailMessages MailMessage[]`).

Migration SQL: standard CREATE TABLE/TYPE/INDEX (`npx prisma migrate diff` to generate), PLUS a backfill INSERT parsing legacy rows:

```sql
INSERT INTO "MailMessage" ("id","provider","externalId","direction","fromAddress","toAddresses","subject","bodyText","isRead","receivedAt","createdAt","updatedAt","tenantId","conversationId")
SELECT gen_random_uuid(),
       'SMTP'::"EmailProvider",
       COALESCE(NULLIF(al.metadata::json->>'externalId',''), al.id),
       CASE WHEN al.action = 'EMAIL_OUTBOUND' THEN 'OUTBOUND'::"MailDirection" ELSE 'INBOUND'::"MailDirection" END,
       COALESCE(al.metadata::json->>'from',''),
       COALESCE(al.metadata::json->>'to',''),
       COALESCE(al.metadata::json->>'subject','(no subject)'),
       COALESCE(al.metadata::json->>'body',''),
       COALESCE((al.metadata::json->>'read')::boolean, false),
       al."createdAt", al."createdAt", al."createdAt",
       al."tenantId",
       NULLIF(al.metadata::json->>'threadKey','')
FROM "ActivityLog" al
WHERE al.action IN ('EMAIL_INBOUND','EMAIL_OUTBOUND')
  AND al.metadata IS NOT NULL AND al.metadata <> '{}'
  AND al.metadata::text LIKE '{%'
ON CONFLICT DO NOTHING;
```

Wrap the backfill so a malformed metadata row cannot fail the boot migration (fail-closed runner): guard with a `DO $$ ... EXCEPTION WHEN OTHERS THEN RAISE NOTICE ... END $$;` block.

Verify: `npx prisma migrate deploy` against the dev DB (port 5433, see .claude/skills/run-local) succeeds twice (idempotent-safe), `npx prisma generate`, backend tsc clean.
Commit: `feat(mailbox): mail domain model + sync state + legacy backfill`

---

### Task 2: Provider clients — graphMailClient + gmailMailClient (TDD, HTTP mocked)

**Files:** Create `backend/src/services/mail/graphMailClient.ts`, `backend/src/services/mail/gmailMailClient.ts`, `backend/src/services/mail/types.ts`, tests in `backend/src/services/mail/__tests__/`.

`types.ts` — the provider-neutral contract (consumed by Tasks 3–5):

```ts
export interface MailAddress { address: string; name?: string }
export interface ProviderMessage {
  externalId: string;
  conversationId?: string;
  internetMessageId?: string;
  direction: 'INBOUND' | 'OUTBOUND';
  from: string;                // "Name <a@b>" flattened
  to: string;                  // comma-separated
  cc?: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  isRead: boolean;
  hasAttachments: boolean;
  receivedAt: Date;
  attachments?: { externalId: string; name: string; contentType: string; sizeBytes: number; isInline: boolean }[];
}
export interface DeltaPage { messages: ProviderMessage[]; deltaLink: string | null }
export interface SendSpec {
  to: string[]; cc?: string[]; subject: string; bodyText: string;
  replyToExternalId?: string;  // provider message id being replied to
  inReplyToInternetMessageId?: string;
}
export interface MailProviderClient {
  syncInbox(deltaLink: string | null): Promise<DeltaPage>;
  syncSent(deltaLink: string | null): Promise<DeltaPage>;
  send(spec: SendSpec): Promise<{ externalId: string | null }>;
  markRead(externalId: string, read: boolean): Promise<void>;
  fetchAttachment(messageExternalId: string, attachmentExternalId: string): Promise<{ name: string; contentType: string; content: Buffer }>;
}
```

`graphMailClient.ts`: factory `createGraphMailClient(tenantId: string): Promise<MailProviderClient | null>` — loads `settings.email.outlook` via `tenantEmailSettings.ts`, refreshes with scope `https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send offline_access` (ONE scope set — kills today's sync/send drift), caches `{accessToken, expiresAt}` in a module-level Map keyed tenantId (60s early-expiry margin). Endpoints: delta `GET /v1.0/me/mailFolders/{inbox|sentitems}/messages/delta?$select=...` following `@odata.nextLink`, capturing `@odata.deltaLink`; send: `POST /v1.0/me/messages/{id}/reply` when `replyToExternalId` set else `POST /v1.0/me/sendMail`; markRead: `PATCH /v1.0/me/messages/{id} {isRead}`; attachments: `GET .../attachments` and `.../attachments/{id}/$value`. All HTTP via global `fetch`; tests mock `fetch`.

`gmailMailClient.ts`: same contract on googleapis — `users.messages.list/get` with `historyId` incremental via `users.history.list` (store historyId in the deltaLink field as `history:<id>`), send via `users.messages.send` with raw RFC 822 (set `In-Reply-To`/`References` when replying, `threadId` when known), markRead via `users.messages.modify` removeLabelIds UNREAD.

Tests (per client): delta page maps fields correctly incl. attachments and HTML→text fallback; send builds a reply (correct endpoint/raw headers); markRead issues correct call; token refresh happens once for two calls inside expiry (cache hit).
Commit: `feat(mailbox): provider client layer (Graph + Gmail) with delta sync and threaded send`

---

### Task 3: mailboxService rewrite — storage + orchestration (TDD)

**Files:** Rewrite `backend/src/services/mailboxService.ts` (keep exported names used by comms.ts, listed below); update/replace `backend/src/services/__tests__/mailboxService.test.ts`.

Exports (consumed by Task 5 routes — keep these signatures):

```ts
getMailboxConnection(tenantId): Promise<{ provider: string | null; user: string | null; health: { lastSyncAt: string | null; lastSyncOk: boolean | null; lastSyncError: string | null } }>
syncMailbox(tenantId): Promise<{ imported: number; updated: number; ok: boolean; error?: string }>
listMailboxMessages(tenantId, opts: { q?: string; unread?: boolean; clientId?: string; limit?: number; cursor?: string }): Promise<{ messages: MailMessageDto[]; nextCursor: string | null }>
getThread(tenantId, messageId): Promise<MailMessageDto[]>            // by conversationId, DB-side
sendMailboxMessage(tenantId, userId, spec: { to: string; cc?: string; subject: string; body: string; replyToMessageId?: string }): Promise<MailMessageDto>
markMailboxRead(tenantId, messageId, read: boolean): Promise<void>    // DB + provider write-back (best-effort)
linkMessageClient(tenantId, messageId, clientId): Promise<void>       // sets clientId on ALL messages in the conversation
getMailboxUnreadCount(tenantId): Promise<number>                      // DB count, indexed
getMessageContext(tenantId, messageId)                                // client match + open jobs + pending forms (port existing logic, DB lookup not 150-row scan)
```

Rules: `syncMailbox` builds the provider client (Graph or Gmail from `settings.email.provider`), runs inbox+sent delta, upserts by `(tenantId, provider, externalId)`, auto-links `clientId` by matching from/to addresses against `Client.email` (case-insensitive), writes MailboxSyncState (ok/error/lastSyncAt/deltaLinks). No provider connected → `{ok: false, error: 'NOT_CONNECTED'}` — and in non-production only, call the (renamed) `seedDevInboundIfEmpty` guarded by `process.env.NODE_ENV !== 'production'`. `sendMailboxMessage`: provider connected → `client.send(...)` with reply threading (look up the replied MailMessage for externalId + internetMessageId + conversationId), insert OUTBOUND MailMessage; no provider → `tenantMailerSend` fallback (existing behaviour) still inserting the OUTBOUND row (`provider: 'SMTP'`-family, conversationId inherited from the replied message). Search: Prisma `contains` on subject/from/bodyText with the tenant+receivedAt index, cursor pagination (`receivedAt`,`id`).

Tests: upsert idempotency, auto client-link, cursor pagination, unread count, send-with-reply threads correctly (provider client mocked), fallback path when unconnected, prod guard on seeding.
Commit: `feat(mailbox): MailMessage-backed service with provider send and health`

---

### Task 4: Scheduled sync + Graph webhook receiver

**Files:** Create `backend/src/jobs/mailboxSyncJob.ts` (+test); Modify `backend/src/app/jobs.ts` (follow the existing setInterval tick pattern); Create route `POST /api/webhooks/graph-mail` in the existing webhooks module; Add subscription helpers to `graphMailClient.ts`.

- Job: every 10 min (`MAILBOX_SYNC_INTERVAL_MS` env, default 600000), iterate tenants that have `settings.email.provider` in (GMAIL, OUTLOOK, MICROSOFT365) — find via MailboxSyncState union tenants-with-email-settings — call `syncMailbox`, sequential with per-tenant try/catch. Skip entirely when `EMAIL_DEV_LOG=true`.
- Webhook: Graph validation handshake (echo `validationToken` as text/plain 200) and notifications: validate `clientState` (per-tenant random secret stored in MailboxSyncState — add column `clientState String?` in Task 1), then fire-and-forget `syncMailbox(tenantId)`. No auth middleware (external caller), CSRF-exempt like the AF inbound route.
- Subscription lifecycle: `ensureGraphSubscription(tenantId)` — create/renew `/v1.0/subscriptions` (resource `me/mailFolders('inbox')/messages`, `changeType: created,updated`, `notificationUrl: {API_BASE}/api/webhooks/graph-mail`, maxExpiry ~4230 min) — called from the sync job when subscriptionExpiry < now+1h. Failure logged, never fatal (webhooks are an accelerator; polling remains the guarantee).

Tests: job skips unconnected tenants; webhook echoes validation token; bad clientState 202-and-drop (log, no sync); subscription renewal triggered when near expiry.
Commit: `feat(mailbox): scheduled delta sync + Graph webhook receiver`

---

### Task 5: Routes — role gates, pagination, threads, attachments

**Files:** Modify `backend/src/routes/comms.ts` (+route tests).

- Apply role gates per Global Constraints (import `authorize` middleware as used elsewhere, e.g. routes/aml.ts).
- `GET /mailbox/messages` → `listMailboxMessages` with `q`,`unread`,`clientId`,`limit`(≤100),`cursor`; response `{messages, nextCursor}`.
- NEW `GET /mailbox/messages/:id/thread` → `getThread`.
- NEW `GET /mailbox/messages/:id/attachments/:attachmentId` → provider `fetchAttachment`, stream with `Content-Disposition: attachment; filename="<ASCII-sanitised>"` (reuse the sanitising approach from the AML doc route).
- `POST /mailbox/send` gains `cc?`, `replyToMessageId?`; validation zod.
- `POST /mailbox/messages/:id/read` body `{read: boolean}` (default true).
- `/context`, `/create-task`, `/assign-form` switch from 150-row scans to `getMessageContext`/direct DB lookups.
- `GET /mailbox/connection` now includes `health`.
- Keep `GET /inbox`, `GET /stats` shapes intact (unread count now DB-backed).

Tests: role gate 403 for unauthenticated/insufficient role on each mutating route; pagination cursor round-trip; thread endpoint returns conversation ordered asc; attachment route streams bytes and 404s cross-tenant.
Commit: `feat(mailbox): gated + paginated mailbox API with threads and attachments`

---

### Task 6: FirmInbox UI on the new API

**Files:** Modify `frontend/src/pages/inbox/FirmInbox.tsx` (+ small components if it helps clarity); tests for new pure helpers only.

- Message list uses server pagination (`nextCursor` → "Load more"), server `q` search and unread filter.
- Thread pane calls `/thread` (no client-side filtering).
- HTML bodies rendered via DOMPurify (`dompurify` is already a dependency): sanitize `bodyHtml`, fall back to `bodyText` pre-wrap.
- Attachments: list under the message; click → authed blob fetch → download (same pattern as AmlPartnerPanel).
- Compose/reply: CC field; reply carries `replyToMessageId`.
- Connection strip: show health — "Last synced X ago" / amber "Sync failing: <error> — reconnect in Settings → Email" when `lastSyncOk === false`.
- Keep the five-tab layout and existing testids; new testids: `mailbox-load-more`, `mailbox-attachment-<id>`, `mailbox-cc-input`, `mailbox-health-banner`.

Verify: frontend tsc + vitest green; visual smoke on dev stack (run-local skill; connection strip in local mode, list renders backfilled/seeded messages, reply box works against fallback path).
Commit: `feat(mailbox): FirmInbox on paginated two-way API (threads, attachments, health)`

---

### Task 7: Gmail provisioning docs + env declarations, scope-drift cleanup

**Files:** Modify `render.yaml` (declare `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` as sync:false), `backend/.env.example`; Modify `backend/src/services/emailService.ts` ONLY to align the Microsoft refresh scopes used by legacy SMTP send with the Graph scope set (or route mailbox replies exclusively through graphMailClient — whichever is smaller; do NOT refactor tenantMailer).

Also: docs note `docs/MAILBOX_TWO_WAY.md` — architecture, env vars, Graph subscription requirements (public HTTPS URL), Gmail console setup steps (William-gated), per-user mailboxes explicitly out of scope.
Commit: `chore(mailbox): Gmail env declarations, scope alignment, architecture doc`

---

### Task 8: Full verification + PR

- `cd backend && npx tsc --noEmit && npx jest` (full), `cd frontend && npx tsc --noEmit && npx vitest run`, `cd e2e-tests` build-smoke if runnable locally.
- Update `task_plan.md` scorecard line.
- Push `feat/mailbox-two-way`, `gh pr create` titled "Two-way mailbox: real mail model, provider send, delta sync" with a body summarising stages A–D and the two William-gated activations (Gmail creds, prod webhook URL check). Note CI-minutes outage if still ongoing.

## Self-review notes
- Recon gaps 1–18 → tasks: 1,2 (model, dedupe, indexes) T1/T3; 3 (account model) documented out-of-scope T7; 4–7 (sync) T2/T4; 8–11 (two-way correctness) T2/T3/T5/T6; 12–14 (tokens/scopes) T2/T7; 15–16 (roles/seed) T5/T3; 17 (inbound receipt) T4 webhook (+polling); 18 (client/job surfaces) partially via clientId links — full client-record mail tab out of scope, noted in T7 doc.
