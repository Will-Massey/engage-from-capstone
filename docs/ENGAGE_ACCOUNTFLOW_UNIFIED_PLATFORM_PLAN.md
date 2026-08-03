# Engage × AccountFlow — Unified Platform Plan

**Date:** 2026-08-02  
**Intent:** Seamless management across **Engage** (win work → cash → engagement delivery) and **AccountFlow** (deeper practice / compliance / WIP ops) so firms experience **one Capstone practice platform**, not two disconnected SaaS tabs.  
**Related:** `docs/WORLD_DOMINATION_PLAN.md`, `docs/ENGAGE_VS_ENGAGER_SCORECARD_2026-08-02.md`, `PREMIER_SERVICE_STRATEGY.md`  
**Current code (2026-08-03):** Capstone **Tandem** federated mesh on both sides.

| Side | Location |
|------|----------|
| AccountFlow | `accountflow-practice` · `feat/mesh-sandbox` · `/api/v1/external/tandem/*` · `docs/CAPSTONE_TANDEM.md` |
| Engage | `accountFlowMeshService` · mock default · HTTP when `ACCOUNTFLOW_MESH_MODE=local\|live` + URL + API key · **event bus** on job spawn/column/complete · **inbound** `POST /api/integrations/accountflow/inbound` for AF→Engage board mirror |

Production AccountFlow is **never called** unless `ACCOUNTFLOW_MESH_ALLOW_LIVE=true` (off by default).

---

## 0. Why this matters vs Engager

| Competitor story                         | Capstone counter                                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Engager + TaxCalc = PM + compliance mesh | **Engage + AccountFlow** = commercial engine + AI + delivery + deeper ops — **independent of TaxCalc**                 |
| Single product “does everything”         | Unified **shell + identity + client graph**; specialised cores where they excel                                        |
| Jobs only inside Engager                 | Jobs in Engage (sold work) **and** deep WIP / compliance workflows in AccountFlow — **linked, not duplicated forever** |

**Positioning one-liner:**

> _Quote and collect in Engage. Run the practice spine in AccountFlow. One login, one client, one truth._

Or, after full product fusion:

> _Capstone Practice OS — Engage commercial + AccountFlow operations in one surface._

---

## 1. Domain boundaries (do not blur without a decision)

### 1.1 Canonical ownership

| Domain                                                   | System of record                                                                       | Notes                            |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------- |
| **Prospect / proposal / LoE / e-sign**                   | **Engage**                                                                             | Clara, CH enrich, pricing        |
| **Fee collection at sign / Connect / MRR**               | **Engage**                                                                             | Stripe platform + practice split |
| **Engagement delivery jobs** (phases from sold services) | **Engage** (practice OS)                                                               | Born on accept; board-first      |
| **Deep WIP / bookkeeping production / compliance packs** | **AccountFlow**                                                                        | Where AF is strong today         |
| **Client master record**                                 | **Shared** (see §2)                                                                    | Single Capstone Client ID        |
| **Staff identity / firm**                                | **Shared** (FirmGroup / Superadmin)                                                    | SSO                              |
| **AML / ID**                                             | Engage portal + partner **or** AF module                                               | One path per firm setting        |
| **File store**                                           | Shared object store (R2) with app-scoped keys                                          | No double-upload                 |
| **Time entries**                                         | Prefer **one ledger** — start in Engage jobs; sync summary to AF if AF has WIP billing | Avoid dual timesheets long-term  |

### 1.2 Collision rule (from competitive plan, refined)

| Work type                                                             | Where it lives                                                                         |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Sold engagement delivery (Accounts / SA / VAT job from proposal)      | **Engage Job**                                                                         |
| Ad-hoc internal WIP, bookkeeping run, compliance checklist beyond LoE | **AccountFlow** workflow/job                                                           |
| Both needed                                                           | **Linked entities**: `engageJobId` ↔ `accountFlowWorkId` with bidirectional deep links |

**Anti-goal:** Two unrelated kanbans for the same SA job with no link.

---

## 2. Architecture options (choose explicitly)

### Option A — **Federated mesh** (recommended first 90 days)

Two deployables, one **Capstone Practice Shell**:

```
┌─────────────────────────────────────────────────────────┐
│  Capstone Practice Shell (web)                          │
│  SSO · firm switcher · global search · nav modules      │
├──────────────┬──────────────────────┬───────────────────┤
│ Engage app   │ AccountFlow app      │ Shared services   │
│ (commercial  │ (ops / compliance /  │ Identity, Client  │
│  + delivery) │  deep WIP)           │ Graph, Files, Bus │
└──────────────┴──────────────────────┴───────────────────┘
```

- **Pros:** Ship faster; blast radius limited; each team can release.
- **Cons:** Two codebases until shell is excellent.

### Option B — **Monorepo product merge** (12–18 months)

Single app, module federations: `engage/*` + `accountflow/*` under one React shell, one API gateway.

- **Pros:** True single product; one nav; one deploy.
- **Cons:** Migration cost, schema wars, release coupling.

### Option C — **Absorb AF into Engage** (only if AF is thin)

Kill AF brand; port must-have AF screens into Engage Practice OS.

- **Pros:** One brand.
- **Cons:** Loses AF investment; high rewrite risk.

**Decision for this plan:** **A → B**. Federated mesh now; monorepo when client graph + SSO + event bus are stable.

---

## 3. Shared platform foundation (the “complete interaction”)

### 3.1 Identity & tenancy

| Concern | Design                                                                                               |
| ------- | ---------------------------------------------------------------------------------------------------- |
| Firm    | Capstone **FirmGroup** / Superadmin tenant already used by Engage                                    |
| User    | Shared auth: same email, SSO cookie on `*.capstonesoftware.co.uk` or token exchange                  |
| Roles   | Map Engage `PARTNER/ADMIN/...` ↔ AF roles; common RBAC claims in JWT                                 |
| Session | Superadmin or **Capstone Auth** issues `practice_access_token` with `apps: ['engage','accountflow']` |

### 3.2 Unified Client Graph (UCG)

Single **Capstone Client ID** (`ccid`):

| Field                            | Source                                                           |
| -------------------------------- | ---------------------------------------------------------------- |
| Legal name, CH number, addresses | Engage (CH-native) or AF if created there first                  |
| Contacts                         | Shared                                                           |
| MTD / tax flags                  | Engage + AF read                                                 |
| External IDs                     | `engageClientId`, `accountFlowClientId` during dual-write period |

**API:** `GET/PATCH /platform/clients/:ccid` (gateway) or Superadmin Client service.

### 3.3 Event bus (async, reliable)

On Engage events, AccountFlow reacts (and vice versa):

| Event                                | Consumer action                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| `proposal.accepted`                  | Create/link AF client + engagement shell; optional WIP skeleton                  |
| `job.created` / `job.column_changed` | Mirror status chip in AF if deep WIP exists                                      |
| `job.completed`                      | AF close linked work; trigger renewal window in Engage                           |
| `payment.collected`                  | AF mark engagement commercial status                                             |
| `af.work.blocked`                    | Engage job → HELP_NEEDED + Clara attention                                       |
| `client.updated`                     | Bidirectional field sync with conflict policy (last-write or Engage-wins for CH) |

Transport: HTTPS webhooks HMAC (v1) → later queue (SQS/Cloudflare Queues).

### 3.4 Handoff API (replace the stub)

Today:

```http
GET /api/integrations/accountflow/handoff → available: false
```

**Target:**

```http
POST /api/integrations/accountflow/handoff
Authorization: Bearer …
Body: {
  "proposalId": "…",
  "jobId": "…",           // optional
  "mode": "open" | "create_and_open"
}
→ {
  "available": true,
  "deepLink": "https://accountflow…/clients/{id}?from=engage",
  "accountFlowClientId": "…",
  "accountFlowWorkId": "…"
}
```

Plus AF → Engage:

```http
POST /api/integrations/engage/open-job
→ deepLink to Engage job board card
```

### 3.5 Unified navigation (seamless UX)

**Module bar** (Metal Mint shell):

| Module          | Product                                               |
| --------------- | ----------------------------------------------------- |
| Win work        | Engage — Proposals, Pricing, Clara                    |
| Deliver         | Engage — Jobs, Workload                               |
| Money           | Engage — Payments, MRR, renewals                      |
| Operations      | AccountFlow — deep WIP, compliance packs              |
| Clients         | **Unified** client 360°                               |
| Letters / Admin | Engage practice letters first; AF templates if richer |
| Settings        | Firm-wide + per-app                                   |

**Client 360° page (hero of fusion):**

- Timeline: proposal sent → signed → paid → job phases → AF WIP milestones → files
- One CTA row: _Open proposal · Open job · Open AF work · Message client_

### 3.6 Files & portal

- **One portal** brand for the client (Engage portal evolves to Capstone Client Hub).
- Files in R2: `tenant/{ccid}/…` with ACL; both apps attach metadata.
- Client never chooses “which app” for upload.

### 3.7 Clara across both

| Clara skill                           | App                                                         |
| ------------------------------------- | ----------------------------------------------------------- |
| Draft proposal / LoE / pricing        | Engage                                                      |
| Draft chase / board risk              | Engage                                                      |
| Summarise AF WIP blockers for partner | AF context via API → Clara in Engage shell                  |
| “What needs me today?” global         | Shell Attention Queue (merge Engage attention + AF blocked) |

---

## 4. Integration phases

### Phase U0 — Contracts & discovery (1–2 weeks)

| Deliverable                                                                   | Owner    |
| ----------------------------------------------------------------------------- | -------- |
| Inventory AccountFlow: auth model, client schema, work/job model, deploy URLs | Eng + AF |
| Write **OpenAPI** for handoff + client sync                                   | Eng      |
| Firm identity mapping (Superadmin / FirmGroup)                                | Platform |
| Decision log: Option A confirmed                                              | William  |

**Exit:** Written API contracts; no more “coming_soon” without a date.

### Phase U1 — Identity + deep links (2–3 weeks)

| Deliverable                                                                                 |
| ------------------------------------------------------------------------------------------- |
| SSO / token exchange Engage ↔ AF for same firm users                                        |
| “Open in AccountFlow” from accepted proposal + job detail (real deep link when firm linked) |
| “Open in Engage” from AF client/work                                                        |
| Settings: connect AccountFlow firm ID / enable mesh                                         |

**Exit:** Partner clicks through without re-login; stub removed for linked firms.

### Phase U2 — Client graph dual-write (3–4 weeks)

| Deliverable                                                               |
| ------------------------------------------------------------------------- |
| On accept: ensure AF client exists (create or match on CH number / email) |
| Store `accountFlowClientId` on Engage Client                              |
| Sync name/contact updates Engage → AF (v1 one-way, then bi-di)            |
| Unified Clients list in shell (or Engage Clients with AF badge)           |

**Exit:** Zero double-entry of client for new engagements.

### Phase U3 — Work linkage + status mirror (3–4 weeks)

| Deliverable                                                                    |
| ------------------------------------------------------------------------------ |
| `Job.externalRefs.accountFlowWorkId`                                           |
| On spawn job: optional AF work skeleton (configurable)                         |
| Status map: Engage board column ↔ AF status enum                               |
| Dashboard “Practice spine”: Engage open jobs + AF blocked counts (metal tiles) |

**Exit:** One engagement visible as linked pair; help-needed syncs both ways.

### Phase U4 — Shared portal + files (4 weeks)

| Deliverable                                                     |
| --------------------------------------------------------------- |
| Client Hub uses UCG; shows Engage jobs + AF documents           |
| Shared R2 prefixes; both apps list same vault                   |
| Single messaging thread (store in platform or Engage, AF reads) |

**Exit:** Client has one URL, one inbox.

### Phase U5 — Product fusion UX (ongoing)

| Deliverable                                                    |
| -------------------------------------------------------------- |
| Capstone Practice Shell GA (module nav)                        |
| Attention Queue merges both apps via Clara                     |
| Optional monorepo migration plan (Option B) with strangler fig |

**Exit:** Marketing can say “one platform” without asterisks.

### Phase U6 — Optional hard merge

| Deliverable                                                  |
| ------------------------------------------------------------ |
| Schema convergence / event-sourced client graph service      |
| Single deployable if metrics justify                         |
| Brand: “Capstone Engage” umbrella or dual-label inside shell |

---

## 5. Data model sketches

### 5.1 Engage additions

```prisma
// Client
accountFlowClientId  String?
capstoneClientId     String?  @unique  // UCG

// Job
accountFlowWorkId    String?
syncStatus           String?  // LINKED | AF_ONLY_MIRROR | DIVERGED
lastSyncedAt         DateTime?
```

### 5.2 Platform event envelope

```json
{
  "id": "evt_…",
  "type": "proposal.accepted",
  "firmId": "…",
  "occurredAt": "2026-08-02T12:00:00Z",
  "source": "engage",
  "payload": {
    "proposalId": "…",
    "clientId": "…",
    "jobId": "…",
    "services": [{ "name": "SA", "feePence": 120000 }]
  }
}
```

### 5.3 Conflict policy (v1)

| Entity                    | Winner                 |
| ------------------------- | ---------------------- |
| Companies House fields    | Engage                 |
| Bookkeeping WIP status    | AccountFlow            |
| Commercial payment status | Engage                 |
| Display name manual edit  | Last write + audit log |

---

## 6. UX flows (seamless management)

### Flow A — New client win

1. Engage: CH search → proposal → sign → pay (optional).
2. System: spawn **Engage Job** + create **AF client** + optional AF work.
3. Partner sees metal tile: _Delivery live · Operations ready_ with two deep links.
4. Client portal: one hub for docs + job progress.

### Flow B — Daily work

1. Morning: Shell Attention = Engage overdue jobs + AF blocked WIP.
2. Clara: “3 items need you” with draft chases (Engage) and WIP notes (AF context).
3. Partner works in one tab; module switch never drops firm context.

### Flow C — Year-end / compliance heavy

1. Engage job tracks commercial delivery phases.
2. AF owns production checklist / accounts pack.
3. Completing AF work can auto-advance Engage column to IN_REVIEW / COMPLETE (policy).

---

## 7. Security & compliance

- HMAC webhooks; rotate secrets per firm optional.
- No PII in query strings on deep links; use short-lived handoff codes.
- Audit: every cross-app write logged with `sourceApp`.
- GDPR erasure: UCG delete cascades both apps.
- Tenant isolation tests on handoff (never cross-firm deep link).

---

## 8. How this exceeds Engager

| Engager + TaxCalc        | Capstone Engage + AccountFlow mesh                     |
| ------------------------ | ------------------------------------------------------ |
| Compliance vendor lock   | Independence + multi-stack (Xero/QBO/CH)               |
| PM without generative AI | **Clara** across commercial + ops attention            |
| Collection via partners  | **Collect at sign** in Engage                          |
| One vendor narrative     | Commercial **and** ops with explicit domain excellence |
| Jobs only                | Jobs **linked** to deep WIP when needed                |

---

## 9. Risks

| Risk                                    | Mitigation                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| Double jobs (Engage + AF) confuse staff | Linkage required; UI shows single “spine” with two depth levels                 |
| Scope = build Super Salesforce          | U0–U3 only until metrics prove need for U5–U6                                   |
| AF unhealthy / 503                      | Handoff degrades gracefully; Engage jobs still run (already the stub behaviour) |
| Auth divergence                         | Superadmin / shared JWT claims first                                            |
| Brand confusion                         | Shell branded Capstone Practice; Engage mint / AF gold accents in modules       |

---

## 10. Success metrics

| Metric                                           | Target                     |
| ------------------------------------------------ | -------------------------- |
| Time accept → AF client exists                   | &lt; 5s for linked firms   |
| % accepted proposals with AF link (linked firms) | ≥ 95%                      |
| Re-login when switching apps                     | **0**                      |
| Partner NPS on “one platform”                    | +20 vs dual-login baseline |
| Duplicate client records / firm / quarter        | → 0 for new clients        |

---

## 11. Relation to World Domination waves

| WD wave          | AccountFlow mesh touch                                |
| ---------------- | ----------------------------------------------------- |
| W0 Metal Mint    | Shell + unified Client 360 metal tiles                |
| W1 Portal OS     | Shared Client Hub (U4)                                |
| W2 Automations   | Cross-app triggers (`af.work.blocked` → Engage chase) |
| W3 Clara agentic | Global attention queue (U5)                           |
| W4 GTM           | “Capstone vs Engager+TaxCalc” battle card             |

**Recommendation:** Run **U0–U1 in parallel with W0–W1** so visual domination and platform mesh land together.

---

## 12. Immediate next actions (when approved)

1. **Discovery workshop** (90 min): AccountFlow current entities, auth, prod URL, schema.
2. Flip handoff stub design to **OpenAPI** + sandbox fake AF.
3. Superadmin: firm flag `accountFlowLinked`.
4. Engage UI: Job detail + accepted proposal **“Open in AccountFlow”** (disabled until linked).
5. Client graph spike: match on `companyNumber` + `contactEmail`.

---

## 13. Decision log (fill in)

| Decision                 | Choice                         | Date                | By  |
| ------------------------ | ------------------------------ | ------------------- | --- |
| Architecture             | A federated → B monorepo later | proposed 2026-08-02 | —   |
| Client SoR for CH data   | Engage                         | proposed            | —   |
| Timesheet SoR            | Engage jobs first              | proposed            | —   |
| Brand for shell          | Capstone Practice              | proposed            | —   |
| Big-bang code merge now? | **No**                         | proposed            | —   |

---

_Engage jobs remain engagement-delivery. AccountFlow remains deep ops until U5–U6 deliberately fuse UX. Seamless management = shared identity, client graph, events, and shell — not a reckless monorepo dump._
