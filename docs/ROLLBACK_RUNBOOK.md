# Rollback Runbook

How to get production back to a known-good state. Production topology:
Cloudflare Worker `engage-proxy` (`capstonesoftware.co.uk/engage*`) → Render
(`engage-backend-e1ue` web service + `engage-frontend-0g6u` static site) →
**Render Postgres** `engage-db` (`dpg-d6qkjbma2pns73a2qoe0-a`, database
`engage_production`). Deploys are triggered **only** by the `deploy` job in
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

## 3. Database restore

Production data lives in the **Render Postgres** instance `engage-db`
(`dpg-d6qkjbma2pns73a2qoe0-a`, database `engage_production`, PG 18).

> The Neon project `purple-scene-01932805` is **not** production. It is a stale
> copy last migrated 5 July 2026, with none of the jobs/mailbox/forms tables.
> CI used to snapshot it before every deploy, which meant deploys ran with no
> real safety net while appearing protected. Restoring from it would silently
> roll production back to July.

1. **Stop writes first**: suspend the Render backend (dashboard → Settings →
   Suspend) so users don't write to a database you're about to replace.
2. Render dashboard → **engage-db** → **Backups**, and restore the most recent
   point before the incident. The connection string is unchanged by a restore,
   so no `DATABASE_URL` edit is needed afterwards.
3. Resume the backend and verify: sign in, load the dashboard, and confirm
   recent records are present.

**Retention: 7 days**, confirmed on the `basic_256mb` plan (10 Aug 2026). You
can restore to any point inside that window, so recovery is not limited to
whole-day snapshots. Anything older than 7 days is unrecoverable — a longer
horizon means a plan upgrade or scheduled dumps to private storage (not GitHub
artifacts, which would put client records in CI storage).

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
