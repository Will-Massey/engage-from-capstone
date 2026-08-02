# Engage Practice → Production cutover dry-run

**Date:** 2026-08-02  
**Mode:** documentation only — **no** merge, deploy, or production DB access  
**Source:** `C:\Users\willi\engage-practice` (`feat/practice-os`)  
**Target:** `C:\Users\willi\engage-from-capstone` → Render (`engage-backend-e1ue` / `engage-frontend-0g6u`)  
**Full prep:** `docs/CUTOVER_PREP.md`

---

## 1. Preconditions (all must be true before real cutover)

| # | Check | Owner |
|---|--------|--------|
| 1 | William UI sign-off on practice stack | William |
| 2 | Explicit message: **“cut over now”** | William |
| 3 | Stripe live webhooks still 200 (already repaired 2026-08-01) | Ops |
| 4 | Staging migration dry-run on a **copy** of prod schema (not prod) | Eng |
| 5 | E2E green: `practice-jobs-letters` + `practice-w3-surfaces` | Eng |
| 6 | AccountFlow remains **mock** unless separate live decision | Eng |

---

## 2. Migration inventory (practice-era, review before deploy)

These folders exist under `backend/prisma/migrations/` and are the main practice delta vs pre-jobs Engage:

| Migration | Intent |
|-----------|--------|
| `20260801093026_practice_jobs` | Job, phases, checklist, tasks, time, portal files, activity |
| `20260801100747_practice_letters` | PracticeLetter admin letters |
| `20260802120000_accountflow_mesh` | Capstone client graph / AF link fields on Client |

**Earlier migrations** (money pence, MFA, signatures, etc.) may already be on production if master was kept current — **diff migration tables** before deploy:

```bash
# On a staging DB copy only — never production from practice tree
cd engage-from-capstone/backend
# After merging code:
npx prisma migrate status
npx prisma migrate deploy   # staging only first
```

**Rule:** never `migrate deploy` against production from `engage-practice` path.

---

## 3. PR outline (when approved)

**Title:** `feat: Practice OS — jobs, metal UI, money loop, GTM (cutover)`

**Base:** `master` on `engage-from-capstone` (or agreed monorepo remote)  
**Head:** content of `engage-practice` `feat/practice-os` (merge strategy TBD by owner)

### PR description skeleton

```markdown
## Summary
Ships Engage Practice OS: jobs board, workload, letters, automations, portal,
Clara prioritise, dunning, CSV import, GTM pages, AccountFlow mesh mock.

## Isolation
- Built in engage-practice isolation (ports 3101/5273, engage_practice_dev).
- Production AF not contacted (mesh mock).
- Stripe live webhooks previously repaired; no sk_test overwrite.

## Migrations
- See CUTOVER_DRY_RUN.md §2
- Staging migrate status attached

## Test plan
- [ ] Staging migrate deploy
- [ ] Smoke: login → accept proposal → job → checklist → letter
- [ ] E2E practice specs
- [ ] Stripe ping 200
- [ ] Rollback plan acknowledged (ROLLBACK_RUNBOOK.md)
```

### Files / areas to expect in diff

- `backend/prisma/schema.prisma` + migrations above  
- `backend/src/routes/jobs.ts`, `practiceLetters.ts`, `integrations.ts`, `clara.ts`, `payments.ts`, `clients.ts`  
- `frontend` jobs/letters/automations/gtm/metal  
- `.github/workflows/practice-e2e.yml`  

---

## 4. Smoke checklist (post-deploy staging, then prod)

| Step | Pass? |
|------|-------|
| Login staff user | ☐ |
| Dashboard: Cash & recurring tiles load | ☐ |
| Accept test proposal → job appears on board | ☐ |
| Job: checklist toggle, task add, notes→tasks | ☐ |
| Clara prioritise panel (or calm empty) | ☐ |
| Letter generate draft | ☐ |
| Automations: UK pack install + dry-run | ☐ |
| Client import CSV (1 sample row) | ☐ |
| Portal link: form + files | ☐ |
| Dunning panel loads (empty OK) | ☐ |
| `/status` public page | ☐ |
| Integrations hub + AF sandbox mock | ☐ |
| Stripe webhook signed ping 200 | ☐ |

---

## 5. Rollback (high level)

1. Redeploy previous Render deploy for backend + frontend.  
2. Additive migrations leave tables; do not drop Job* without a plan.  
3. See `docs/ROLLBACK_RUNBOOK.md`.

---

## 6. Explicit non-actions (this dry-run)

- [x] No merge to master  
- [x] No Render deploy from this session  
- [x] No production DATABASE_URL usage  
- [x] No `ACCOUNTFLOW_MESH_ALLOW_LIVE=true`  

**Next action for real cutover:** William says **“cut over now”** after UI walkthrough.
