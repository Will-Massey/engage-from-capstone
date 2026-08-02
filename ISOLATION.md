# Engage Practice — isolation from production Engage

**This repo is a clone of Engage used to build the Engager-exceeding product.**  
Production / live Engage stays at `C:\Users\willi\engage-from-capstone` and must not be broken by this work.

| Concern | Production Engage | This clone (`engage-practice`) |
| --- | --- | --- |
| Path | `C:\Users\willi\engage-from-capstone` | `C:\Users\willi\engage-practice` |
| Git remote | `Will-Massey/engage-from-capstone` | same remote for now; use **branch only** `feat/practice-os` — do not merge to master until cutover |
| Backend port | `3001` | **`3101`** |
| Frontend port | `5173` | **`5273`** |
| Postgres DB | `engage_dev` on host `5433` | **`engage_practice_dev`** on host `5433` (same Docker container, separate database) |
| Redis | shared `6379` ok | same; keys are app-scoped by process |
| Product name (dev) | Engage | **Engage Practice** (working title until cutover) |
| Cutover | — | When happy: promote this tree (or merge) and retire old product surface |

## Local env (gitignored)

`backend/.env`:

```
DATABASE_URL=postgresql://engage:engage_dev_password@localhost:5433/engage_practice_dev
PORT=3101
CORS_ORIGIN=http://localhost:5273
```

Create DB once:

```bash
docker exec engage-postgres-dev psql -U engage -c "CREATE DATABASE engage_practice_dev;"
```

## AccountFlow mesh

- **Production AccountFlow:** never called by default (`ACCOUNTFLOW_MESH_MODE=mock`).
- **Clone for experiments only:** `C:\Users\willi\accountflow-practice` branch `feat/mesh-sandbox` — see that tree’s `ISOLATION.md`.
- Live mesh requires **both** `ACCOUNTFLOW_MESH_ALLOW_LIVE=true` and a deliberate AF API — not enabled yet.

## Tandem session

Capstone Tandem session slug: **`engage-practice`**

```powershell
powershell -File C:\Users\willi\grok-chat\tandem.ps1
node C:\Users\willi\grok-chat\grok.mjs status --session engage-practice "..."
```

## Do not

- Point this clone at production Neon / Render env without a separate service
- Run migrations against `engage_dev`
- Push force to `master` from this branch
