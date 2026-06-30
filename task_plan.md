# Build Plan: Engage by Capstone
<!-- Token handoff file — update at every Render deploy checkpoint. Fresh sessions read THIS, not chat history. -->

## Goal
Engage proposals: isolated per-proposal snapshots, **Templates** catalogue section for pre-made bundles, faster proposal drafting from sidebar.

## Current Phase
Phase: Templates + snapshot isolation — **deployed** (fbed4b5f)

## Next Up
<!-- 3–5 bullets ONLY. Next fresh session starts here. Rewrite every checkpoint. -->
1. Smoke-test live: Sidebar **Catalogue → Templates** → create template → **Use template** → pick client → proposal pre-fills.
2. Smoke-test isolation: complete proposal B with different fees → open proposal A → prices unchanged.
3. Smoke-test Caroline client save + Companies House enrich if not yet verified on production.
4. Set `CLOUDFLARE_EMAIL_WEBHOOK_SECRET` on Render if delivery tracking needed.
5. Optional: custom domain `engage.capstonesoftware.co.uk`.

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
| 6 | 2026-06-30 | fbed4b5f | master | engage-backend, engage-frontend | deploying | Proposal snapshot isolation (48457d71) + Templates sidebar & management page |

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