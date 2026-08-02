# Engage Practice → Production cutover prep

**Status:** prep only — do **not** cut over until William signs off after UI review.  
**Updated:** 2026-08-02  
**Source tree:** `C:\Users\willi\engage-practice` (`feat/practice-os`)  
**Production tree:** `C:\Users\willi\engage-from-capstone` (master / Render)

---

## Isolation rules (until cutover)

| Concern | Practice (now) | Production |
| --- | --- | --- |
| Path | `engage-practice` | `engage-from-capstone` |
| Branch | `feat/practice-os` only | `master` |
| Backend | `:3101` | Render `engage-backend-e1ue` |
| Frontend | `:5273` | Render `engage-frontend-0g6u` |
| Database | `engage_practice_dev` (local Docker `:5433`) | Render Postgres (never migrate from practice) |
| Stripe | local/dev optional | **Live** `rk_live_*` + webhook secrets on Render |
| AccountFlow mesh | **mock only** | never live until `ACCOUNTFLOW_MESH_ALLOW_LIVE` |

**Never:**

- Merge `feat/practice-os` to master without explicit cutover approval  
- Point practice seed scripts at production DB  
- Run `prisma migrate deploy` against production from the practice tree  
- Overwrite Render env with `sk_test` / practice secrets  

---

## What ships on cutover (2026-08-02 feature inventory)

### Practice OS (jobs → cash loop)

- Jobs model + spawn on proposal accept  
- Jobs board (kanban + list), bulk move, filters, workload **+ utilisation**  
- Job detail: phases, checklists, tasks, **@mentions**, **notes → tasks**, time, chase packs, Clara draft chase, files  
- **Clara prioritise board** ranking  
- Practice letters + **block designer**  
- Client Jobs tab + **Comms** (email timeline + SMS draft/send)  
- Portal: jobs/files, soft metal chrome, **records pack form**  
- Automations: UK packs, local builder, **server rules save/run**  
- Dashboard: delivery pipeline, **Cash & recurring**, **dunning queue**  
- Metal Mint UI (mirror chrome tiles, BrandLogo light/dark)  

### Money / dunning

- Recurring MRR snapshot + cash under management  
- Dunning queue: failed recurring + unpaid accepted  
- Staff **billing portal** link + **invoice retry** (when Stripe invoice id known)  
- Job **complete → renewal window** nudge  

### Already production-safe (from earlier)

- MFA / password reset (W0)  
- Signature forensic certificate PDF/JSON (Audit tab)  
- Stripe Connect webhooks repaired 2026-08-01  

### Must verify before merge

1. Prisma migrations apply cleanly on a **copy** of prod schema (or staging), not prod  
2. `spawnJobForProposal` does not double-spawn on re-accept  
3. Storage path for portal files is Render-safe (`UPLOADS_BACKEND` / R2)  
4. Clara / xAI key present on Render (`XAI_API_KEY` already set)  
5. Twilio optional — SMS drafts work without `TWILIO_*` env  
6. No dual-header regressions on jobs/letters/automations  
7. E2E green:  
   - `e2e-tests/specs/practice-jobs-letters.spec.ts`  
   - `e2e-tests/specs/practice-w3-surfaces.spec.ts`  

---

## Suggested cutover sequence (when approved)

1. **Freeze** practice feature work; UI sign-off screenshots in `docs/ui-shots/`  
2. **Branch strategy:** PR `feat/practice-os` → `master` in `engage-from-capstone` (or agreed path)  
3. **Migrations:** review `backend/prisma/migrations/*` — deploy with `prisma migrate deploy` on Render boot only after PR merge  
4. **Seed:** do **not** run practice demo seed on prod  
5. **Deploy:** backend then frontend (Render auto-deploy on master)  
6. **Smoke:** login → accept proposal → job → checklist → chase → letter → dunning panel  
7. **Stripe:** confirm Connect + platform webhooks still 200  
8. **Rollback:** previous Render deploy; additive migrations leave tables  

---

## Demo (practice)

- App: http://localhost:5273  
- API: http://localhost:3101  
- Login: `admin@demo.practice` / `DemoPass123!`  

## Sign-off checklist

- [ ] William UI walkthrough (Jobs, Workload, Letters, Automations, Portal, Cash/Dunning, Comms)  
- [ ] E2E practice suites green  
- [ ] Migration review by second pair of eyes  
- [ ] Stripe test event 200 on both endpoints after last deploy  
- [ ] AccountFlow mesh remains mock until separate decision  
- [ ] Explicit “cut over now” message from William  

**Blocked:** production cutover until the last box is checked.

---

## Dry-run package

See **`docs/CUTOVER_DRY_RUN.md`** for migration inventory, PR outline, and post-deploy smoke table (no production actions).
