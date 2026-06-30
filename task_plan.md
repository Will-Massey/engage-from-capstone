# Build Plan: Engage by Capstone
<!-- Token handoff file — update at every Render deploy checkpoint. Fresh sessions read THIS, not chat history. -->

## Goal
Polish the Engage by Capstone React SPA with high-contrast dark/light theme fixes (especially Settings), improved spacing, and beautiful pale colour tints to maximise glassmorphism in light mode.

## Current Phase
Phase: UI Polish & Theme — **in_progress**

## Next Up
<!-- 3–5 bullets ONLY. Next fresh session starts here. Rewrite every checkpoint. -->
1. Smoke-test the UI fixes live on Render (Settings tabs, theme picker, glass cards, budget meter, forms in dark + light).
2. Verify contrast and pale glass effect across ProposalBuilder, dialogs and main layout.
3. Address any remaining low-contrast elements or mobile spacing.
4. Update handoff / docs if more polish needed.
5. Continue with next roadmap item (e.g. E2E or other polish).

## Phases
<!-- Status: pending | in_progress | complete -->

### Phase 1: Core AI & Proposals
- Clara streaming email, cheap revise, CTAs, analysis, voice, etc.
- **Status:** complete

### Phase 2: Features & Polish Prep
- Profile fixes, dedup, theme store basics.
- **Status:** complete

### Phase 3: Roadmap Completion
- Full low-token Clara surfaces, empty states, budget meter, etc.
- **Status:** complete

### Phase 4: UI Theme & Glassmorphism
- Dark contrast & spacing in Settings
- Pale tints + glass effect in light mode
- **Status:** in_progress

### Phase 5: Verify & deploy
- [x] Local build/tests pass (typecheck clean)
- [x] Pushed to Render (fdbc3e8)
- [ ] Smoke-test live URL
- **Status:** pending

## Deploy Checkpoints
<!-- Append one row per Render push. This is the resume anchor. -->

| # | Date (UTC) | Commit | Branch | Render services | Status | Notes |
|---|------------|--------|--------|-----------------|--------|-------|
| 1 | 2026-06-30 | fdbc3e8 | master | engage-backend, engage-frontend | deploying | UI dark/light fixes (contrast, spacing, pale glass in Settings) |

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| | |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| | 1 | |

## Blockers / open questions
-

## Notes
- `/sendit` = push + hooks + checkpoint + `sendit.resume`; then `/clear` + `/sendit resume` (auto-resume from file)
- Or `/build-handoff checkpoint` after manual push, then `/clear` + `/sendit resume`
- Never `/resume` old chat when these files exist