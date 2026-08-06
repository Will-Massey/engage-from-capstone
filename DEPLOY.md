# Deploy Engage — Neon + Render

**Production stack:** Neon Postgres + Render (backend + frontend) + Cloudflare Worker proxy.

**Live app:** https://capstonesoftware.co.uk/engage

## 1. Database (Neon)

1. Create or use the Engage Neon project (Postgres).
2. Copy the connection string into Render as `DATABASE_URL` (pooled URL for the app if you use Neon pooling).
3. Migrations run on deploy / boot via `prisma migrate deploy` (see CI and Render start command).

Never point practice/local seed scripts at production Neon.

## 2. Backend (Render)

Service: `engage-backend` (example host: `engage-backend-e1ue.onrender.com`)

Required env (minimum):

- `DATABASE_URL` — Neon
- `JWT_SECRET` / `JWT_REFRESH_SECRET` — ≥32 chars
- `NODE_ENV=production`
- `FRONTEND_URL=https://capstonesoftware.co.uk/engage`
- Stripe / SMTP / encryption secrets as configured in Render

Health: `GET /health` and `GET /ping`

Deploy: merge to `master` (CI **Deploy to Render**) or trigger deploy from the Render dashboard.

## 3. Frontend (Render)

Static site / web service built with:

- `VITE_APP_BASE=/engage/` (or as set for the worker path)
- `VITE_API_URL=/api` (same-origin via Cloudflare → backend)

Public URL path: `https://capstonesoftware.co.uk/engage`

## 4. Edge (Cloudflare)

Worker `workers/engage-proxy` routes `capstonesoftware.co.uk/engage*` to Render.

If `/engage/api/*` returns HTML, re-deploy the worker (`wrangler deploy`).

## 5. Checklist after deploy

- [ ] `curl -sf https://capstonesoftware.co.uk/engage/ping` → JSON ok
- [ ] `curl -sf https://engage-backend-e1ue.onrender.com/health` → healthy
- [ ] Login page loads: https://capstonesoftware.co.uk/engage/login
- [ ] Migrations applied (no pending in Render logs)

## 6. Rollback

1. Render dashboard → previous deploy for backend and frontend
2. Neon point-in-time / branch restore if a bad migration landed (see `docs/ROLLBACK_RUNBOOK.md`)
3. Pre-cutover git tag if code-only rollback: `backup/caroline-pre-practice-cutover-20260802`

See also: `docs/agent-handover.md`, `RENDER_API_SETUP.md`, `.github/workflows/ci-cd.yml`.
