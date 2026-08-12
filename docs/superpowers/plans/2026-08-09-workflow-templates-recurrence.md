# Workflow Templates + Recurring Jobs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn Engage from "jobs only exist because someone accepted a proposal" into a practice OS: firms author reusable **workflow templates**, and jobs **recur automatically** on each client's statutory cycle (VAT quarters, year-ends, SA season, payroll months).

**Architecture:** Four new tenant-scoped models (`JobTemplate` → `JobTemplatePhase` → `JobTemplateChecklistItem`, plus `JobRecurrence`). A recurrence service computes the next occurrence from a cadence + an anchor that reads the client's existing statutory date fields, and generates a `Job` (with phases and checklists cloned from the template) idempotently via a period key. A daily cron runs it, opt-in per recurrence. Existing hardcoded `jobPhaseTemplates.ts` stays as the fallback when a job spawns from a proposal with no template.

**Tech Stack:** Express + Prisma + Postgres (backend, jest), React + vitest (frontend).

## Global Constraints

- Worktree `C:\Users\willi\engage-wf`, branch `feat/workflow-templates-recurrence`. **Never master.**
- Backend is TypeScript ESM: relative imports end `.js`. Tests are jest; run with **`--maxWorkers=2`** (unbounded OOMs this machine) and `--testPathIgnorePatterns "tests/smoke"` (those need a live DB and fail on master too).
- **CI gate is repo-wide**: `eslint src --ext .ts` and `prettier --check .`. **Format BEFORE lint** — prettier's wrapping can introduce eslint errors.
- **Multi-tenant: every query MUST be tenant-scoped.** Every new model carries `tenantId` and every read/write filters on it. This is the single most important review criterion.
- **Money is integer pence** everywhere. Never floats.
- **Nothing auto-enables.** Recurrences are opt-in and default inactive — the `chaseSequenceEnabled` lesson (a tenant-wide default-on chase once auto-emailed real clients). Generation must be impossible without a deliberate per-recurrence activation.
- Migration folder name follows the repo convention `YYYYMMDDHHMMSS_description`; the boot runner is fail-closed, so the migration must be valid against prod data.
- UK English in all user-facing copy.
- Roles: reads = all six (ADMIN, PARTNER, MD, MANAGER, SENIOR, JUNIOR); mutations exclude JUNIOR — matching `MAILBOX_WRITE_ROLES` precedent in `routes/comms.ts`.

---

### Task 1: Schema — templates, recurrences, migration

**Files:** Modify `backend/prisma/schema.prisma`; create `backend/prisma/migrations/<ts>_workflow_templates_recurrence/migration.sql`.

```prisma
enum RecurrenceCadence {
  MONTHLY
  QUARTERLY
  ANNUAL
}

/** What the recurrence's due date is derived from. */
enum RecurrenceAnchor {
  CLIENT_YEAR_END        // Client.yearEnd (+ offset)
  CLIENT_VAT_DUE         // Client.nextVatDueDate
  CLIENT_ACCOUNTS_DUE    // Client.nextAccountsDueDate
  CLIENT_CONFIRMATION_DUE// Client.nextConfirmationStatementDue
  SELF_ASSESSMENT        // 31 Jan
  FIXED_DAY_OF_PERIOD    // e.g. payroll: day N of each month
}

model JobTemplate {
  id          String   @id @default(uuid())
  name        String
  description String?
  /** Optional hint reused by proposal-spawned jobs; free text matching existing service categories. */
  serviceCategory String?
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  phases      JobTemplatePhase[]
  recurrences JobRecurrence[]

  @@unique([tenantId, name])
  @@index([tenantId, isActive])
}

model JobTemplatePhase {
  id        String @id @default(uuid())
  name      String
  sortOrder Int    @default(0)

  templateId String
  template   JobTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)

  items JobTemplateChecklistItem[]

  @@index([templateId])
}

model JobTemplateChecklistItem {
  id        String @id @default(uuid())
  label     String
  sortOrder Int    @default(0)

  phaseId String
  phase   JobTemplatePhase @relation(fields: [phaseId], references: [id], onDelete: Cascade)

  @@index([phaseId])
}

model JobRecurrence {
  id        String            @id @default(uuid())
  cadence   RecurrenceCadence
  anchor    RecurrenceAnchor
  /** Days BEFORE the computed due date that the job should be created. */
  leadDays  Int               @default(14)
  /** For FIXED_DAY_OF_PERIOD: which day of the month. Ignored otherwise. */
  dayOfPeriod Int?
  /** Deliberate opt-in. Nothing generates while false. */
  isActive  Boolean           @default(false)
  /** Idempotency: the last period this recurrence generated for, e.g. "2026-Q3", "2026-08", "2026". */
  lastPeriodKey String?
  lastRunAt DateTime?
  nextDueAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  clientId String
  client   Client @relation(fields: [clientId], references: [id], onDelete: Cascade)
  templateId String
  template   JobTemplate @relation(fields: [templateId], references: [id], onDelete: Restrict)
  assigneeId String?
  assignee   User?  @relation("JobRecurrenceAssignee", fields: [assigneeId], references: [id], onDelete: SetNull)

  jobs Job[] @relation("JobFromRecurrence")

  @@index([tenantId, isActive])
  @@index([clientId])
  @@index([templateId])
}
```

On `Job`, add the back-link and the idempotency key:

```prisma
  recurrenceId String?
  recurrence   JobRecurrence? @relation("JobFromRecurrence", fields: [recurrenceId], references: [id], onDelete: SetNull)
  /** Set only on recurrence-generated jobs; with recurrenceId this makes generation idempotent. */
  periodKey    String?
```

plus `@@unique([recurrenceId, periodKey])` on `Job` — **this unique constraint is the real idempotency guarantee**; a double-run cannot create two jobs for the same period even under a race.

Back-relations on `Tenant` (`jobTemplates`, `jobRecurrences`), `Client` (`jobRecurrences`), `User` (`jobRecurrenceAssignments`).

Migration: generate with `npx prisma migrate diff`, review the SQL, confirm it is purely additive (CREATE TYPE/TABLE/INDEX + ALTER TABLE "Job" ADD COLUMN). No data backfill needed.

Verify: `npx prisma migrate deploy` against the dev DB (Docker `engage-postgres-dev`, host port **5433**, never 5432) succeeds and is a no-op on re-run; `npx prisma generate`; backend `tsc --noEmit` clean.
Commit: `feat(workflow): job template + recurrence schema`

---

### Task 2: Template service + routes (TDD)

**Files:** create `backend/src/services/jobTemplateService.ts` (+ tests); create `backend/src/routes/jobTemplates.ts` (+ route tests); mount in `backend/src/app/apiRoutes.ts` under `/api/job-templates`.

Service exports (binding — Task 5's UI depends on these shapes):

```ts
listJobTemplates(tenantId): Promise<JobTemplateDto[]>            // includes phases+items, ordered by sortOrder
getJobTemplate(tenantId, id): Promise<JobTemplateDto | null>
createJobTemplate(tenantId, input: TemplateInput): Promise<JobTemplateDto>
updateJobTemplate(tenantId, id, input: TemplateInput): Promise<JobTemplateDto>  // replaces phases/items wholesale
deleteJobTemplate(tenantId, id): Promise<void>                   // refuse (throw IN_USE) if an active recurrence references it
cloneJobTemplate(tenantId, id, newName): Promise<JobTemplateDto>
seedDefaultTemplates(tenantId): Promise<number>                  // one-time: convert the hardcoded jobPhaseTemplates.ts catalogue into editable rows for this tenant
```

`TemplateInput = { name, description?, serviceCategory?, isActive?, phases: { name, sortOrder, items: { label, sortOrder }[] }[] }`.

Routes: `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`, `POST /:id/clone`, `POST /seed-defaults`. Reads all six roles; mutations exclude JUNIOR. Zod-validate bodies. All service calls take `req.tenantId!`.

Tests: create with nested phases/items persists them ordered; update replaces phases (no orphans left); cross-tenant get/update/delete returns not-found (**tenant isolation — assert explicitly**); delete refuses while an active recurrence references it; duplicate name in same tenant → 409, same name in a different tenant → allowed; seedDefaultTemplates is idempotent (running twice does not duplicate).
Commit: `feat(workflow): job template CRUD service and API`

---

### Task 3: Recurrence engine (TDD — the heart of this feature)

**Files:** create `backend/src/services/jobRecurrenceService.ts` (+ substantial tests).

Exports:

```ts
/** Pure: the period key a due date falls in. QUARTERLY -> "2026-Q3", MONTHLY -> "2026-08", ANNUAL -> "2026". */
periodKeyFor(cadence: RecurrenceCadence, due: Date): string

/** Pure: next due date for a recurrence given the client's statutory fields and "now". Returns null when the anchor data is missing. */
computeNextDueAt(input: {
  cadence: RecurrenceCadence; anchor: RecurrenceAnchor; dayOfPeriod?: number | null;
  client: { yearEnd?: string | null; nextVatDueDate?: Date | null; nextAccountsDueDate?: Date | null; nextConfirmationStatementDue?: Date | null };
  now: Date;
}): Date | null

listRecurrences(tenantId, opts?): Promise<RecurrenceDto[]>
createRecurrence(tenantId, input): Promise<RecurrenceDto>
updateRecurrence(tenantId, id, input): Promise<RecurrenceDto>
deleteRecurrence(tenantId, id): Promise<void>
/** Generate for ONE recurrence if due. Idempotent. Returns the created job id or null with a reason. */
generateDueJob(tenantId, recurrenceId, now: Date): Promise<{ jobId: string | null; reason?: string }>
/** Sweep all ACTIVE recurrences for a tenant. Returns a summary. */
runRecurrencesForTenant(tenantId, now: Date): Promise<{ created: number; skipped: number; errors: number }>
```

Rules:
- **Generation window**: create the job when `now >= nextDueAt - leadDays`. Never create more than one period ahead.
- **Idempotency**: compute `periodKey` from the due date; insert the Job with `recurrenceId` + `periodKey`. Catch the unique-constraint violation (P2002) and treat it as "already generated" (skipped), not an error — the DB constraint is the guarantee, the pre-check is only an optimisation.
- **Job creation** clones the template's phases and checklist items into real `JobPhase` / `ChecklistItem` rows, sets `clientId`, `tenantId`, `assigneeId` from the recurrence, `dueAt` = computed due date, `deadlineKind = STATUTORY` for the statutory anchors and `INTERNAL` for `FIXED_DAY_OF_PERIOD`, `boardColumn = REQUEST_RECORDS`, and generates a `reference` using the same helper existing job spawn uses (find it in `jobSpawnService.ts` — reuse, do not reinvent).
- After success: advance `lastPeriodKey`, `lastRunAt`, and recompute `nextDueAt` for the following period.
- **Inactive recurrences never generate.** Assert this in a test.
- Write a `JobActivity` row (`kind: 'SPAWNED'`) noting it came from a recurrence.

Tests (this task carries the most): period keys for all three cadences incl. year boundaries; `computeNextDueAt` for every anchor incl. missing-data → null; lead-days window (not yet due → skip; inside window → create); **idempotency: calling generateDueJob twice creates exactly one job**; simulated concurrent double-run (force the P2002 path) still yields one job and reports skipped; inactive → never generates; cross-tenant recurrence id → not found; phases and checklist items cloned in the right order; nextDueAt advances correctly after generation.
Commit: `feat(workflow): recurrence engine with idempotent job generation`

---

### Task 4: Recurrence API + daily generation job

**Files:** create `backend/src/routes/jobRecurrences.ts` (+ tests), mount at `/api/job-recurrences`; create `backend/src/jobs/recurrenceRunJob.ts` (+ tests); wire into `backend/src/app/jobs.ts` following the EXISTING pattern there (read it: `withJobLock` advisory lock + `trackJobRun` + setInterval tick — match it exactly, do not invent a new scheduling mechanism).

- Routes: `GET /` (list, with client + template names), `POST /`, `PUT /:id`, `DELETE /:id`, `POST /:id/run-now` (manual trigger, senior+, audited), `GET /preview` (given cadence/anchor/client, return the next 3 computed due dates — pure, no writes; powers the UI).
- Job: daily tick. For each tenant that has ≥1 active recurrence, call `runRecurrencesForTenant`. Per-tenant try/catch so one tenant's bad data cannot stop the sweep. Log a per-run summary. Skip entirely when `EMAIL_DEV_LOG=true` (matches the mailbox job's dev guard). Interval env `RECURRENCE_RUN_INTERVAL_MS`, default 86400000.
- Role gates as per Global Constraints.

Tests: job skips tenants with no active recurrences; one tenant throwing does not abort the others; `/preview` returns 3 dates and writes nothing; `run-now` is role-gated; JUNIOR gets 403 on mutations.
Commit: `feat(workflow): recurrence API and daily generation job`

---

### Task 5: Frontend — template editor + recurrence manager

**Files:** create `frontend/src/pages/settings/JobTemplates.tsx` and `frontend/src/pages/jobs/Recurrences.tsx`; extract pure helpers into a `workflowHelpers.ts` and unit-test those only (no component render tests); add nav entries following `frontend/src/config/navigation.ts` conventions.

- **Template editor**: list templates; create/edit with add/remove/reorder phases and checklist items; clone; delete (surface the IN_USE refusal clearly); a "Load default templates" action calling `seed-defaults` for firms starting from scratch.
- **Recurrence manager**: table of recurrences (client, template, cadence, anchor, next due, active); create/edit dialog with a **live preview of the next 3 due dates** from `GET /preview`; an explicit active toggle whose off-state is obvious; "Run now" with a confirm dialog.
- Copy must make the opt-in nature obvious — an inactive recurrence should visibly read as "not generating".
- New testids: `job-template-list`, `job-template-add-phase`, `recurrence-active-toggle`, `recurrence-preview-dates`, `recurrence-run-now`.

Verify: `npx tsc --noEmit` + `npx vitest run` green; visual smoke is the controller's job — do not launch the dev stack.
Commit: `feat(workflow): template editor and recurrence manager UI`

---

### Task 6: Full verification + PR

- Format → lint → typecheck → full backend jest (`--maxWorkers=2 --testPathIgnorePatterns "tests/smoke"`) → frontend tsc + vitest.
- Update `docs/` with a short `WORKFLOW_TEMPLATES.md` (models, how recurrence anchors map to client fields, the opt-in guard, the idempotency key).
- Push, open a PR summarising the practice-OS gap this closes.

## Self-review notes
- Audit gaps → tasks: no reusable templates → T1/T2/T5; no recurring generation → T1/T3/T4/T5; automations can't create work → T3/T4 (recurrence creates jobs; the existing chase engine is untouched and stays separate by design).
- Deliberately OUT of scope (flag, don't build): configurable board columns per tenant, multi-assignee/`JobAssignment`, phase-level SLAs, a visual automation builder.
