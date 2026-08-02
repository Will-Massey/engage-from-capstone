# Engage Practice — Build Plan (Capstone Tandem)

<!-- Isolated clone of Engage. Production Engage remains at engage-from-capstone. -->

## Goal

Ship a full practice product that **exceeds Engager.app** (jobs, portal, automations, time, admin letters) while keeping Engage’s moat (Clara, CH→price→sign→cash). Cut over when happy; until then production Engage is untouched.

## Session

- Capstone Tandem: `--session engage-practice`
- Spec: `docs/ENGAGER_COMPETITIVE_ANALYSIS_AND_PLAN.md`
- Isolation: `ISOLATION.md` (ports 3101/5273, DB `engage_practice_dev`)
- **Morning resume:** `docs/MORNING_HANDOFF.md`

## Current phase

**2026-08-02** — B mobile shells + C integrations hub/mesh batch + D cutover dry-run docs.

## Next up

1. Explicit “cut over now” only after William UI sign-off  
2. AF mesh live only when ALLOW_LIVE (still mock by default)  
3. `npx cap add android` when Android SDK available

## Phases

| Phase | Status |
| --- | --- |
| Isolation & product fork | **done** |
| V Visual system | **improved** |
| P0–P5 core practice OS | **demo-complete** (jobs, letters, workload, portal, automations catalogue, Clara chase) |
| AFK polish #1–#2 + night close | **done** |
| P6 Trust/mobile/GTM | pending |
| Cutover replace Engage | blocked until happy |

## Demo

- URL: http://localhost:5273 · API: http://localhost:3101  
- Login: `admin@demo.practice` / `DemoPass123!`  
- E2E: `e2e-tests/specs/practice-jobs-letters.spec.ts` (8 tests)

## Notes

- Never migrate `engage_dev` from this tree  
- Stripe live webhooks repaired 2026-08-01 (not caused by practice) — see CUTOVER_PREP  
- Do not merge to master without cutover checklist  
