# Build Plan: Engage by Capstone
<!-- Token handoff file — update at every Render deploy checkpoint. Fresh sessions read THIS, not chat history. -->

## Goal
**Market leader:** UK proposal-to-cash platform — CH lookup → priced proposal → signed engagement → collected fees, with Clara AI that saves 30+ min/proposal without token overspend. Full plan: `MARKET_LEADER_PLAN.md`.

## Current Phase
Phase W0–W4 batch — **deployed** (a14a7371) full market-leader remainder

## Next Up
<!-- 3–5 bullets ONLY. Next fresh session starts here. Rewrite every checkpoint. -->
1. Verify Render deploy a14a7371 + 3 Prisma migrations applied on production.
2. Caroline UAT: partner approval flow, MFA, pricing calculator, Xero connect.
3. Set Render env: `XERO_*`, `AML_WEBHOOK_SECRET`, `CLOUDFLARE_EMAIL_WEBHOOK_SECRET`.
4. Fix 3 flaky production e2e tests (Clara sidebar, add-service review step).
5. W0.3 custom domain + Render Starter disk (manual dashboard).

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
- [ ] Live smoke-test manual proposal flow
- **Status:** in_progress

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
| 9 | 2026-07-01 | a14a7371 | master | engage-backend, engage-frontend | deploying | W0–W4 remainder: partner approval, legal pages, trial enforcement, preview pane, Xero invoices, AML/regulatory, 33 clauses, fee benchmarks, webhooks, QBO, status page. 3 migrations. |

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
- `CLOUDFLARE_EMAIL_WEBHOOK_SECRET` still manual on Render

## Notes
- Frontend: https://engage-frontend-0g6u.onrender.com
- Backend: https://engage-backend-e1ue.onrender.com
- Manual proposal URL: `/proposals/new?manual=1`