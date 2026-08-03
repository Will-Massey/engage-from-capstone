# Engage Practice vs Engager.app — Scorecard

**Date:** 2026-08-02  
**Engage build under review:** production `engage-from-capstone` · **Practice OS cut over 2026-08-02** (Neon + Render)  
**Engager reference:** TaxCalc Engager (engager.app) — product marketing + known PM OS pattern  
**Baseline plan:** `docs/ENGAGER_COMPETITIVE_ANALYSIS_AND_PLAN.md` (2026-08-01)

---

## 0. Executive verdict (so far)

| Lens                                                 | Result                                                                                                                                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Can Engage run day-to-day delivery like Engager?** | **Near-parity on the happy path** in the practice clone: jobs board, phases/checklists, deadlines, workload, time→margin, chase packs, admin letters, colourful ops UI.                                            |
| **Does Engage still win “win work + cash”?**         | **Yes — still decisive** (Clara, CH→proposal, Stripe Connect collect-at-sign, engagement library versioning). Engager remains partner-heavy on money.                                                              |
| **Who wins overall product completeness today?**     | **Engager still wins breadth** (TaxCalc mesh, mature automations, inbox, bulk forms, mobile apps, unlimited-user pricing). **Engage Practice closes the #1 “no jobs” gap** that made comparison unfair a week ago. |
| **Demo readiness**                                   | **Live on production** (cutover 2026-08-02). Continue closing Engager gaps (sales board, mailbox depth, mobile store).                                                                                              |
| **Recommended story**                                | _“Engager is a great PM OS. Engage is the only product that **wins the client, collects the fee, and runs the job** with an AI co-pilot.”_                                                                         |

### Headline scores (0–10, subjective product judgment)

_Updated later 2026-08-02 after firm inbox, portal OS tasks/messages, automation run history, and desktop nav polish._

| Dimension                                    | Engager | Engage Practice (this build) |         Delta |
| -------------------------------------------- | ------- | ---------------------------- | ------------: |
| Win work (proposal / LoE / pricing)          | 8       | **9**                        |     +1 Engage |
| Sign & onboarding                            | 8       | **7.5**                      |          −0.5 |
| **Deliver work (jobs / phases / board)**     | 9       | **8**                        |   −1 (was −9) |
| Time & profitability                         | 8       | **7**                        |   −1 (was −8) |
| Comms & automation depth                     | 9       | **7**                        |   −2 (was −4) |
| Admin letters (disengage / clearance / 64-8) | 8       | **7**                        |   −1 (was −8) |
| Client portal as OS                          | 9       | **7**                        |   −2 (was −4) |
| AI / intelligence                            | 3       | **9**                        | **+6 Engage** |
| Money loop (sign→cash / recurring)           | 6       | **8**                        |     +2 Engage |
| Integrations & GTM distribution              | 9       | **6**                        |   −3 (was −4) |
| Visual ops craft (board language)            | 9       | **8**                        |   −1 (was −5) |
| **Weighted overall (equal weights)**         | **7.8** | **7.6**                      |      **−0.2** |

**Interpretation:** Practice clone is now **within a hair of Engager overall** on demo surfaces. Remaining gap is **TaxCalc distribution, true two-way mailbox, bulk forms, native mobile store builds** — not core delivery/win-work. **iOS cut only after desktop is solid** (desktop now carries inbox + portal OS + server automations).

---

## 1. What each product is (updated)

### 1.1 Engager.app (TaxCalc)

- Full **practice management OS** for UK accountants & bookkeepers.
- Strengths: jobs/phases, checklists, deadlines, workload, workflows + automated email, portal, bulk messaging/forms, TaxCalc-deep integration path, mature UI density, ~500+ TaxCalc firms already on Engager; marketing cites 2,000+ firms historically.
- Pricing narrative: **per client** from ~£9+VAT/mo, unlimited users.
- AI: automation-heavy, **not** a generative practice co-pilot.

### 1.2 Capstone Engage — two layers

| Layer                                          | What it is                                                                                                                                                           |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Production Engage** (`engage-from-capstone`) | Live proposal→cash product (Clara, CH, Stripe Connect, templates…). **No practice jobs cutover yet.**                                                                |
| **Engage Practice** (`engage-practice`)        | Isolated clone with **practice OS** grafted onto the funnel: accept proposal → spawn job → board/phases/time/chase/letters/automations catalogue + colourful ops UI. |

This scorecard scores **Engage Practice** for delivery parity, and **Engage’s moat** for win-work/AI/money (shared with production).

---

## 2. Capability matrix (updated 2026-08-02)

Legend: **E+** Engage ahead · **≈** parity · **G+** Engager ahead · **Δ** change vs 2026-08-01 baseline

| Capability                | Engager          | Engage Practice                                                | Owner                     | Δ                       |
| ------------------------- | ---------------- | -------------------------------------------------------------- | ------------------------- | ----------------------- |
| **WIN WORK**              |                  |                                                                |                           |                         |
| Proposal / quote          | Strong           | Strong + Clara                                                 | **E+**                    | —                       |
| Letter of engagement      | Strong           | Versioned clause library                                       | **≈ / E+**                | —                       |
| Value-based pricing UX    | Formula builder  | Rules + calculator + AI advisor path                           | **≈ / E+**                | —                       |
| Catch-up fees             | First-class      | One-off lines                                                  | **G+**                    | —                       |
| Sales kanban              | Add-on           | **List + board** (pipeline columns)                            | **≈ / G+**                | **board view 2026-08-03** |
| Companies House           | Integration      | Native CH → brief                                              | **E+**                    | —                       |
| MTD ITSA intelligence     | Jobs mention     | Client fields + signals                                        | **E+**                    | —                       |
| **SIGN & ONBOARD**        |                  |                                                                |                           |                         |
| E-signature               | Mature           | Present; forensics hardening                                   | **≈**                     | —                       |
| Client portal hub         | Full + mobile    | Proposals + jobs + files + **tasks + messages**                | **≈ / G+**                | **portal OS MVP**       |
| Forms / questionnaires    | Bulk forms       | Records pack + AML partial                                     | **G+**                    | improved                |
| AML / ID                  | Partners         | Scaffold / partner path                                        | **G+**                    | —                       |
| **DELIVER WORK**          |                  |                                                                |                           |                         |
| Jobs + phases             | Core             | **Shipped** (spawn on accept, phase templates)                 | **≈**                     | **closed critical gap** |
| Kanban + list board       | Core             | **Shipped** (DnD, list, filters, column £ totals)              | **≈**                     | **closed**              |
| Statutory deadlines       | Core             | Engine + chips (SA/VAT/CH-style)                               | **≈**                     | **closed**              |
| Checklists                | Yes              | Yes (toggle + complete-all)                                    | **≈**                     | **closed**              |
| Time vs budget / margin   | Yes              | Time + rate + fee/cost/margin tiles                            | **≈**                     | **closed**              |
| Workload by staff         | Yes              | Workload view + load bars                                      | **≈**                     | **closed**              |
| Colleague tagging         | Yes              | Assignee only                                                  | **G+**                    | partial                 |
| **COMMUNICATE**           |                  |                                                                |                           |                         |
| Stage/date automations    | Mature visual    | UK packs + **server rules + dry-run/execute + run history**    | **≈ / G+**                | **raised**              |
| Clara / generative chase  | No               | **Yes** (draft chase on job)                                   | **E+**                    | **new**                 |
| M365/Gmail two-way inbox  | Yes              | **Firm inbox** (outbound EmailLog + portal + SMS) · OAuth send | **G+**                    | **firm inbox shipped**  |
| Bulk SMS                  | Add-on           | Per-client SMS + firm inbox                                    | **G+**                    | partial                 |
| **MONEY**                 |                  |                                                                |                           |                         |
| In-product invoices       | Yes              | Stripe / Xero model                                            | Different                 | —                       |
| Collect at sign           | Partners         | **Stripe Connect**                                             | **E+**                    | —                       |
| Recurring / MRR           | Practice ops     | Path + widgets                                                 | **E+** if finished        | —                       |
| Time profitability        | Yes              | On job detail                                                  | **≈**                     | **closed**              |
| **DOCUMENTS & ADMIN**     |                  |                                                                |                           |                         |
| Document designer         | Yes              | Templates / PDF                                                | **G+**                    | —                       |
| Disengagement / clearance | First-class      | **Practice letters UI**                                        | **≈**                     | **closed**              |
| HMRC 64-8                 | Live integration | **Pack generate + track (not live HMRC API)**                  | **G+** content ≈ / API G+ | **closed content**      |
| **AI**                    |                  |                                                                |                           |                         |
| Generative co-pilot       | Not pillar       | **Clara core**                                                 | **E+ decisive**           | —                       |
| **PLATFORM**              |                  |                                                                |                           |                         |
| Mobile apps               | Native           | Capacitor scaffold                                             | **G+**                    | —                       |
| TaxCalc distribution      | Yes              | No                                                             | **G+**                    | —                       |
| Visual ops board craft    | Excellent        | Colour columns, rings, bars, stat tiles                        | **≈**                     | **large jump**          |

---

## 3. What Engage Practice shipped (evidence)

| Module                     | Evidence in tree                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| Jobs API + spawn           | `backend/src/routes/jobs.ts`, `jobSpawnService.ts`, hook on accept in `proposalSharingService.ts` |
| Phases / checklists / time | Job detail UI; phase complete-all; rate £/hr → `actualPence`                                      |
| Board UX                   | `JobsBoard.tsx` — kanban + list, filters, staff filter, colourful column chrome                   |
| Workload                   | `Workload.tsx`                                                                                    |
| Deadlines                  | `jobDeadlineService.ts`                                                                           |
| Chase packs + Clara        | `chasePackService.ts`, job detail Clara draft chase                                               |
| Letters                    | `practiceLetters.ts` + `PracticeLetters.tsx`                                                      |
| Automations catalogue      | `PracticeAutomations.tsx` + `/automation/settings`                                                |
| Portal                     | Client portal jobs + files                                                                        |
| Dashboard delivery         | Pipeline + at-risk list + overdue share bar                                                       |
| Tests                      | E2E `practice-jobs-letters.spec.ts` **8/8**; unit spawn/deadline/chase/letters **13/13**          |
| Isolation                  | Ports 3101/5273, DB `engage_practice_dev`, `ISOLATION.md`                                         |

**Demo:** http://localhost:5273 · `admin@demo.practice` / `DemoPass123!`

---

## 4. Where Engager still wins (honest)

1. **Automation OS** — visual if-this-then-that, bulk email maturity, TaxCalc-triggered comms (e.g. payment on account / filed return flows).
2. **Portal as product** — messaging, client tasks, mobile apps, TaxCalc document push.
3. **Integration surface** — FreeAgent, Adfin, Crezco, Armalytix, Xenon, deep TaxCalc.
4. **GTM** — TaxCalc investment + installed base; sticker price per client undercuts seat SaaS.
5. **Production hardening** — Engager is live at scale; Engage Practice is **demo-complete in a clone**, not cut over.
6. **Colleague tagging / dense task UX** — still deeper than assignee + checklist.
7. **Live HMRC 64-8** — Engager markets integration; Engage generates packs only.

---

## 5. Where Engage wins (press harder)

1. **Clara** — generative co-pilot on proposals + job chase drafts; Engager does not lead with this.
2. **Proposal-to-cash in one funnel** — CH → price → sign → Stripe Connect split; Engager leans partners for collection.
3. **UK compliance product depth** — engagement library versioning, MTD ITSA modelling, regulatory signals path.
4. **Lifecycle gravity** — job is born from **accepted commercial engagement**, not a disconnected PM object.
5. **Capstone ecosystem** — Clarity products + AccountFlow adjacency Engager cannot match outside TaxCalc.

---

## 6. Gap closure tracker (P0–P6)

| Phase                   | Intent                                              | Status in Practice                                       |
| ----------------------- | --------------------------------------------------- | -------------------------------------------------------- |
| V Visual                | Engager-class ops clarity                           | **Mostly done** (colour board, chips, bars, rings)       |
| P0 Jobs foundation      | Model + board + accept→job                          | **Done**                                                 |
| P1 Delivery ops         | Checklists, deadlines, workload, time, portal files | **Done** (portal messaging still thin)                   |
| P2 Money exceed         | Recurring + MRR                                     | **Partial** (prod path; practice surfaces pipeline fees) |
| P3 Comms OS             | Visual builder, SMS, inbox                          | **Catalogue only**                                       |
| P4 Admin letters        | Disengage / clearance / 64-8                        | **Done** (content + status; not live HMRC API)           |
| P5 Clara on practice    | Board prioritise, chase voice                       | **Partial** (chase yes; agentic board prioritise light)  |
| P6 Trust / mobile / GTM | Apps, CE story, switcher                            | **Pending**                                              |
| Cutover                 | Replace production Engage surface                   | **Blocked** until happy                                  |

---

## 7. Risk & cutover notes

- Practice work is on **`feat/practice-os`**, largely **uncommitted / not merged** to production master.
- Production Stripe Connect webhooks were **repaired live** (secret/endpoint drift) — independent of practice UI.
- Cutover checklist: `docs/CUTOVER_PREP.md`. Morning resume: `docs/MORNING_HANDOFF.md`.

---

## 8. Bottom line

| Question                                                          | Answer                                                                                                                                                    |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Did we close the critical “Engager has jobs, Engage doesn’t” gap? | **Yes** (in Engage Practice).                                                                                                                             |
| Are we better than Engager overall?                               | **Not yet on breadth/GTM.** **Yes on AI + commercial funnel.** **Near-parity on delivery happy path.**                                                    |
| What would flip “overall” to Engage?                              | Finish **visual automations**, deepen **portal**, polish **recurring cash**, ship **cutover**, and own the narrative: _sign → cash → deliver with Clara_. |
| Safe claim for a demo tomorrow?                                   | _“We’ve moved from proposal-only to Engager-class jobs delivery, without losing Clara or collect-at-sign.”_                                               |

---

_Generated 2026-08-02 for Capstone Tandem session `engage-practice`. Update this scorecard after cutover or P3 automation builder._
