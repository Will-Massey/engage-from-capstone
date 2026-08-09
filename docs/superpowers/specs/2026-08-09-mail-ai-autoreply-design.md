# AI autoreply for the Engage mailbox — design

**Date:** 2026-08-09
**Status:** approved (William, brainstorm session)
**Feature:** opt-in AI replies to client email in the two-way mailbox, weighted
toward genuine UK accounts/bookkeeping capability.

## Problem

The two-way mailbox (`docs/MAILBOX_TWO_WAY.md`) brings a practice's real inbox
into Engage, but every reply is still typed by hand. A small practice spends a
material part of its week answering client email that is either routine
logistics ("where do I send the bank statements?") or standard accounting
questions ("do I need to register for VAT yet?"). Both are answerable from
context Engage already holds: the client record, their open jobs, proposals and
document requests, and the thread itself.

The competitor framing matters too. Engager wins on breadth; Clara/Athena is
Engage's differentiator. An inbox that drafts a knowledgeable reply — not a
generic "thanks, we'll get back to you" — puts the AI where the practice feels
the work.

## Decisions (William, this session)

| Question                           | Decision                                                                                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What happens to a generated reply? | **Draft-first, auto-send as a separate second opt-in.** Every tenant starts in draft mode.                                                                           |
| How much accounting capability?    | **Knowledgeable but number-shy.** Real expertise on concepts, processes and deadlines; never computes client-specific figures, never commits the firm to a position. |
| Which inbound qualifies?           | **Known clients only** — the message must be linked to a `Client` row.                                                                                               |
| Does the reply disclose it is AI?  | **No.** It reads as the practice's own voice. In draft mode a human approved it; in auto mode the practice opted in knowing what it is.                              |

The number-shy rule mirrors the core constraint of Narrative, our management-
accounts product ("AI never computes numbers"), and exists for the same reason:
a wrong figure in a client's inbox is a professional-liability event, not a UX
bug.

## Architecture

Chosen approach: **sync-hook pipeline with Engage-stored drafts.**

```
provider (Graph/Gmail)
  → syncMailbox()                     [existing]
      → upsertProviderMessage() → 'created'          [existing]
      → collect created INBOUND message ids
  → after sync state is committed:
      → mailAutoReplyService.processNewInbound(ids)  [new, fire-and-forget]
          → eligibility gate
          → context assembly (thread + client + work + tone)
          → chatCompletion() under checkAiTokenBudget()
          → MailAiReplyDraft row (status: pending)
          → auto mode only: send guards → sendMailboxMessage()  [existing]
```

Two alternatives were considered and rejected:

- **On-demand only** ("suggest reply" button per thread). Simpler and zero idle
  spend, but it is not an autoreply: nothing exists until a human opens the
  thread, and auto-send could not exist at all.
- **Provider-native drafts** (write real drafts into Outlook/Gmail). Feels
  native but moves the approval surface out of Engage — no guardrail UI, no
  audit trail — and the two providers' draft APIs diverge. The #108 mailbox
  work already had to add best-effort cleanup for stranded Graph drafts.

### Why the hook lands where it does

`syncMailboxInternal` already loops every provider message through
`upsertProviderMessage`, which returns `'created' | 'updated'`
(`backend/src/services/mailboxService.ts`). Collecting the created-and-inbound
ids in that loop gives exactly-once semantics for free: a re-sync of the same
message returns `'updated'` and never re-triggers generation. Both the
10-minute scheduled job and the Graph webhook converge on this one function, so
one hook covers both paths.

Generation runs **after** the `MailboxSyncState` write and is fire-and-forget
(`void promise.catch(log)`), so an AI failure can never mark a healthy sync as
failed — the same isolation principle as the sync job's per-tenant try/catch.

## Data model

One new table (additive migration, no changes to existing models):

```prisma
model MailAiReplyDraft {
  id                String    @id @default(uuid())
  tenantId          String
  inboundMessageId  String    @unique   // one draft per inbound message, ever
  conversationId    String
  clientId          String?
  subject           String
  bodyText          String    @db.Text
  status            String    @default("pending") // pending|sent|dismissed|failed
  sentMessageId     String?
  generationMeta    String?   @db.Text  // JSON: model, token counts, guard notes
  error             String?
  createdAt         DateTime  @default(now())
  decidedAt         DateTime?
  decidedByUserId   String?

  @@index([tenantId, status])
  @@index([tenantId, conversationId])
}
```

`inboundMessageId` is unique — the idempotency guarantee that survives
re-sync, webhook bursts and job overlap. `MailMessage` stays a pure mirror of
provider state; drafts live entirely Engage-side until approved and sent.

## Settings and opt-in

Per-tenant, in `Tenant.settings.mailAutoReply` (the established idiom —
`automationSchedule`, `accountFlowMesh` and `practiceForms` all live there):

```json
{ "enabled": false, "mode": "draft", "businessHoursOnly": true }
```

Absent key = off. Surfaced in Settings → Communications:

1. **Enable AI replies** → `enabled: true, mode: 'draft'`. Drafts appear in the
   inbox for approval. No client ever receives anything unreviewed.
2. **Send approved-style replies automatically** → `mode: 'auto'`, behind a
   confirm dialog that states plainly that clients will receive replies no one
   read first. Modelled on the automation-schedule opt-in (PR #104), which was
   built this way after the `chaseSequenceEnabled`-defaults-true lesson.

Both writes are senior-role gated (`ADMIN`/`PARTNER`/`MD`) and audit-logged.
Default is off for every tenant, including existing ones.

## Generation

**Context assembled per reply** (all already available):

- the thread via `getThread`, most recent 10 messages, each body trimmed to
  4000 characters (bounded context — a long thread must not blow the budget),
- the `Client` row and, when present, their open jobs, live proposals and
  outstanding document requests — the same shape `aiContextBuilder` already
  assembles for proposal AI,
- the practice's own previous replies in that thread, used as tone reference,
- practice identity (name, the signing user's name where known).

**One `chatCompletion` call**, gated by the existing `checkAiTokenBudget`
(`backend/src/services/ai/aiClient.ts`), so mailbox replies share the tenant's
monthly AI budget rather than inventing a second spend ceiling.

**System prompt — the capability weighting.** The prompt is explicit that the
model is drafting as a UK accountancy practice and should be genuinely useful
on:

- VAT (registration thresholds, schemes — flat rate, cash, annual — and what
  changes on each), MTD for VAT and ITSA including who is in scope and when,
- CIS (verification, deduction rates, monthly returns, gross payment status),
- self assessment and corporation tax deadlines, payments on account, PAYE/RTI
  and auto-enrolment basics,
- bookkeeping practice: what records to keep and for how long, allowable vs
  disallowable expenditure in general terms, how the practice's own processes
  work (portal uploads, records requests, year-end flow).

And equally explicit about the line it never crosses:

- **never state or compute a figure specific to this client** — no tax due, no
  refund estimate, no liability, no "you'll owe roughly…",
- never commit the practice to a filing position, a deadline promise, or fee,
- never contradict or override something the accountant said earlier in the
  thread,
- when the question needs any of the above, write a competent, specific holding
  reply that shows the question was understood and names what the accountant
  will confirm — never a content-free acknowledgement.

Output is plain text in the practice's voice, no AI sign-off, no invented
attachments or links beyond the client's real portal link when relevant.

## Inbox UI

`FirmInbox` thread view gains a **Suggested reply** card when a `pending` draft
exists for the newest inbound message in that thread:

- body preview (scrollable, never truncated silently),
- **Approve & send** → existing send path, draft stamped `sent`,
- **Edit then send** → the body drops into the existing reply composer,
  pre-filled; sending from there marks the draft `sent` with the edited text
  recorded,
- **Dismiss** → `dismissed`, no send, no regeneration.

The message list marks threads holding a pending draft with a small badge, so a
practice in draft mode can see at a glance where the AI has done work. No new
page and no new navigation entry.

Junior roles may view a draft but not send it (consistent with the existing
outbound role gates; juniors can clear unread but not send).

## Guardrails

Applied in both modes unless noted.

**Eligibility (skip generation entirely):**

- tenant opt-in absent or `enabled: false`,
- message is not `INBOUND`, or has no linked `clientId`,
- sender is the practice's own connected address, or looks automated:
  `Auto-Submitted`, `Precedence: bulk`, `List-Unsubscribe` headers, or a
  `no-reply`/`noreply`/`mailer-daemon`/`postmaster` local part,
- a draft already exists for that `inboundMessageId` (unique constraint is the
  backstop; the check avoids the wasted call),
- the tenant's AI token budget is exhausted.

**Send guards (auto mode only, checked immediately before sending):**

- at most **one AI-sent reply per conversation per 4 hours** — the bot-loop
  damper: two autoresponders cannot ping-pong,
- **UK business hours only** (Mon–Fri, 08:00–18:00 Europe/London) when
  `businessHoursOnly` is true, with a 2–5 minute randomised delay so replies do
  not arrive suspiciously instantly; outside hours the draft simply waits as a
  pending draft,
- if any guard fails, the draft stays `pending` for a human — auto mode
  degrades to draft mode rather than dropping the work.

**Failure handling:** generation errors mark the draft row `failed` with the
error and never surface as a mailbox sync failure. The existing mailbox health
banner gains a quiet line when the most recent AI generation failed.

## Testing

- **`mailAutoReplyService` unit tests**: the eligibility matrix (one case per
  guard above), idempotency on re-sync, draft-mode stops before send, auto-mode
  calls the send path with the right spec, budget exhaustion degrades cleanly,
  unrelated tenant settings keys survive a settings write.
- **Prompt-shape test**: asserts the number-shy constraints are present in the
  assembled system prompt — the one instruction whose absence is a liability
  event rather than a bug.
- **Send-guard tests**: conversation cooldown, business-hours window (fixed
  clock), and that a failing guard leaves the draft `pending`.
- **Route tests**: approve / edit-send / dismiss including role gates and
  tenant scoping; settings PUT rejects an unknown `mode` and is role-gated.
- **Frontend helper tests** for the draft-card state logic, following the
  `mailboxHelpers` extracted-helper pattern (this repo has no component-test
  infrastructure).

E2E specs are untouched — the feature is off by default, so no existing journey
changes.

## Out of scope

- Per-user mailboxes (already out of scope for the mailbox itself).
- Outbound attachments generated by the AI.
- Replies to unknown senders or prospect enquiries.
- Any client-specific number, refund figure, or filing position — by design,
  not by omission.
- A separate AI spend ceiling for mail; it shares the tenant AI budget.
- Learning from edits (a future improvement: compare `bodyText` with what was
  actually sent to tune tone).

## Rollout

Ships off. The first real tenant is Fortis, in draft mode, watched for a week
before auto mode is offered to anyone. Because the feature is per-tenant and
default-absent, merging it changes nothing for any existing practice.
