# Morning handoff — Engage Practice

**When:** 2026-08-01 night → finish in the morning  
**Tree:** `C:\Users\willi\engage-practice` · branch `feat/practice-os`  
**Production:** `engage-from-capstone` **untouched** for practice features (Stripe webhooks repaired separately)

---

## Start here (2 minutes)

```powershell
# If not already running:
# Backend  :3101  ·  Frontend :5273  ·  DB engage_practice_dev on :5433
cd C:\Users\willi\engage-practice\backend
# use start-dev.cmd or prior env (see ISOLATION.md)
cd C:\Users\willi\engage-practice\frontend
# npx vite --port 5273 --strictPort  (VITE_API_URL=http://localhost:3101/api)
```

| | |
|--|--|
| App | http://localhost:5273 |
| Login | `admin@demo.practice` / `DemoPass123!` |
| Isolation | `ISOLATION.md` |
| Cutover | `docs/CUTOVER_PREP.md` — **only after you say happy** |
| Competitive plan | `docs/ENGAGER_COMPETITIVE_ANALYSIS_AND_PLAN.md` |

---

## What is effectively complete

### Practice OS (shippable demo)

| Area | Status |
|------|--------|
| Jobs board (DnD + list + filters + staff) | Done |
| Job detail (phases, complete-all, time+rate, profitability, chase, Clara, files) | Done |
| Spawn job on proposal accept + manual spawn panel on accepted proposal | Done |
| Workload by staff | Done |
| Practice letters (disengage / clearance / 64-8, print/copy) | Done |
| Client Jobs tab + clients list job counts | Done |
| Dashboard delivery pipeline + at-risk | Done |
| Automations catalogue | Done (crash fixed) |
| Portal jobs/files polish | Done |
| E2E `practice-jobs-letters.spec.ts` | **8/8** last green |
| Unit tests (spawn, deadline, chase, letters) | **13/13** |

### Production Stripe (separate)

- Live Connect + platform webhook secrets rotated; old dupes disabled  
- Signed probes **200**  
- Optional code harden (`account.updated` no-500) in both trees — **deploy when convenient**

---

## Walk the product (sign-off path)

1. Login → Dashboard (delivery pipeline, needs attention)  
2. **Jobs** — board / list / overdue filter / drag card  
3. Open a job — complete checklist, log time with rate, Clara chase  
4. **Workload**  
5. Accepted **proposal** → Delivery job panel → Open job  
6. **Client** → Jobs tab  
7. **Letters** → generate / print  
8. **Automations**  
9. Sidebar red badge on overdue Jobs  

---

## Still intentionally incomplete (morning / later)

| Item | Notes |
|------|--------|
| Visual if-this-then-that builder | Catalogue only today |
| SMS / live HMRC 64-8 API | Out of scope tonight |
| Playwright in CI | Spec exists; wire CI later |
| Git commit of `feat/practice-os` | Large uncommitted set — review then commit |
| **Cutover** | Blocked until explicit approval |
| P6 trust/mobile/GTM | Pending |

---

## Suggested morning order

1. Boot stack + UI walkthrough (above)  
2. Fix any “feels unfinished” UI you notice  
3. `npx playwright test specs/practice-jobs-letters.spec.ts --project=chromium` from `e2e-tests/`  
4. Commit `feat/practice-os` with a clean message (not merge to master)  
5. Only if happy: cutover per `docs/CUTOVER_PREP.md`  

### E2E command

```powershell
cd C:\Users\willi\engage-practice\e2e-tests
$env:FRONTEND_URL='http://localhost:5273'
$env:API_URL='http://localhost:3101'
$env:TEST_USER_EMAIL='admin@demo.practice'
$env:TEST_USER_PASSWORD='DemoPass123!'
npx playwright test specs/practice-jobs-letters.spec.ts --project=chromium
```

---

## New since last AFK note

- Proposal detail **Delivery job** panel (find/spawn/open)  
- Job phase **Complete all / Reopen**  
- Jobs list filter `?proposalId=`  
- Clients list: soft cards + job counts (`_count.jobs`)  
- Automations `.join` crash fix  
- Login toast “Engage Practice”  
- Stripe prod repair + cutover/morning docs  

---

## Do not

- Merge to master / deploy practice schema to prod without cutover checklist  
- Point seed scripts at production DB  
- Re-run `wire-stripe-render.ps1` with **test** `.engage-stripe.env` against live Render  
