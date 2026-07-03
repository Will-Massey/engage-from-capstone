# Build Plan: Engage by Capstone
<!-- Token handoff file — update at every Render deploy checkpoint. Fresh sessions read THIS, not chat history. -->

## Goal
**Market leader:** UK proposal-to-cash platform — CH lookup → priced proposal → signed engagement → collected fees, with Clara AI that saves 30+ min/proposal without token overspend. Full plan: `MARKET_LEADER_PLAN.md`.

## Current Phase
**Build 3.2** — Production e2e hardened; catalogue seeded (45 services)

## Next Up
<!-- 3–5 bullets ONLY. Next fresh session starts here. Rewrite every checkpoint. -->
1. Caroline quick browser sign-off (Automation + Templates Yours — e2e green, no retries).
2. **Deferred (post-sale):** Render Starter + disk, `XERO_*` / webhook secrets.
3. Next roadmap: Build 3.3 features per `MARKET_LEADER_PLAN.md` (William to prioritise).

## Phases
<!-- Status: pending | in_progress | complete -->

### Phase 1: Core AI & Proposals
- Clara streaming, pricing advisor, accept/reject sections
- **Status:** complete

### Phase 2: E-signature & Email
- Certificate PDF, Cloudflare webhooks, admin acceptance alert
- **Status:** complete

### Phase 3: Manual Proposal Builder
- Build from scratch vs Clara mode, toggle add/remove services, clear all
- Catalogue price input fix, remove base hours UI
- **Status:** complete

### Phase 4: UI Theme & Glassmorphism
- **Status:** complete (fdbc3e8)

### Phase 5: Verify & deploy
- [x] Local builds pass
- [x] Pushed to Render (121574bc)
- [x] Live smoke-test manual proposal flow (build-smoke + uat-smoke)
- **Status:** complete (Render paid tier deferred)

## Deploy Checkpoints
<!-- Append one row per Render push. This is the resume anchor. -->

| # | Date (UTC) | Commit | Branch | Render services | Status | Notes |
|---|------------|--------|--------|-----------------|--------|-------|
| 1 | 2026-06-30 | fdbc3e8 | master | engage-backend, engage-frontend | live | UI dark/light fixes |
| 2 | 2026-06-30 | 986526fd | master | engage-backend, engage-frontend | live | E-signature audit, Cloudflare webhooks, Clara accept/reject |
| 3 | 2026-06-30 | bb1328b5 | master | engage-backend, engage-frontend | live | Personalised admin acceptance email |
| 4 | 2026-06-30 | eff1b326 | master | engage-backend, engage-frontend | live | Manual build mode, service toggle, price inputs |
| 5 | 2026-06-30 | 121574bc | master | engage-backend, engage-frontend | live | New proposal (manual) list shortcut |
| 6 | 2026-06-30 | fbed4b5f | master | engage-backend, engage-frontend | live | Proposal snapshot isolation (48457d71) + Templates sidebar & management page |
| 7 | 2026-07-01 | 7cc735bb | master | engage-backend, engage-frontend | live | Per-client proposal drafts — switching clients mid-build no longer shares services/title/cover letter |
| 8 | 2026-07-01 | 845effcf | master | engage-backend, engage-frontend | live | Market leader batch: MFA, password reset, Xero, post-sign payments, bulk renewals, first-proposal wizard, pricing calculator, engagement library versioning, win/loss analytics, AI cost refactor. Migrations verified via live API probes. |
| 9 | 2026-07-01 | a14a7371 | master | engage-backend, engage-frontend | live | W0–W4 remainder: partner approval, legal pages, trial enforcement, preview pane, Xero invoices, AML/regulatory, 33 clauses, fee benchmarks, webhooks, QBO, status page. 3 migrations. |
| 10 | 2026-07-01 | c28d9216 | master | engage-backend, engage-frontend | live | **Build 2.0** — e2e fix for build-mode chooser (`advanceToProposalServicesStep` helper); 3 flaky proposal tests green on production. |
| 11 | 2026-07-01 | a83b3a53 | master | engage-backend, engage-frontend | live | UAT automation: `/proposals/first-wizard`, legal/status pages, partner approval API+UI, Xero settings; **36/36 e2e pass**. |
| 12 | 2026-07-01 | 3167538a | master | engage-backend, engage-frontend | live | Services-step edit column full width (preview stacks below); flex-wrap edit fields; deduped wakeup toasts during Render restarts. |
| 13 | 2026-07-01 | bc45724a | master | engage-backend, engage-frontend | live | Production catalogue 43 services + **143 templates** seeded; pricing sanity PASS; **38/38 e2e** green. |
| 14 | 2026-07-02 | 36604df1 | master | engage-backend, engage-frontend | live | Expanded catalogue seed script, T&C auto-attach + watermark UI, proposal restart/back, MD→Managing Director + job role save UX. |
| 15 | 2026-07-02 | e814c9cf | master | engage-backend, engage-frontend | live | **Template build:** auto-seed ICAEW/ACCA library on Templates GET; custom templates additive; 13 lifecycle touchpoint stages with UK copy; library/custom filters; restore defaults in Automation. |
| 16 | 2026-07-02 | e2018d88 | master | engage-backend, engage-frontend | live | **Library backfill fix:** `backfillLibraryTemplateFlagsForTenant` on GET; seed trigger uses `libraryCount` not `totalActive`; API meta adds `libraryActive`/`customActive`. Production: 143 library / 0 custom on demo tenant. |

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Manual mode skips Clara auto-fit | User must control service selection without AI overwriting |
| Price fields as decimal text | `type=number` + `Number()` blocked typing in catalogue modal |
| baseHours hidden in UI | Not used in proposal flow; DB default retained |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| ProposalClientPreview missing on branch | 1 | Removed broken import; Clara sidebar only |

## Blockers / open questions
- Render paid ops **intentionally deferred** until saleable product confirmed — free tier URLs remain live
- `XERO_*`, `AML_WEBHOOK_SECRET`, `CLOUDFLARE_EMAIL_WEBHOOK_SECRET` — set at go-live, not before

## Notes
- Frontend: https://engage-frontend-0g6u.onrender.com
- Backend: https://engage-backend-e1ue.onrender.com
- Manual proposal URL: `/proposals/new?manual=1`