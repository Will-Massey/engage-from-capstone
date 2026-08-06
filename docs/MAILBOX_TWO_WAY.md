# Two-Way Mailbox

The two-way mailbox lets a practice connect a real inbox (Microsoft 365/Outlook via
Graph, or Gmail via the Gmail API) to Engage so client email shows up alongside
jobs, proposals and portal activity, and replies sent from Engage land in the
practice's real Sent folder. This document covers the architecture, the
environment variables it needs, the Graph webhook requirements, and how to
activate Gmail for a tenant.

Out of scope for this build (see "Explicit out-of-scope" below): per-user
mailboxes, outbound attachments, and full `historyId`/delta edge cases.

## Data model

Three tables, defined in `backend/prisma/schema.prisma`:

- **`MailMessage`** — one row per synced email (inbound or outbound), keyed
  `(tenantId, provider, externalId)`. Stores the provider-neutral shape
  (addresses, subject, body text/HTML, `conversationId`,
  `internetMessageId`, read state) plus an optional `clientId`/`jobId` link.
  `conversationId` is the Graph `conversationId` or the Gmail `threadId`; it's
  what threads a conversation together for `getThread`.
- **`MailAttachment`** — child rows for `MailMessage`, storing provider
  attachment metadata (`externalId`, name, content type, size, inline flag).
  Content itself is never stored — it's fetched from the provider on demand
  (see "Attachments" below).
- **`MailboxSyncState`** — one row per tenant. Tracks the inbox/sent delta
  cursors (`inboxDeltaLink`/`sentDeltaLink` — a Graph `@odata.deltaLink` URL or
  a Gmail `history:<historyId>` marker), last sync outcome, and (Graph only)
  the webhook subscription id/expiry/`clientState`.

## Provider clients

`backend/src/services/mail/` holds two provider-neutral clients implementing
the `MailProviderClient` interface (`types.ts`): `syncInbox`, `syncSent`,
`send`, `markRead`, `fetchAttachment`.

- **`graphMailClient.ts`** — pure HTTP adapter over Microsoft Graph
  (`https://graph.microsoft.com/v1.0`). Token refresh requests scope
  `https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send offline_access`.
  Also owns the Graph webhook subscription lifecycle (`ensureGraphSubscription`)
  — see "Graph webhook" below.
- **`gmailMailClient.ts`** — googleapis transport. Token refresh is a direct
  POST to `https://oauth2.googleapis.com/token`; the Gmail API scopes granted
  at OAuth-consent time are `https://mail.google.com/`,
  `https://www.googleapis.com/auth/gmail.modify`,
  `https://www.googleapis.com/auth/gmail.send`, and
  `https://www.googleapis.com/auth/userinfo.email` (see `EmailService.generateGmailAuthUrl`
  in `backend/src/services/emailService.ts`).

Both clients read per-tenant OAuth credentials (`clientId`/`clientSecret`/
`refreshToken`) via `loadTenantEmailContext` (`tenantEmailSettings.ts`), which
decrypts them from `Tenant.settings.email.{outlook,gmail}` — encrypted at
rest with the same envelope as the rest of tenant settings. Neither client
touches Prisma directly except `ensureGraphSubscription`, which needs a DB row
to renew the webhook subscription against.

`mailboxService.ts` is the orchestration layer: it picks the right client via
`normalizeMailProvider(tenant.settings.email.provider)` +
`buildProviderClient`, upserts synced messages into `MailMessage`
(idempotent — attachments are dropped and rewritten on every re-sync rather
than accumulated), auto-links a `clientId` by matching the from/to address
against `Client.contactEmail`, and exposes `syncMailbox`,
`listMailboxMessages`, `getThread`, `sendMailboxMessage`, `markMailboxRead`,
`linkMessageClient`, and `fetchMailAttachment` to `backend/src/routes/comms.ts`.

## Sync job + Graph webhook

**Scheduled sync** (`backend/src/jobs/mailboxSyncJob.ts`, wired in
`backend/src/app/jobs.ts` via `scheduleMailboxSync`) is the sync *guarantee*.
It runs every `MAILBOX_SYNC_INTERVAL_MS` (default 600000ms / 10 minutes,
first tick after 7 minutes), iterates every active tenant with a recognised
`settings.email.provider` (`gmail`/`outlook`/`microsoft365`), and calls
`syncMailbox(tenantId)` per tenant with an individual try/catch so one broken
mailbox never blocks the rest. For Graph-connected tenants it also renews the
webhook subscription when it's missing or within an hour of expiry.

**Graph webhook** (`backend/src/routes/webhooks/graph-mail.ts`, mounted at
`/api/webhooks/graph-mail`, CSRF-exempt like the Cloudflare email webhook) is
the *accelerator*. Microsoft Graph mail subscriptions cap out at 4230 minutes
(~2.94 days), so `ensureGraphSubscription` (in `graphMailClient.ts`) creates
or renews a subscription against `me/mailFolders('inbox')/messages` with a
random `clientState` UUID, persisted to `MailboxSyncState`. The webhook route
handles Graph's validation handshake (echoes `validationToken` as
`text/plain` 200) and, on a real change notification, looks up the tenant by
matching `clientState` against `MailboxSyncState`, then fires
`syncMailbox(tenantId)` without awaiting it (ack stays fast; Graph disables a
subscription that repeatedly gets a non-2xx response). A lookup failure or
sync failure is logged and dropped, never bubbled into a 500 — because the
scheduled job remains the guarantee, a missed webhook notification is caught
on the next poll.

Gmail has no equivalent push webhook in this build — Gmail mailboxes rely
entirely on the scheduled poll, using the `historyId`-based incremental sync
in `gmailMailClient.ts` (falls back to a full sync when there's no stored
delta cursor).

## Send paths

`sendMailboxMessage` (`mailboxService.ts`) tries three things in order:

1. **Provider send** — if the tenant has a connected mailbox
   (`buildProviderClient` returns a client), send goes out through
   `providerClient.send()` (Graph `/me/sendMail` or `/me/messages/{id}/reply`,
   or Gmail `users.messages.send`). This is a *real* send from the practice's
   actual mailbox.
2. **`tenantMailerSend` fallback** — if no mailbox is connected, the message
   still needs to leave the building, so `sendMailboxMessageInternal` falls
   back to `tenantMailerSend` (`backend/src/services/tenantMailer.ts`), the
   same tenant-configurable sending path used for proposals, portal links, and
   other app email. This is not part of the two-way mailbox proper — it's
   the safety net so "reply" always works even for tenants who haven't
   connected a mailbox.
3. Either way, an `OUTBOUND` `MailMessage` row is always written, so the
   practice always has a local record of what was sent — even if the
   provider or fallback send itself failed (`sent: false` is recorded on the
   row's surrounding response, but the history entry is never lost).

### Coexistence with the legacy `emailService.ts` SMTP path

`backend/src/services/emailService.ts` is a separate, older module that
refreshes Microsoft tokens with scope
`https://outlook.office365.com/SMTP.Send offline_access` and sends through a
nodemailer SMTP transport. It is **not** part of the two-way mailbox — it
predates it. It still serves one purpose: providing the SMTP transport for
`tenantMailer.ts` when a tenant has connected Outlook as their *sending*
provider (as opposed to their two-way *mailbox* provider) via
`tenantMailerSend`. The two modules read overlapping but distinct OAuth state
(`emailService.ts`'s `createEmailService()` reads platform-wide
`OUTLOOK_CLIENT_ID`/`OUTLOOK_REFRESH_TOKEN`-style env vars for a legacy
single-account mode; the two-way mailbox reads per-tenant encrypted
`Tenant.settings.email.outlook` credentials via `tenantEmailSettings.ts`).
This is a deliberate scope decision, not an oversight: Microsoft's SMTP-OAuth
deprecation is a future concern, `emailService.ts`'s SMTP path is not part of
mailbox sync/read, and touching it was out of scope for this build. If it
ever needs to be retired or realigned, do that as its own piece of work.

Note that `oauthCallback.ts` and `routes/email.ts` do share the
`GMAIL_CLIENT_ID`/`GMAIL_CLIENT_SECRET` and `MICROSOFT_CLIENT_ID`/
`MICROSOFT_CLIENT_SECRET` env vars as the **platform-level OAuth app
credentials** for the tenant "connect your mailbox" flow — this is separate
again from `emailService.ts`'s `GMAIL_CLIENT_ID` read inside
`createEmailService()`, which drives its own legacy env-configured
`EmailService` instance. Same env vars, two different call sites, only one of
which (`oauthCallback.ts` / `routes/email.ts`) is part of the two-way mailbox.

## Environment variables

| Variable | Where declared | Purpose |
| --- | --- | --- |
| `GMAIL_CLIENT_ID` | `render.yaml` (`sync: false`), `backend/.env.example` | Google Cloud OAuth client id for the platform-level "connect Gmail" flow (`oauthCallback.ts`, `routes/email.ts`). |
| `GMAIL_CLIENT_SECRET` | `render.yaml` (`sync: false`), `backend/.env.example` | Matching OAuth client secret. Encrypted into `Tenant.settings.email.gmail.clientSecret` at connect time. |
| `MICROSOFT_CLIENT_ID` | `render.yaml` (`sync: false`, pre-existing) | Azure AD app registration id for the Graph "connect Outlook/Microsoft 365" flow. |
| `MICROSOFT_CLIENT_SECRET` | `render.yaml` (`sync: false`, pre-existing) | Matching app secret. |
| `MICROSOFT_TENANT_ID` | `render.yaml` (`sync: false`, pre-existing) | Azure tenant id, if the app registration is single-tenant. |
| `MAILBOX_SYNC_INTERVAL_MS` | `render.yaml` (literal `'600000'`), `backend/.env.example` | Scheduled sync interval, read in `backend/src/app/jobs.ts`. Declared with a visible default so a Blueprint sync can't silently drop it. |
| `API_URL` | `render.yaml` (pre-existing, `https://capstonesoftware.co.uk/engage`) | Must be a public HTTPS URL — it's the base for the Graph webhook `notificationUrl` (`{API_URL}/api/webhooks/graph-mail`) and the OAuth redirect URIs (`{API_URL}/api/oauth/callback/{gmail,outlook,microsoft365}`). |

## Graph webhook requirements

- **Public HTTPS `API_URL`.** Graph will only deliver notifications to a
  publicly reachable HTTPS endpoint — `API_URL` (already set to
  `https://capstonesoftware.co.uk/engage` in production) must resolve and be
  reachable from Microsoft's servers before a subscription can be created.
  Local dev cannot receive real Graph webhooks; rely on the scheduled poll
  there.
- **Subscription is auto-created/renewed by the sync job**, not by any
  manual step. `ensureGraphSubscription` is called from
  `runMailboxSyncJob`'s `renewGraphSubscriptionIfNeeded` whenever a tenant's
  stored `subscriptionExpiry` is missing or within an hour of expiring.
  Nothing needs to be provisioned in the Azure portal beyond the app
  registration itself (`MICROSOFT_CLIENT_ID`/`SECRET`, `Mail.ReadWrite` +
  `Mail.Send` + `offline_access` delegated scopes, redirect URI
  `{API_URL}/api/oauth/callback/microsoft365` or `/outlook` registered).
- **Failure is always non-fatal.** A subscription create/renew failure is
  logged and swallowed (`ensureGraphSubscription` never throws) — the
  scheduled poll is the guarantee, the webhook is purely a latency
  accelerator.

## Gmail activation steps (William-gated)

Gmail needs a Google Cloud OAuth client provisioned once, then the resulting
credentials go into the Render dashboard (not committed — `sync: false`).

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   create (or reuse) a project, enable the **Gmail API**, and create an
   **OAuth 2.0 Client ID** (type: Web application).
2. Add the authorised redirect URI:
   `https://capstonesoftware.co.uk/engage/api/oauth/callback/gmail`
   (must match `oauthCallback.ts`'s `redirectUri` exactly).
3. Configure the OAuth consent screen with these scopes (matches
   `EmailService.generateGmailAuthUrl` in `emailService.ts`):
   - `https://mail.google.com/`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/userinfo.email`
   Google will flag `https://mail.google.com/` as a restricted scope —
   verification is required before the app can be used outside test mode with
   real (non-test) Google accounts.
4. Copy the client id/secret into the Render dashboard as
   `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` on `engage-backend` (they're
   declared `sync: false` in `render.yaml` specifically so a Blueprint sync
   never deletes a dashboard-set value).
5. A practice then connects Gmail themselves from Engage settings — the
   `/api/email/auth/gmail/url` → Google consent → `/api/oauth/callback/gmail`
   round trip stores the per-tenant refresh token encrypted in
   `Tenant.settings.email.gmail`. No further server-side step is needed per
   tenant.

This step (Cloud project + OAuth client + consent screen + verification) is
gated on William — it requires a Google Cloud account and (for production
use beyond test users) Google's OAuth verification review.

## Attachments

Attachment content is never persisted — `MailAttachment` stores only
provider metadata. `fetchMailAttachment` (`mailboxService.ts`) resolves the
row, then calls the provider client's `fetchAttachment(messageExternalId,
attachmentExternalId)` to stream the bytes live from Graph or Gmail on each
request.

## Explicit out-of-scope

- **Per-user mailboxes.** The mailbox is connected once per tenant (one
  Graph/Gmail OAuth grant per practice), not per staff member. There is no
  concept of "my inbox" vs. "the firm's inbox."
- **Outbound attachments.** `sendMailboxMessage`/`SendSpec` has no attachment
  field — replies sent from Engage are text-only. Inbound attachments are
  readable (see above); composing with an attachment is not supported.
- **Full `historyId`/delta edge cases.** Gmail's `history.list` can return
  `404` when a `startHistoryId` is too old (Gmail prunes history after ~7
  days); `gmailMailClient.ts` does not special-case this — a stale delta
  cursor will surface as a sync error via the normal try/catch in
  `syncMailbox`, not a targeted fall-back to a fresh full sync. Similarly,
  Graph delta queries that 410 Gone (an expired delta token) aren't
  special-cased. Both would need to be handled by clearing the stored
  delta link and re-running a full sync — left for a future pass if it's
  observed in practice.
