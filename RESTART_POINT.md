# Engage by Capstone — Restart Point

> Saved: 2026-04-05 before system restart

## Current Live URLs

- **Frontend:** https://engage-frontend-0g6u.onrender.com
- **Backend:** https://engage-backend-e1ue.onrender.com
- **Database:** Render PostgreSQL `engage-db`

## Last Commit

`5684f9d5` — fix(render): skip tsc build and use committed prebuilt dist

## What Works

- [x] Backend builds and deploys on Render free tier
- [x] Health check `/ping` returns 200
- [x] CORS configured for actual Render subdomains
- [x] Frontend static site deploys
- [x] **UK Service Catalog seeded** — 20 services inserted for `demo-practice` tenant
  - Seed URL: `POST https://engage-backend-e1ue.onrender.com/api/seed-services-public?key=capstone-uk-2026`
  - Result: `{"success":true,"data":{"created":20,"totalExpected":20}}`

## Known Issues / Next Steps

- [ ] **Auth login broken** — `/api/auth/login` returns `{"error":"Internal server error"}`
  - This is the next highest priority bug. Likely caused by Prisma schema drift (missing columns/models like `PasswordReset`, `TwoFactorBackupCode`, `AIFeedback`) vs what the auth route expects, or by `@prisma/client` enum exports that don't match the live DB.
- [ ] TypeScript compilation has ~20 type errors due to Prisma client enums (`UserRole`, `CompanyType`, `MTDITSAStatus`, `ProposalStatus`, `PricingFrequency`, `ServiceCategory`, `PricingModel`) not being generated. The current workaround is committing prebuilt `backend/dist/` and skipping `tsc` on Render.
- [ ] `render.yaml` build command currently skips `tsc`:
  ```yaml
  buildCommand: |
    npm install &&
    cd backend && npx prisma generate
  ```
  Re-enable tsc once the Prisma schema/client is fully synced.

## Files Modified Since Last Major Checkpoint

- `render.yaml` — simplified build command, actual Render URLs
- `backend/src/index.ts` — inlined public seed endpoint, enum self-healing SQL
- `backend/src/middleware/tenant-simple.ts` — demo-practice fallback
- `backend/scripts/seed-uk-services.js` — 20-service UK catalog
- `backend/start-prod.js` — runs migrations + seed on startup
- `backend/dist/index.js` — **prebuilt and committed** (needed for Render)
- `backend/package.json` — fixed missing comma in build script
- `frontend/src/components/layout/AuthLayout.tsx` — capstone-logo.svg default
- `frontend/src/components/layout/Sidebar.tsx` — capstone-logo.svg default
- `frontend/src/App.tsx` — added auth/settings routes
- `frontend/src/utils/api.ts` — updated base URL handling
- `backend/prisma/migrations/20260405100000_add_per_employee_pricing_model/` — enum fix migration

## Local Dev Recovery

1. `npm install` at repo root
2. `cd backend && npx prisma generate`
3. `npm run dev:backend` or use `start-dev.bat`
4. `npm run dev:frontend`

## Seeding (if DB is ever wiped)

```bash
curl -X GET "https://engage-backend-e1ue.onrender.com/api/seed-services-public?key=capstone-uk-2026"
```

---

**Branch:** `master`  
**Remote:** https://github.com/Will-Massey/engage-from-capstone.git
