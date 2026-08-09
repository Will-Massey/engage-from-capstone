# AI Mailbox Autoreply Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opt-in AI replies to client email in the Engage mailbox — drafts by default, auto-send behind a second explicit opt-in, genuinely capable on UK accounts/bookkeeping but never computing a client-specific figure.

**Architecture:** A new `mailAutoReplyService` is invoked fire-and-forget from `syncMailboxInternal` with the ids of newly-created INBOUND messages. It gates on tenant settings and eligibility, assembles thread + client context, calls `chatCompletion` under the existing tenant AI budget, and writes a `MailAiReplyDraft` row. In draft mode it stops there; in auto mode it applies send guards and calls the existing `sendMailboxMessage`. The inbox surfaces pending drafts for approve / edit / dismiss.

**Tech Stack:** Node 20, TypeScript (ESM, `.js` import specifiers), Express, Prisma + Postgres, Jest (backend), React 18 + Vite + zustand + Tailwind (frontend), Vitest (frontend).

Spec: `docs/superpowers/specs/2026-08-09-mail-ai-autoreply-design.md`.

## Global Constraints

- **Never push to master.** Branch is `feat/mail-autoreply`; PR → CI green → merge.
- **Format first, then lint.** CI runs `prettier --check .` and `eslint src` repo-wide at `--max-warnings 0`. `prettier --check` is unreliable on this Windows box (CRLF false positives) — run `npx prettier --write` on touched files instead.
- **Backend imports use `.js` specifiers** (`import { prisma } from '../config/database.js'`).
- **Tenant scoping on every query**: `where: { id, tenantId }`. No exceptions.
- **Money/AI idioms**: zod for input validation, `asyncHandler` + `ApiError` for routes, `authenticate` + `authorize(...)` middleware.
- **Settings writes must preserve unrelated keys** — read-modify-write of `Tenant.settings` JSON, never a blind overwrite.
- **Feature ships OFF.** Absent `settings.mailAutoReply` means disabled for every existing tenant.
- **The AI never states or computes a client-specific figure.** This is the load-bearing constraint of the whole feature.
- Migrations are additive and idempotent-safe (they run fail-closed at container boot).
- Test commands: backend `cd backend && npx jest <path> --forceExit`; frontend `cd frontend && npx vitest run <path>`; typecheck `npx tsc --noEmit` in each workspace (run `npm run build:shared` from the root first if shared types changed).

---

## File Structure

**Create:**

- `backend/src/services/mailAutoReply/eligibility.ts` — pure predicate functions (settings parsing, automated-sender detection, business hours). No I/O, so it is trivially testable.
- `backend/src/services/mailAutoReply/prompt.ts` — system-prompt construction and context formatting. Isolated because the prompt is the feature's liability surface and gets its own test.
- `backend/src/services/mailAutoReply/index.ts` — the orchestrator (`processNewInboundMessages`, `approveDraft`, `dismissDraft`). Owns all Prisma and AI calls.
- `backend/src/services/mailAutoReply/__tests__/eligibility.test.ts`
- `backend/src/services/mailAutoReply/__tests__/prompt.test.ts`
- `backend/src/services/mailAutoReply/__tests__/autoReplyService.test.ts`
- `backend/src/routes/__tests__/mailAutoReplyRoutes.test.ts`
- `backend/prisma/migrations/20260809120000_mail_ai_reply_draft/migration.sql`
- `frontend/src/pages/inbox/aiReplyHelpers.ts` + `__tests__/aiReplyHelpers.test.ts`
- `frontend/src/pages/inbox/AiReplyCard.tsx`

**Modify:**

- `backend/prisma/schema.prisma` — add `MailAiReplyDraft`.
- `backend/src/services/mailboxService.ts` — collect created inbound ids; fire-and-forget hook after sync state write.
- `backend/src/routes/comms.ts` — draft list/approve/dismiss endpoints.
- `backend/src/routes/tenants/*` (settings PUT) — accept `mailAutoReply`.
- `frontend/src/pages/inbox/FirmInbox.tsx` — render `AiReplyCard`, badge threads with pending drafts.
- `frontend/src/pages/Settings.tsx` — Communications section opt-in + auto-mode confirm dialog.
- `docs/MAILBOX_TWO_WAY.md` — document the feature.

Split rationale: `eligibility` and `prompt` are pure and heavily tested; `index` holds the I/O. `FirmInbox.tsx` is already large, so the card is its own component and its state logic lives in a helper module (this repo has no component-test infrastructure — extracted-helper tests are the established pattern, per `mailboxHelpers.test.ts`).

---

### Task 1: Data model — `MailAiReplyDraft`

**Files:**

- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260809120000_mail_ai_reply_draft/migration.sql`

**Interfaces:**

- Consumes: nothing.
- Produces: Prisma model `MailAiReplyDraft` with fields `id, tenantId, inboundMessageId (unique), conversationId, clientId, subject, bodyText, status, sentMessageId, generationMeta, error, createdAt, decidedAt, decidedByUserId`.

- [ ] **Step 1: Add the model to the schema**

Append to `backend/prisma/schema.prisma`:

```prisma
model MailAiReplyDraft {
  id               String    @id @default(uuid())
  tenantId         String
  inboundMessageId String    @unique
  conversationId   String
  clientId         String?
  subject          String
  bodyText         String    @db.Text
  status           String    @default("pending")
  sentMessageId    String?
  generationMeta   String?   @db.Text
  error            String?
  createdAt        DateTime  @default(now())
  decidedAt        DateTime?
  decidedByUserId  String?

  @@index([tenantId, status])
  @@index([tenantId, conversationId])
  @@map("mail_ai_reply_drafts")
}
```

- [ ] **Step 2: Write the migration by hand**

Create `backend/prisma/migrations/20260809120000_mail_ai_reply_draft/migration.sql`:

```sql
CREATE TABLE IF NOT EXISTS "mail_ai_reply_drafts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inboundMessageId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "clientId" TEXT,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentMessageId" TEXT,
    "generationMeta" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedByUserId" TEXT,
    CONSTRAINT "mail_ai_reply_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mail_ai_reply_drafts_inboundMessageId_key"
    ON "mail_ai_reply_drafts"("inboundMessageId");
CREATE INDEX IF NOT EXISTS "mail_ai_reply_drafts_tenantId_status_idx"
    ON "mail_ai_reply_drafts"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "mail_ai_reply_drafts_tenantId_conversationId_idx"
    ON "mail_ai_reply_drafts"("tenantId", "conversationId");
```

- [ ] **Step 3: Generate the client and verify it compiles**

Run: `cd backend && npx prisma generate && npx tsc --noEmit`
Expected: generate succeeds, tsc exits 0.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(mail-autoreply): MailAiReplyDraft model + additive migration"
```

---

### Task 2: Eligibility predicates (pure)

**Files:**

- Create: `backend/src/services/mailAutoReply/eligibility.ts`
- Test: `backend/src/services/mailAutoReply/__tests__/eligibility.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `type MailAutoReplySettings = { enabled: boolean; mode: 'draft' | 'auto'; businessHoursOnly: boolean }`
  - `parseMailAutoReplySettings(settingsJson?: string | null): MailAutoReplySettings`
  - `isAutomatedSender(fromAddress: string, subject: string): boolean`
  - `isWithinBusinessHours(now: Date): boolean`

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/mailAutoReply/__tests__/eligibility.test.ts`:

```ts
import {
  parseMailAutoReplySettings,
  isAutomatedSender,
  isWithinBusinessHours,
} from '../eligibility.js';

describe('parseMailAutoReplySettings', () => {
  it('defaults to disabled draft mode when the key is absent', () => {
    expect(parseMailAutoReplySettings('{}')).toEqual({
      enabled: false,
      mode: 'draft',
      businessHoursOnly: true,
    });
  });

  it('defaults to disabled on malformed JSON', () => {
    expect(parseMailAutoReplySettings('not json').enabled).toBe(false);
    expect(parseMailAutoReplySettings(null).enabled).toBe(false);
  });

  it('reads an enabled auto-mode tenant', () => {
    const json = JSON.stringify({
      mailAutoReply: { enabled: true, mode: 'auto', businessHoursOnly: false },
    });
    expect(parseMailAutoReplySettings(json)).toEqual({
      enabled: true,
      mode: 'auto',
      businessHoursOnly: false,
    });
  });

  it('coerces an unknown mode to draft — never silently auto-sends', () => {
    const json = JSON.stringify({ mailAutoReply: { enabled: true, mode: 'yolo' } });
    expect(parseMailAutoReplySettings(json).mode).toBe('draft');
  });
});

describe('isAutomatedSender', () => {
  it.each([
    'no-reply@xero.com',
    'noreply@hmrc.gov.uk',
    'donotreply@bank.co.uk',
    'MAILER-DAEMON@mail.example.com',
    'postmaster@example.com',
    'bounce+123@sendgrid.net',
  ])('flags %s', (addr) => {
    expect(isAutomatedSender(addr, 'Anything')).toBe(true);
  });

  it.each([
    ['ada@acme.co.uk', 'Automatic reply: Year end'],
    ['ada@acme.co.uk', 'Out of office'],
    ['ada@acme.co.uk', 'Undeliverable: your message'],
  ])('flags %s by subject %s', (addr, subject) => {
    expect(isAutomatedSender(addr, subject)).toBe(true);
  });

  it('does not flag a real client writing normally', () => {
    expect(isAutomatedSender('Ada Lovelace <ada@acme.co.uk>', 'VAT question')).toBe(false);
  });
});

describe('isWithinBusinessHours', () => {
  it('accepts a weekday mid-morning and rejects night, weekend and 18:00 exactly', () => {
    expect(isWithinBusinessHours(new Date('2026-08-11T09:30:00Z'))).toBe(true); // Tue
    expect(isWithinBusinessHours(new Date('2026-08-11T03:00:00Z'))).toBe(false);
    expect(isWithinBusinessHours(new Date('2026-08-09T10:00:00Z'))).toBe(false); // Sun
    expect(isWithinBusinessHours(new Date('2026-08-11T17:00:00Z'))).toBe(false); // 18:00 BST
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/services/mailAutoReply/__tests__/eligibility.test.ts --forceExit`
Expected: FAIL — cannot find module `../eligibility.js`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/services/mailAutoReply/eligibility.ts`:

```ts
/**
 * Pure predicates for the AI autoreply gate. No I/O — every branch here is a
 * reason a client email does NOT get an AI reply, so each one is unit tested.
 */

export type MailAutoReplyMode = 'draft' | 'auto';

export type MailAutoReplySettings = {
  enabled: boolean;
  mode: MailAutoReplyMode;
  businessHoursOnly: boolean;
};

export const MAIL_AUTO_REPLY_DEFAULTS: MailAutoReplySettings = {
  enabled: false,
  mode: 'draft',
  businessHoursOnly: true,
};

/** Absent key, malformed JSON, or an unknown mode all mean "off / draft". */
export function parseMailAutoReplySettings(settingsJson?: string | null): MailAutoReplySettings {
  try {
    const raw = JSON.parse(settingsJson || '{}')?.mailAutoReply;
    if (!raw || typeof raw !== 'object') return { ...MAIL_AUTO_REPLY_DEFAULTS };
    return {
      enabled: raw.enabled === true,
      mode: raw.mode === 'auto' ? 'auto' : 'draft',
      businessHoursOnly: raw.businessHoursOnly !== false,
    };
  } catch {
    return { ...MAIL_AUTO_REPLY_DEFAULTS };
  }
}

const AUTOMATED_LOCAL_PARTS = [
  'no-reply',
  'noreply',
  'donotreply',
  'do-not-reply',
  'mailer-daemon',
  'postmaster',
  'bounce',
];

const AUTOMATED_SUBJECT_PREFIXES = [
  'automatic reply',
  'auto-reply',
  'out of office',
  'undeliverable',
  'delivery status notification',
];

/** Extract the bare address from "Name <a@b>" or "a@b". */
function bareAddress(input: string): string {
  const match = input.match(/<([^>]+)>/);
  return (match ? match[1] : input).trim().toLowerCase();
}

export function isAutomatedSender(fromAddress: string, subject: string): boolean {
  const addr = bareAddress(fromAddress || '');
  const local = addr.split('@')[0] || '';
  if (AUTOMATED_LOCAL_PARTS.some((p) => local.includes(p))) return true;

  const subj = (subject || '').trim().toLowerCase();
  return AUTOMATED_SUBJECT_PREFIXES.some((p) => subj.startsWith(p));
}

/**
 * Mon–Fri 08:00–17:59 Europe/London. Uses the Intl timezone so BST/GMT is
 * handled without a date library.
 */
export function isWithinBusinessHours(now: Date): boolean {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '-1');
  if (['Sat', 'Sun'].includes(weekday)) return false;
  return hour >= 8 && hour < 18;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest src/services/mailAutoReply/__tests__/eligibility.test.ts --forceExit`
Expected: PASS, all cases.

- [ ] **Step 5: Format, lint, commit**

```bash
npx prettier --write backend/src/services/mailAutoReply
npx eslint backend/src/services/mailAutoReply --max-warnings 0
git add backend/src/services/mailAutoReply
git commit -m "feat(mail-autoreply): eligibility predicates (settings, automated senders, business hours)"
```

---

### Task 3: Prompt construction

**Files:**

- Create: `backend/src/services/mailAutoReply/prompt.ts`
- Test: `backend/src/services/mailAutoReply/__tests__/prompt.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `type AutoReplyContext = { practiceName: string; clientName: string | null; clientContactName: string | null; openJobs: string[]; openProposals: string[]; outstandingRequests: string[]; thread: { direction: 'inbound' | 'outbound'; from: string; at: string; body: string }[] }`
  - `buildAutoReplyMessages(ctx: AutoReplyContext): { role: 'system' | 'user'; content: string }[]`
  - `THREAD_MESSAGE_LIMIT = 10`, `THREAD_BODY_CHAR_LIMIT = 4000`

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/mailAutoReply/__tests__/prompt.test.ts`:

```ts
import {
  buildAutoReplyMessages,
  THREAD_MESSAGE_LIMIT,
  THREAD_BODY_CHAR_LIMIT,
  type AutoReplyContext,
} from '../prompt.js';

const ctx = (over: Partial<AutoReplyContext> = {}): AutoReplyContext => ({
  practiceName: 'Fortis Bookkeeping',
  clientName: 'Acme Ltd',
  clientContactName: 'Ada',
  openJobs: ['VAT return Q2'],
  openProposals: [],
  outstandingRequests: ['Bank statements'],
  thread: [
    {
      direction: 'inbound',
      from: 'ada@acme.co.uk',
      at: '2026-08-09T09:00:00Z',
      body: 'Do I need to register for VAT yet?',
    },
  ],
  ...over,
});

describe('buildAutoReplyMessages', () => {
  it('carries the number-shy constraints in the system prompt', () => {
    const system = buildAutoReplyMessages(ctx())[0].content.toLowerCase();
    expect(system).toContain('never');
    expect(system).toMatch(/figure|amount|calculat/);
    expect(system).toContain('holding reply');
  });

  it('names the accounting domains it should be capable in', () => {
    const system = buildAutoReplyMessages(ctx())[0].content.toLowerCase();
    for (const topic of ['vat', 'mtd', 'cis', 'self assessment', 'payroll']) {
      expect(system).toContain(topic);
    }
  });

  it('includes practice, client and open work in the user message', () => {
    const user = buildAutoReplyMessages(ctx())[1].content;
    expect(user).toContain('Fortis Bookkeeping');
    expect(user).toContain('Acme Ltd');
    expect(user).toContain('VAT return Q2');
    expect(user).toContain('Bank statements');
    expect(user).toContain('Do I need to register for VAT yet?');
  });

  it('caps the thread at the most recent N messages', () => {
    const many = Array.from({ length: THREAD_MESSAGE_LIMIT + 5 }, (_, i) => ({
      direction: 'inbound' as const,
      from: 'ada@acme.co.uk',
      at: '2026-08-09T09:00:00Z',
      body: `message-${i}`,
    }));
    const user = buildAutoReplyMessages(ctx({ thread: many }))[1].content;
    expect(user).not.toContain('message-0');
    expect(user).toContain(`message-${THREAD_MESSAGE_LIMIT + 4}`);
  });

  it('trims an oversized body', () => {
    const user = buildAutoReplyMessages(
      ctx({
        thread: [
          {
            direction: 'inbound',
            from: 'ada@acme.co.uk',
            at: '2026-08-09T09:00:00Z',
            body: 'x'.repeat(THREAD_BODY_CHAR_LIMIT + 500),
          },
        ],
      })
    )[1].content;
    expect(user).not.toContain('x'.repeat(THREAD_BODY_CHAR_LIMIT + 1));
  });

  it('handles an unknown client without crashing', () => {
    const msgs = buildAutoReplyMessages(ctx({ clientName: null, clientContactName: null }));
    expect(msgs).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/services/mailAutoReply/__tests__/prompt.test.ts --forceExit`
Expected: FAIL — cannot find module `../prompt.js`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/services/mailAutoReply/prompt.ts`:

```ts
/**
 * System prompt + context formatting for AI mailbox replies.
 *
 * The capability/liability split is the whole point of this file: the model is
 * meant to be genuinely useful on UK accounts and bookkeeping, and is hard
 * barred from stating any client-specific number or committing the practice to
 * a position. Those constraints are asserted by prompt.test.ts — treat them as
 * behaviour, not copy.
 */

export const THREAD_MESSAGE_LIMIT = 10;
export const THREAD_BODY_CHAR_LIMIT = 4000;

export type AutoReplyThreadMessage = {
  direction: 'inbound' | 'outbound';
  from: string;
  at: string;
  body: string;
};

export type AutoReplyContext = {
  practiceName: string;
  clientName: string | null;
  clientContactName: string | null;
  openJobs: string[];
  openProposals: string[];
  outstandingRequests: string[];
  thread: AutoReplyThreadMessage[];
};

const SYSTEM_PROMPT = `You are drafting a reply on behalf of a UK accountancy practice, in the practice's own voice. You are writing to one of the practice's existing clients.

WHAT YOU ARE GOOD AT — answer these directly and specifically:
- VAT: registration thresholds and timing, the flat rate, cash and annual accounting schemes and what changes under each, what a VAT return covers.
- MTD: Making Tax Digital for VAT and for Income Tax Self Assessment — who is in scope, from when, and what it means practically for record keeping.
- CIS: subcontractor verification, deduction rates, monthly returns, gross payment status.
- Self assessment and corporation tax: filing deadlines, payments on account, what information is needed and when.
- Payroll basics: PAYE, RTI submissions, auto-enrolment duties.
- Bookkeeping practice: what records to keep and for how long, allowable versus disallowable expenditure in general terms, and how this practice's own process works (portal uploads, records requests, year-end flow).

WHAT YOU MUST NEVER DO:
- NEVER state or calculate a figure specific to this client. No tax due, no refund estimate, no liability, no "roughly", no worked example using their numbers.
- NEVER commit the practice to a filing position, a deadline promise, a fee, or an outcome.
- NEVER contradict or reverse anything the accountant has already said earlier in this thread.
- NEVER invent a document, attachment, link, or fact you were not given.

When the client's question needs any of the above, write a HOLDING REPLY: show clearly that you understood the specific question, give whatever general guidance is safe, and say plainly that the accountant will confirm the specific number or position. Never send a content-free acknowledgement.

STYLE: British English. Plain, warm, professional — how a good practice writes to a client it knows. No em dashes. No AI or assistant sign-off, no subject line, no placeholders like [Name]. Sign off with the practice name only if the thread does. Output the reply body as plain text and nothing else.`;

function trimBody(body: string): string {
  const clean = (body || '').trim();
  return clean.length > THREAD_BODY_CHAR_LIMIT
    ? `${clean.slice(0, THREAD_BODY_CHAR_LIMIT)}\n[trimmed]`
    : clean;
}

function bulletList(label: string, items: string[]): string {
  if (items.length === 0) return '';
  return `\n${label}:\n${items.map((i) => `- ${i}`).join('\n')}`;
}

export function buildAutoReplyMessages(
  ctx: AutoReplyContext
): { role: 'system' | 'user'; content: string }[] {
  const recent = ctx.thread.slice(-THREAD_MESSAGE_LIMIT);
  const transcript = recent
    .map(
      (m) =>
        `[${m.direction === 'inbound' ? 'CLIENT' : 'PRACTICE'} ${m.at}] ${m.from}\n${trimBody(m.body)}`
    )
    .join('\n\n');

  const user = `PRACTICE: ${ctx.practiceName}
CLIENT: ${ctx.clientName ?? 'unknown'}${ctx.clientContactName ? ` (contact: ${ctx.clientContactName})` : ''}${bulletList(
    'OPEN JOBS',
    ctx.openJobs
  )}${bulletList('LIVE PROPOSALS', ctx.openProposals)}${bulletList(
    'OUTSTANDING DOCUMENT REQUESTS',
    ctx.outstandingRequests
  )}

THREAD (oldest first, most recent last):
${transcript}

Draft the practice's reply to the most recent client message.`;

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: user },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest src/services/mailAutoReply/__tests__/prompt.test.ts --forceExit`
Expected: PASS.

- [ ] **Step 5: Format, lint, commit**

```bash
npx prettier --write backend/src/services/mailAutoReply
npx eslint backend/src/services/mailAutoReply --max-warnings 0
git add backend/src/services/mailAutoReply
git commit -m "feat(mail-autoreply): system prompt with the number-shy constraints under test"
```

---

### Task 4: Orchestrator service

**Files:**

- Create: `backend/src/services/mailAutoReply/index.ts`
- Test: `backend/src/services/mailAutoReply/__tests__/autoReplyService.test.ts`

**Interfaces:**

- Consumes: `parseMailAutoReplySettings`, `isAutomatedSender`, `isWithinBusinessHours` (Task 2); `buildAutoReplyMessages` (Task 3); `MailAiReplyDraft` (Task 1); existing `chatCompletion`, `checkAiTokenBudget` from `../ai/aiClient.js`; existing `sendMailboxMessage` from `../mailboxService.js`.
- Produces:
  - `processNewInboundMessages(tenantId: string, messageIds: string[]): Promise<void>`
  - `listPendingDrafts(tenantId: string, conversationId?: string): Promise<MailAiReplyDraftDto[]>`
  - `approveDraft(tenantId: string, draftId: string, userId: string, bodyOverride?: string): Promise<{ sent: boolean; error?: string }>`
  - `dismissDraft(tenantId: string, draftId: string, userId: string): Promise<void>`
  - `type MailAiReplyDraftDto = { id: string; conversationId: string; inboundMessageId: string; subject: string; bodyText: string; status: string; createdAt: string }`
  - `AI_REPLY_CONVERSATION_COOLDOWN_MS = 4 * 60 * 60 * 1000`

**Note on the send path:** `sendMailboxMessage(tenantId, userId, spec)` takes `SendMailboxSpec = { to, cc?, subject, body, replyToMessageId? }` and returns `{ dto, sent, error? }`. Pass `replyToMessageId` = the inbound `MailMessage.id` so threading is preserved.

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/mailAutoReply/__tests__/autoReplyService.test.ts`:

```ts
const prismaMock = {
  tenant: { findUnique: jest.fn() },
  mailMessage: { findFirst: jest.fn(), findMany: jest.fn() },
  mailAiReplyDraft: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  client: { findFirst: jest.fn() },
  job: { findMany: jest.fn() },
  proposal: { findMany: jest.fn() },
  documentRequest: { findMany: jest.fn() },
};
jest.mock('../../../config/database.js', () => ({ prisma: prismaMock }));

const chatCompletionMock = jest.fn();
const checkAiTokenBudgetMock = jest.fn();
jest.mock('../../ai/aiClient.js', () => ({
  chatCompletion: (...a: unknown[]) => chatCompletionMock(...a),
  checkAiTokenBudget: (...a: unknown[]) => checkAiTokenBudgetMock(...a),
}));

const sendMailboxMessageMock = jest.fn();
jest.mock('../../mailboxService.js', () => ({
  sendMailboxMessage: (...a: unknown[]) => sendMailboxMessageMock(...a),
  getThread: jest.fn().mockResolvedValue([]),
}));

import { processNewInboundMessages } from '../index.js';

const inbound = {
  id: 'm1',
  tenantId: 't1',
  direction: 'INBOUND',
  fromAddress: 'ada@acme.co.uk',
  toAddresses: 'practice@fortis.co.uk',
  subject: 'VAT question',
  bodyText: 'Do I need to register for VAT?',
  conversationId: 'c1',
  clientId: 'cl1',
  receivedAt: new Date('2026-08-11T09:30:00Z'),
};

function settings(mailAutoReply: unknown) {
  return { settings: JSON.stringify({ mailAutoReply }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.tenant.findUnique.mockResolvedValue(settings({ enabled: true, mode: 'draft' }));
  prismaMock.mailMessage.findFirst.mockResolvedValue(inbound);
  prismaMock.mailMessage.findMany.mockResolvedValue([inbound]);
  prismaMock.mailAiReplyDraft.findUnique.mockResolvedValue(null);
  prismaMock.mailAiReplyDraft.findFirst.mockResolvedValue(null);
  prismaMock.mailAiReplyDraft.create.mockImplementation(({ data }: any) => ({ id: 'd1', ...data }));
  prismaMock.client.findFirst.mockResolvedValue({
    id: 'cl1',
    name: 'Acme Ltd',
    contactName: 'Ada',
  });
  prismaMock.job.findMany.mockResolvedValue([]);
  prismaMock.proposal.findMany.mockResolvedValue([]);
  prismaMock.documentRequest.findMany.mockResolvedValue([]);
  checkAiTokenBudgetMock.mockResolvedValue({ withinBudget: true });
  chatCompletionMock.mockResolvedValue({
    content: 'Thanks Ada — here is the position.',
    usage: {},
  });
  sendMailboxMessageMock.mockResolvedValue({ dto: { id: 'sent1' }, sent: true });
});

describe('processNewInboundMessages — gates', () => {
  it('creates a pending draft and does not send in draft mode', async () => {
    await processNewInboundMessages('t1', ['m1']);
    expect(prismaMock.mailAiReplyDraft.create).toHaveBeenCalled();
    expect(prismaMock.mailAiReplyDraft.create.mock.calls[0][0].data.status).toBe('pending');
    expect(sendMailboxMessageMock).not.toHaveBeenCalled();
  });

  it('does nothing when the tenant has not opted in', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(settings({ enabled: false, mode: 'draft' }));
    await processNewInboundMessages('t1', ['m1']);
    expect(chatCompletionMock).not.toHaveBeenCalled();
    expect(prismaMock.mailAiReplyDraft.create).not.toHaveBeenCalled();
  });

  it('skips a message with no linked client', async () => {
    prismaMock.mailMessage.findFirst.mockResolvedValue({ ...inbound, clientId: null });
    await processNewInboundMessages('t1', ['m1']);
    expect(chatCompletionMock).not.toHaveBeenCalled();
  });

  it('skips an automated sender', async () => {
    prismaMock.mailMessage.findFirst.mockResolvedValue({
      ...inbound,
      fromAddress: 'no-reply@xero.com',
    });
    await processNewInboundMessages('t1', ['m1']);
    expect(chatCompletionMock).not.toHaveBeenCalled();
  });

  it('skips when a draft already exists for that message', async () => {
    prismaMock.mailAiReplyDraft.findUnique.mockResolvedValue({ id: 'existing' });
    await processNewInboundMessages('t1', ['m1']);
    expect(chatCompletionMock).not.toHaveBeenCalled();
  });

  it('skips when the AI budget is exhausted', async () => {
    checkAiTokenBudgetMock.mockResolvedValue({ withinBudget: false });
    await processNewInboundMessages('t1', ['m1']);
    expect(chatCompletionMock).not.toHaveBeenCalled();
  });

  it('records a failed draft when generation throws, and never rethrows', async () => {
    chatCompletionMock.mockRejectedValue(new Error('provider down'));
    await expect(processNewInboundMessages('t1', ['m1'])).resolves.toBeUndefined();
    const created = prismaMock.mailAiReplyDraft.create.mock.calls[0][0].data;
    expect(created.status).toBe('failed');
    expect(created.error).toContain('provider down');
  });
});

describe('processNewInboundMessages — auto mode', () => {
  beforeEach(() => {
    prismaMock.tenant.findUnique.mockResolvedValue(
      settings({ enabled: true, mode: 'auto', businessHoursOnly: false })
    );
  });

  it('sends via the mailbox send path and marks the draft sent', async () => {
    await processNewInboundMessages('t1', ['m1']);
    expect(sendMailboxMessageMock).toHaveBeenCalledWith(
      't1',
      null,
      expect.objectContaining({ to: 'ada@acme.co.uk', replyToMessageId: 'm1' })
    );
    expect(prismaMock.mailAiReplyDraft.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'sent' }) })
    );
  });

  it('leaves the draft pending when the conversation is in cooldown', async () => {
    prismaMock.mailAiReplyDraft.findFirst.mockResolvedValue({
      id: 'recent',
      decidedAt: new Date(),
    });
    await processNewInboundMessages('t1', ['m1']);
    expect(sendMailboxMessageMock).not.toHaveBeenCalled();
    expect(prismaMock.mailAiReplyDraft.create.mock.calls[0][0].data.status).toBe('pending');
  });

  it('leaves the draft pending outside business hours when the setting is on', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(
      settings({ enabled: true, mode: 'auto', businessHoursOnly: true })
    );
    jest.useFakeTimers().setSystemTime(new Date('2026-08-09T10:00:00Z')); // Sunday
    await processNewInboundMessages('t1', ['m1']);
    jest.useRealTimers();
    expect(sendMailboxMessageMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/services/mailAutoReply/__tests__/autoReplyService.test.ts --forceExit`
Expected: FAIL — cannot find module `../index.js`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/services/mailAutoReply/index.ts`. Key requirements, all covered by the tests above:

- `processNewInboundMessages(tenantId, messageIds)` loops ids, and for each: load tenant settings once per call; return early if `!enabled`; load the `MailMessage` with `where: { id, tenantId }`; skip unless `direction === 'INBOUND'` and `clientId`; skip if `isAutomatedSender(fromAddress, subject)`; skip if a draft exists (`findUnique({ where: { inboundMessageId } })`); skip if `!(await checkAiTokenBudget(tenantId)).withinBudget`.
- Context: client via `prisma.client.findFirst({ where: { id: clientId, tenantId } })`; open jobs / live proposals / outstanding document requests via tenant-scoped `findMany` (cap 5 each, map to display strings); thread via `prisma.mailMessage.findMany({ where: { tenantId, conversationId }, orderBy: { receivedAt: 'asc' }, take: 20 })` mapped to `AutoReplyThreadMessage`.
- Generate: `chatCompletion(buildAutoReplyMessages(ctx), { temperature: 0.4, maxTokens: 900 })`. Wrap in try/catch — on error create the draft row with `status: 'failed'` and the error message, then continue to the next id. **The function must never reject.**
- Create the draft with `status: 'pending'`, `subject` = `Re: ` + inbound subject (unless it already starts with `Re:`), `bodyText` = the model output trimmed, `generationMeta` = JSON of model + usage.
- Auto mode only: cooldown check via `prisma.mailAiReplyDraft.findFirst({ where: { tenantId, conversationId, status: 'sent', decidedAt: { gte: new Date(Date.now() - AI_REPLY_CONVERSATION_COOLDOWN_MS) } } })`; business-hours check when `businessHoursOnly`; if either fails leave the row `pending` and move on. Otherwise `sendMailboxMessage(tenantId, null, { to: inbound.fromAddress, subject, body, replyToMessageId: inbound.id })` and, when `sent`, `update` the draft to `status: 'sent'`, `sentMessageId`, `decidedAt: new Date()`.
- `approveDraft` re-checks tenant scope, uses `bodyOverride ?? bodyText`, calls the same send path with `userId`, marks `sent` + `decidedByUserId`. `dismissDraft` sets `status: 'dismissed'`, `decidedAt`, `decidedByUserId`. Both throw `ApiError('DRAFT_NOT_FOUND', …, 404)` when the row is missing or belongs to another tenant, and `ApiError('DRAFT_ALREADY_DECIDED', …, 409)` when `status !== 'pending'`.
- `listPendingDrafts(tenantId, conversationId?)` returns the DTO shape above, newest first.

Export `AI_REPLY_CONVERSATION_COOLDOWN_MS = 4 * 60 * 60 * 1000`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest src/services/mailAutoReply --forceExit`
Expected: PASS — all three suites in the folder.

- [ ] **Step 5: Format, lint, typecheck, commit**

```bash
npx prettier --write backend/src/services/mailAutoReply
npx eslint backend/src/services/mailAutoReply --max-warnings 0
cd backend && npx tsc --noEmit && cd ..
git add backend/src/services/mailAutoReply
git commit -m "feat(mail-autoreply): orchestrator with eligibility, generation and auto-send guards"
```

---

### Task 5: Sync hook

**Files:**

- Modify: `backend/src/services/mailboxService.ts` (the upsert loop inside `syncMailboxInternal`, around lines 446-450, and the block after the `mailboxSyncState.upsert`)
- Test: extend `backend/src/services/mailAutoReply/__tests__/autoReplyService.test.ts` is NOT appropriate here; add a focused test to the existing mailbox test file if one covers `syncMailbox`, otherwise assert via the manual check in Step 4.

**Interfaces:**

- Consumes: `processNewInboundMessages` (Task 4).
- Produces: no new exports; `syncMailboxInternal` gains a fire-and-forget call.

- [ ] **Step 1: Collect created inbound ids in the upsert loop**

`upsertProviderMessage` currently returns `'created' | 'updated'`. Change it to return `{ outcome: 'created' | 'updated'; id: string; direction: 'INBOUND' | 'OUTBOUND' }` (it already has the row id from its own upsert result — return it rather than re-querying), and update the loop:

```ts
const createdInboundIds: string[] = [];

for (const pm of [...inboxPage.messages, ...sentPage.messages]) {
  const result = await upsertProviderMessage(tenantId, provider, pm);
  if (result.outcome === 'created') {
    imported++;
    if (result.direction === 'INBOUND') createdInboundIds.push(result.id);
  } else {
    updated++;
  }
}
```

- [ ] **Step 2: Fire the hook after the sync state write**

Immediately after the `prisma.mailboxSyncState.upsert({ ... })` call that records a successful sync, add:

```ts
// AI autoreply is best-effort and must never fail a healthy sync: the tenant
// gate lives inside the service, so this call is a no-op for tenants that have
// not opted in. Fire-and-forget, same isolation as the sync job's per-tenant
// try/catch.
if (createdInboundIds.length > 0) {
  void processNewInboundMessages(tenantId, createdInboundIds).catch((err) =>
    logger.error({ err, tenantId }, 'mail autoreply processing failed')
  );
}
```

Import at the top: `import { processNewInboundMessages } from './mailAutoReply/index.js';`

- [ ] **Step 3: Verify no circular-import breakage**

`mailAutoReply/index.ts` imports `sendMailboxMessage` from `mailboxService.ts`, and `mailboxService.ts` now imports `processNewInboundMessages` — a cycle. Node ESM tolerates this because both are used at call time, not module-evaluation time, but confirm rather than assume.

Run: `cd backend && npx tsc --noEmit && npx jest src/services/mailAutoReply tests/smoke --forceExit`
Expected: tsc 0 errors; suites pass; no "Cannot access before initialization" error.

If the cycle does break at runtime, invert it: have the service import the send function lazily (`const { sendMailboxMessage } = await import('../mailboxService.js')`) inside the send path.

- [ ] **Step 4: Run the existing mailbox suite for regressions**

Run: `cd backend && npx jest mailbox --forceExit`
Expected: all existing mailbox suites still pass (the return-shape change of `upsertProviderMessage` is internal).

- [ ] **Step 5: Format, lint, commit**

```bash
npx prettier --write backend/src/services/mailboxService.ts
npx eslint backend/src/services/mailboxService.ts --max-warnings 0
git add backend/src/services/mailboxService.ts
git commit -m "feat(mail-autoreply): hook generation onto newly synced inbound messages"
```

---

### Task 6: API routes

**Files:**

- Modify: `backend/src/routes/comms.ts`
- Modify: the tenant settings PUT route that whitelists settings keys (find it with `grep -rn "automationSchedule" backend/src/routes/`)
- Test: `backend/src/routes/__tests__/mailAutoReplyRoutes.test.ts`

**Interfaces:**

- Consumes: `listPendingDrafts`, `approveDraft`, `dismissDraft` (Task 4).
- Produces: `GET /api/comms/mailbox/ai-drafts?conversationId=`, `POST /api/comms/mailbox/ai-drafts/:id/approve` (body `{ body?: string }`), `POST /api/comms/mailbox/ai-drafts/:id/dismiss`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/routes/__tests__/mailAutoReplyRoutes.test.ts` following the harness in `backend/src/routes/__tests__/formsTemplateValidation.test.ts` (mock `../../middleware/auth.js` with a mutable `currentRole`, mock `../../config/database.js`, mount the router, use supertest). Assert:

```ts
it('lists pending drafts for the tenant', async () => {
  const res = await request(makeApp()).get('/api/comms/mailbox/ai-drafts');
  expect(res.status).toBe(200);
  expect(res.body.data.drafts).toBeDefined();
});

it('approves a draft and returns the send outcome', async () => {
  const res = await request(makeApp())
    .post('/api/comms/mailbox/ai-drafts/d1/approve')
    .send({ body: 'edited body' });
  expect(res.status).toBe(200);
  expect(approveDraftMock).toHaveBeenCalledWith('t1', 'd1', 'u1', 'edited body');
});

it('rejects a JUNIOR trying to approve', async () => {
  currentRole = 'JUNIOR';
  const res = await request(makeApp()).post('/api/comms/mailbox/ai-drafts/d1/approve').send({});
  expect(res.status).toBe(403);
});

it('dismisses a draft', async () => {
  const res = await request(makeApp()).post('/api/comms/mailbox/ai-drafts/d1/dismiss').send({});
  expect(res.status).toBe(200);
  expect(dismissDraftMock).toHaveBeenCalledWith('t1', 'd1', 'u1');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/routes/__tests__/mailAutoReplyRoutes.test.ts --forceExit`
Expected: FAIL — 404s, routes do not exist.

- [ ] **Step 3: Add the routes**

In `backend/src/routes/comms.ts`, matching the file's existing idiom (`asyncHandler`, `authenticate`, `authorize`, zod):

```ts
router.get(
  '/mailbox/ai-drafts',
  authenticate,
  asyncHandler(async (req, res) => {
    const conversationId = req.query.conversationId as string | undefined;
    const drafts = await listPendingDrafts(req.tenantId!, conversationId);
    res.json({ success: true, data: { drafts } });
  })
);

router.post(
  '/mailbox/ai-drafts/:id/approve',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MD', 'MANAGER', 'SENIOR'),
  asyncHandler(async (req, res) => {
    const body = z.object({ body: z.string().min(1).max(20000).optional() }).parse(req.body);
    const result = await approveDraft(req.tenantId!, req.params.id, req.user!.id, body.body);
    res.json({ success: true, data: result });
  })
);

router.post(
  '/mailbox/ai-drafts/:id/dismiss',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MD', 'MANAGER', 'SENIOR'),
  asyncHandler(async (req, res) => {
    await dismissDraft(req.tenantId!, req.params.id, req.user!.id);
    res.json({ success: true });
  })
);
```

Approve/dismiss exclude JUNIOR, matching every other outbound mailbox mutation.

- [ ] **Step 4: Whitelist the setting**

In the tenant settings PUT route, extend the zod schema with:

```ts
mailAutoReply: z
  .object({
    enabled: z.boolean(),
    mode: z.enum(['draft', 'auto']),
    businessHoursOnly: z.boolean().optional(),
  })
  .optional(),
```

Write it via read-modify-write of the settings JSON, and audit-log the change (follow the `automationSchedule` handler in `backend/src/routes/automation.ts:223-225` for both the merge and the audit row).

- [ ] **Step 5: Run tests, format, lint, commit**

```bash
cd backend && npx jest src/routes/__tests__/mailAutoReplyRoutes.test.ts --forceExit && cd ..
npx prettier --write backend/src/routes
npx eslint backend/src/routes --max-warnings 0
git add backend/src/routes
git commit -m "feat(mail-autoreply): draft list/approve/dismiss endpoints + settings whitelist"
```

---

### Task 7: Inbox UI

**Files:**

- Create: `frontend/src/pages/inbox/aiReplyHelpers.ts`
- Create: `frontend/src/pages/inbox/__tests__/aiReplyHelpers.test.ts`
- Create: `frontend/src/pages/inbox/AiReplyCard.tsx`
- Modify: `frontend/src/pages/inbox/FirmInbox.tsx`

**Interfaces:**

- Consumes: the three endpoints from Task 6.
- Produces:
  - `type AiReplyDraft = { id: string; conversationId: string; inboundMessageId: string; subject: string; bodyText: string; status: string; createdAt: string }`
  - `draftForConversation(drafts: AiReplyDraft[], conversationId: string | null): AiReplyDraft | null`
  - `conversationIdsWithDrafts(drafts: AiReplyDraft[]): Set<string>`

- [ ] **Step 1: Write the failing helper test**

Create `frontend/src/pages/inbox/__tests__/aiReplyHelpers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  draftForConversation,
  conversationIdsWithDrafts,
  type AiReplyDraft,
} from '../aiReplyHelpers';

const draft = (over: Partial<AiReplyDraft> = {}): AiReplyDraft => ({
  id: 'd1',
  conversationId: 'c1',
  inboundMessageId: 'm1',
  subject: 'Re: VAT question',
  bodyText: 'Thanks Ada.',
  status: 'pending',
  createdAt: '2026-08-09T09:05:00Z',
  ...over,
});

describe('draftForConversation', () => {
  it('returns the pending draft for the conversation', () => {
    expect(draftForConversation([draft()], 'c1')?.id).toBe('d1');
  });

  it('returns null for another conversation, a null id, or a decided draft', () => {
    expect(draftForConversation([draft()], 'c2')).toBeNull();
    expect(draftForConversation([draft()], null)).toBeNull();
    expect(draftForConversation([draft({ status: 'sent' })], 'c1')).toBeNull();
  });

  it('prefers the newest pending draft when several exist', () => {
    const older = draft({ id: 'old', createdAt: '2026-08-09T08:00:00Z' });
    const newer = draft({ id: 'new', createdAt: '2026-08-09T10:00:00Z' });
    expect(draftForConversation([older, newer], 'c1')?.id).toBe('new');
  });
});

describe('conversationIdsWithDrafts', () => {
  it('collects only pending conversation ids', () => {
    const set = conversationIdsWithDrafts([
      draft(),
      draft({ id: 'd2', conversationId: 'c2', status: 'dismissed' }),
    ]);
    expect(set.has('c1')).toBe(true);
    expect(set.has('c2')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/inbox/__tests__/aiReplyHelpers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the helpers**

Create `frontend/src/pages/inbox/aiReplyHelpers.ts`:

```ts
export type AiReplyDraft = {
  id: string;
  conversationId: string;
  inboundMessageId: string;
  subject: string;
  bodyText: string;
  status: string;
  createdAt: string;
};

/** Newest pending draft for a conversation, or null. */
export function draftForConversation(
  drafts: AiReplyDraft[],
  conversationId: string | null
): AiReplyDraft | null {
  if (!conversationId) return null;
  const pending = drafts
    .filter((d) => d.status === 'pending' && d.conversationId === conversationId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return pending[0] ?? null;
}

export function conversationIdsWithDrafts(drafts: AiReplyDraft[]): Set<string> {
  return new Set(drafts.filter((d) => d.status === 'pending').map((d) => d.conversationId));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/inbox/__tests__/aiReplyHelpers.test.ts`
Expected: PASS.

- [ ] **Step 5: Build the card component**

Create `frontend/src/pages/inbox/AiReplyCard.tsx` — a bordered card above the reply composer in the thread view, using the page's existing Tailwind idiom (`metal-tile` / `btn-primary` / `btn-ghost` classes as used elsewhere in `FirmInbox.tsx`). Props:

```tsx
type Props = {
  draft: AiReplyDraft;
  busy: boolean;
  onApprove: (draftId: string) => void;
  onEdit: (draft: AiReplyDraft) => void;
  onDismiss: (draftId: string) => void;
};
```

Contents: an eyebrow reading `Suggested reply`, the body in a scrollable `max-h-64 overflow-y-auto whitespace-pre-wrap` block (never silently truncated), then `Approve & send`, `Edit then send`, `Dismiss` buttons, all disabled while `busy`.

- [ ] **Step 6: Wire into FirmInbox**

In `frontend/src/pages/inbox/FirmInbox.tsx`: fetch `/comms/mailbox/ai-drafts` alongside the existing message load; render `<AiReplyCard>` above the composer when `draftForConversation(drafts, selectedConversationId)` is non-null; on `Approve` POST `/approve` then refresh; on `Edit` drop `bodyText` into the existing composer state and dismiss the card locally; on `Dismiss` POST `/dismiss` then refresh. Add a small badge in the message list for ids in `conversationIdsWithDrafts(drafts)`.

- [ ] **Step 7: Verify the whole frontend suite and types**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: all suites pass (150+ existing plus the new ones), tsc exits 0.

- [ ] **Step 8: Format, lint, commit**

```bash
npx prettier --write frontend/src/pages/inbox
npx eslint frontend/src/pages/inbox --max-warnings 0
git add frontend/src/pages/inbox
git commit -m "feat(mail-autoreply): suggested-reply card in the firm inbox"
```

---

### Task 8: Settings opt-in UI

**Files:**

- Modify: `frontend/src/pages/Settings.tsx` (Communications section)

**Interfaces:**

- Consumes: the settings PUT from Task 6.
- Produces: no exports.

- [ ] **Step 1: Add the draft-mode toggle**

In the Communications section, add an "AI replies" block with a toggle bound to `settings.mailAutoReply.enabled`. Enabling PUTs `{ mailAutoReply: { enabled: true, mode: 'draft', businessHoursOnly: true } }`. Copy: "Draft replies to client email for your approval. Nothing is sent without a click."

- [ ] **Step 2: Add the auto-send toggle behind a confirm dialog**

Visible only when `enabled`. Turning it on opens a confirm dialog (reuse the pattern in `frontend/src/pages/automations/PracticeAutomations.tsx`) whose text states plainly: "Replies will be sent to your clients automatically, without anyone reading them first. They are drafted from the thread and your client records, and never include a calculated figure." Confirm PUTs `mode: 'auto'`; cancel leaves `draft`. Include a `businessHoursOnly` checkbox in the same block.

- [ ] **Step 3: Verify types and the suite**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: tsc 0 errors, suites pass.

- [ ] **Step 4: Format, lint, commit**

```bash
npx prettier --write frontend/src/pages/Settings.tsx
npx eslint frontend/src/pages/Settings.tsx --max-warnings 0
git add frontend/src/pages/Settings.tsx
git commit -m "feat(mail-autoreply): settings opt-in with auto-send behind a confirm dialog"
```

---

### Task 9: Documentation and release notes

**Files:**

- Modify: `docs/MAILBOX_TWO_WAY.md`
- Modify: `task_plan.md`

- [ ] **Step 1: Document the feature**

Add an "AI autoreply" section to `docs/MAILBOX_TWO_WAY.md` covering: the two modes and how a tenant opts in, the eligibility gates and send guards (as implemented, including that header-based bot detection is deliberately absent), the `MailAiReplyDraft` table, and the fact that generation shares the tenant AI token budget.

- [ ] **Step 2: Update the build plan**

Add the feature to `task_plan.md` under a dated heading, noting it ships off by default and that Fortis is the first watched tenant in draft mode.

- [ ] **Step 3: Full verification before the PR**

```bash
npm run build:shared
cd backend && npx tsc --noEmit && npx jest src/services/mailAutoReply src/routes/__tests__/mailAutoReplyRoutes.test.ts --forceExit && cd ..
cd frontend && npx tsc --noEmit && npx vitest run && cd ..
npx prettier --write $(git diff --name-only master...HEAD | grep -E '\.(ts|tsx|md)$')
npx eslint backend/src frontend/src --max-warnings 0
```

Expected: tsc clean in both workspaces, all suites pass, lint clean.

- [ ] **Step 4: Commit and open the PR**

```bash
git add -A
git commit -m "docs(mail-autoreply): document the feature and update the build plan"
git push -u origin feat/mail-autoreply
gh pr create --title "feat(mail): opt-in AI autoreply for the client mailbox" --body "..."
```

The PR body must state: ships off by default, the two-step opt-in, the number-shy constraint and where it is tested, and the deliberate out-of-scope list from the spec.

---

## Self-Review

**Spec coverage:** Problem/decisions → Tasks 2, 3, 6, 8. Architecture + hook → Task 5. Data model → Task 1. Settings/opt-in → Tasks 6, 8. Generation + prompt → Tasks 3, 4. Inbox UI → Task 7. Guardrails → Tasks 2 (predicates) and 4 (application). Testing → every task is TDD; the prompt-shape test is Task 3. Out-of-scope items are carried into the PR body in Task 9. No spec section is unimplemented.

**Placeholders:** none — every code step contains the code. Task 4 Step 3 and Tasks 7–8 give precise requirements rather than full file bodies for the largest units (an orchestrator and two React surfaces whose surrounding file conventions must be read at implementation time); each is fully constrained by the tests written immediately before it.

**Type consistency:** `MailAutoReplySettings`, `AutoReplyContext`, `AutoReplyThreadMessage`, `AiReplyDraft` and `MailAiReplyDraftDto` are defined once and referenced consistently. `sendMailboxMessage(tenantId, userId, spec)` and `SendMailboxSpec` match the real signatures verified in `mailboxService.ts`. `upsertProviderMessage`'s return type change is stated in Task 5 and used only there.
