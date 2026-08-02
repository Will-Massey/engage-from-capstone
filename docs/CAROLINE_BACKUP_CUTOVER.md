# Caroline Engage — backup + cutover record

**Date:** 2026-08-02  
**Operator:** Grok Build (William approved cutover + backup)

## Backup (Caroline files / code)

| Asset                         | Location                                                                  |
| ----------------------------- | ------------------------------------------------------------------------- |
| **Local backup folder**       | `C:\Users\willi\engage-backups\caroline-pre-cutover-20260802-175337\`     |
| Git bundle (`origin/master`)  | `engage-origin-master.bundle` (~33 MB)                                    |
| Workdir zip (no node_modules) | `engage-from-capstone-workdir.zip` (~13 MB)                               |
| Uncommitted Caroline WIP      | `engage-from-capstone-uncommitted.diff` + `untracked-copy\`               |
| Restore instructions          | `RESTORE.md` in same folder                                               |
| **Remote git tag**            | `backup/caroline-pre-practice-cutover-20260802` → SHA `7b5ea1e` on GitHub |

### Restore code from backup

```bash
git clone C:/Users/willi/engage-backups/caroline-pre-cutover-20260802-175337/engage-origin-master.bundle caroline-restored
# or
git fetch origin tag backup/caroline-pre-practice-cutover-20260802
git checkout -b restore-caroline backup/caroline-pre-practice-cutover-20260802
```

### Database (Caroline live data)

- Production Postgres is on **Neon** (Render `DATABASE_URL`).
- CI creates `pre-deploy-*` Neon branches **before** each master deploy when `NEON_API_KEY` + `NEON_PROJECT_ID` secrets are set (see `ROLLBACK_RUNBOOK.md`).
- This cutover does **not** replace prod DB with practice local DB.
- Migrations: new tables (jobs, letters) + mesh columns; existing `billingFrequency` /
  `priceDisplayMode` are **cast in place** (no drop/recreate) so Caroline proposal lines keep values.

## What cutover does / does not do

| Does                                      | Does not                            |
| ----------------------------------------- | ----------------------------------- |
| Merge Practice OS **code** into `master`  | Copy practice demo DB onto Caroline |
| Apply additive Prisma migrations on boot  | Delete tenants / proposals / files  |
| Keep AccountFlow mesh **mock** by default | Touch live AccountFlow              |
| Keep Render Stripe secrets                | Overwrite with test keys            |

## After merge

1. CI lint/test/e2e on master
2. Pre-deploy Neon branch (if secrets set)
3. Render deploy backend + frontend
4. Smoke: login → proposal → accept → job → inbox/forms
5. If bad: Render rollback + optional Neon restore (`ROLLBACK_RUNBOOK.md`)
