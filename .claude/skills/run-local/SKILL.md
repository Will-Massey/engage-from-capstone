---
name: run-local
description: Launch and drive the Engage app locally on this machine — start Docker dependencies, boot backend + frontend, log in, and exercise flows via browser or API. Use whenever asked to run, start, launch, demo, or test the Engage app locally, to verify a change works in the running app, to log into the local app, or when the local backend/frontend/database is down or misbehaving. Encodes this machine's port workarounds (Postgres on 5433, not 5432) — do not launch from generic patterns.
---

# Run Engage locally

Verified end-to-end on 2026-07-10 on this Windows machine. The setup has two
machine-specific quirks — Postgres on a non-standard port and a gitignored env
override — that generic launch patterns will get wrong.

## 1. Dependencies (Docker)

Docker Desktop must be running (`docker info` to check; launch
`C:\Program Files\Docker\Docker\Docker Desktop.exe` and poll if not).

```bash
docker start engage-postgres-dev engage-redis
docker exec engage-postgres-dev pg_isready -U engage   # wait for this
```

- **Postgres runs on host port 5433**, container `engage-postgres-dev`
  (user `engage`, password `engage_dev_password`, db `engage_dev`, volume
  `engage_postgres_data`). Port 5432 is owned by another project's container
  plus a native Windows Postgres service — never bind 5432, and never assume a
  5432 connection reached Engage's DB (symptom: Prisma "Authentication failed"
  means you hit the _wrong_ Postgres).
- Redis is standard: container `engage-redis` on 6379.

If `engage-postgres-dev` doesn't exist (fresh machine), recreate it:

```bash
docker run -d --name engage-postgres-dev --restart unless-stopped -p 5433:5432 \
  -e POSTGRES_USER=engage -e POSTGRES_PASSWORD=engage_dev_password \
  -e POSTGRES_DB=engage_dev -v engage_postgres_data:/var/lib/postgresql/data \
  postgres:15-alpine
```

## 2. Env override (gitignored — will not survive a fresh clone)

`backend/.env` must exist with the 5433 override; `config/env.ts` loads it
last with `override: true` in dev:

```
DATABASE_URL=postgresql://engage:engage_dev_password@localhost:5433/engage_dev
```

## 3. First-time database setup (skip if already migrated/seeded)

```bash
cd backend
DATABASE_URL=postgresql://engage:engage_dev_password@localhost:5433/engage_dev npx prisma migrate deploy
npx prisma generate
npm run db:seed        # seed-enhanced.ts — 28 templates, 8 clients, 5 proposals
```

## 4. Launch

```bash
npm run dev            # FROM THE REPO ROOT
```

Run it from the repo root — it's an npm-workspaces monorepo and `npm run dev`
in `backend/` starts only the backend (no Vite). Backend: `localhost:3001`,
frontend: `localhost:5173`.

Readiness: grep the output for `running on port 3001`, or `curl
localhost:3001/health` — the health route is **`/health`, not `/api/health`**
(that 404s and, worse, failed login-shaped probes count against the auth rate
limiter).

## 5. Log in

Demo credentials (seeded): `admin@demo.practice` / `DemoPass123!`
(also `manager@` and `senior@demo.practice`, same password).

- **Browser**: Playwright MCP → navigate `http://localhost:5173`, fill the
  email/password fields, click "Sign in" → dashboard as Sarah Johnson,
  Smith & Associates Accounting.
- **API**: login returns a CSRF token; mutating requests need it as a header
  plus the session cookies:

```bash
curl -s -c cookies.txt -X POST localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.practice","password":"DemoPass123!"}'
# → data.csrfToken; then:
curl -s -b cookies.txt -X POST localhost:3001/api/proposals \
  -H "Content-Type: application/json" -H "X-CSRF-Token: <token>" -d '{...}'
```

Note: entities are tenant-scoped — a proposal's `clientId` and `serviceId`s
must belong to the same tenant or you get `INVALID_SERVICES`.

## Troubleshooting

- **`AUTH_RATE_LIMIT` on login** — 20 failed attempts per 15 min per IP.
  The store is Redis when Redis was up at boot, otherwise in-memory (restart
  clears it). Failed probes during a DB outage burn the budget fast.
- **`EADDRINUSE: 3001` / restart doesn't change behaviour** — Windows orphans
  the tsx/vite children when the parent npm process is killed; the _old_
  backend keeps serving. Kill by port before relaunching:
  `Get-NetTCPConnection -LocalPort 3001 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`
  (same for 5173).
- **Prisma "Authentication failed" at 5432** — you're talking to the wrong
  Postgres (see §1); check `backend/.env` exists.
- **Boot log noise about Redis ECONNREFUSED** — Redis container not started;
  the app runs but rate limiting falls back to per-process memory.
- **Stripe webhooks locally** — events don't arrive without
  `stripe listen --forward-to localhost:3001/api/webhooks/stripe-connect`.

## Tests / checks

```bash
cd backend && npx tsc --noEmit && npx jest    # full suite ~8 min; scope with a path
```
