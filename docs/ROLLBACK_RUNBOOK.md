# Rollback Runbook

How to get production back to a known-good state. Production topology:
Cloudflare Worker `engage-proxy` (`capstonesoftware.co.uk/engage*`) → Render
(`engage-backend-e1ue` web service + `engage-frontend-0g6u` static site) → Neon
Postgres. Deploys are triggered **only** by the `deploy` job in
`.github/workflows/ci-cd.yml` after lint + test + e2e pass on `master`
(`autoDeploy` is off in `render.yaml`).

## 1. Decide what actually broke

| Symptom                                     | Likely rollback                                       |
| ------------------------------------------- | ----------------------------------------------------- |
| Bad code/UI behaviour, 500s after a deploy  | App rollback (§2) — fastest, no data risk             |
| Migration broke the schema / data corrupted | DB restore (§3) + app rollback to the matching commit |
| Only the frontend is wrong                  | Rollback just `engage-frontend-0g6u` (§2)             |

App rollback is safe by default. DB restore **loses writes made after the
restore point** — treat it as the last resort and check §3 first.

## 2. App rollback (Render)

Fastest path — Render dashboard:

1. Open the service (`engage-backend-e1ue` or `engage-frontend-0g6u`) →
   **Deploys** tab.
2. Find the last known-good deploy → **⋮ → Rollback to this deploy**.
   This redeploys the previous build image; no rebuild, ~1–2 min.

Or via API (same call CI uses, pinned to a commit):

```bash
curl -X POST "https://api.render.com/v1/services/$SERVICE_ID/deploys" \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"commitId": "<known-good-sha>"}'
```

Or via git — revert the bad commit and let CI deploy the revert:

```bash
git revert <bad-sha> && git push origin master   # deploys only if CI is green
```

**Caveat:** rolling back the backend does NOT undo migrations already applied
at boot (`start-prod.mjs` runs `prisma migrate deploy`). Migrations are written
to be additive/idempotent, so old code on a newer schema is normally fine. If
the migration itself is the problem, see §3.

## 3. Database restore (Neon)

Before every production deploy, CI creates a Neon branch named
`pre-deploy-<UTC timestamp>-<short sha>` (the 5 newest are kept). Neon also has
point-in-time restore within the project's history retention window, so you
can restore to any moment, not just the snapshot.

1. **Stop writes first**: suspend the Render backend (dashboard → Settings →
   Suspend) so users don't write to a database you're about to replace.
2. Neon console → project → **Branches** (or **Restore**):
   - From snapshot: find the `pre-deploy-…` branch taken before the bad deploy.
   - Point-in-time: pick the production branch and a timestamp just before the
     incident.
3. Use **Restore** on the production branch (Neon swaps its state to the chosen
   source; the connection string stays the same, so no Render env change).
   Neon keeps a backup branch of the pre-restore state — writes made after the
   restore point live there if you need to salvage anything.
4. If the restore was to undo a migration, also roll the app back (§2) to the
   commit that matches the restored schema — otherwise boot re-applies the
   migration.
5. Resume the Render backend, then verify (§4).

CLI equivalent: `neonctl branches list --project-id <id>` /
`neonctl branches restore <production-branch> <source>`.

## 4. Verify after any rollback

```bash
curl -sf https://engage-backend-e1ue.onrender.com/health        # backend up
curl -sfI https://capstonesoftware.co.uk/engage/ | head -1      # via CF worker
```

Then log in at https://capstonesoftware.co.uk/engage/login and open a proposal
(exercises DB reads + auth cookies end-to-end).

## 5. Required secrets (GitHub → repo → Settings → Secrets)

| Secret                                                                      | Used for                                                                              |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `RENDER_API_KEY`, `RENDER_BACKEND_SERVICE_ID`, `RENDER_FRONTEND_SERVICE_ID` | CI-gated deploys + API rollback                                                       |
| `NEON_API_KEY`, `NEON_PROJECT_ID`                                           | Pre-deploy backup branch (deploy job skips backup with a warning until these are set) |
