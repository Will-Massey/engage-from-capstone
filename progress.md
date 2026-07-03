# Build Progress Log
<!-- Append-only session log. Latest deploy checkpoint is the resume entry point. -->

## Session: 2026-07-03 — sendit v3.5 deploy checkpoint

### Deploy checkpoint
- **7-day trial** + premier backlog cleared (Xero deferred to William)
- **Tests:** 123/123 backend Jest pass after schema + pdfGenerator merge fix
- **Superadmin:** `reportPaymentSucceeded` + `reportConversion` on Revolut subscription fulfilment
- **Landing:** capstone-website `/engage` pushed separately

#### Resume prompt
```
Confirm Render deploy green. Revolut live smoke + Superadmin events. William finishes Xero tonight.
```

---

## Session: 2026-07-03 — Flaky e2e hardening + catalogue check

### Checkpoint
- **Catalogue:** 45 active services on production — expanded seed already applied (skip re-run)
- **E2E hardening:** API clean-slate before restore-default test; longer Clara chooser waits; card preview sync
- **Verify:** automation + ai-native 6/6 pass with `--retries=0` (1.4m)

---

## Session: 2026-07-03 — Full build e2e suite on production

### UAT checkpoint
- **gotoApp()** rolled across all `playwright.build.config.ts` specs; API default → `engage.capstonesoftware.co.uk`
- **Result:** 43 tests — **41 passed**, 2 flaky (Clara sidebar step 2+, automation restore-default) — all green after retry (4.4m)

#### Resume prompt
```
Caroline browser sign-off. seed-expanded-uk-services if needed. Harden 2 flaky e2e tests.
```

---

## Session: 2026-07-03 — Yours filter template smoke (templates-smoke 2/2)

### UAT checkpoint
- **API baseline:** 143 library / 0 custom on demo tenant
- **E2E:** `custom template appears under Yours filter, not Engage library` — pass (10.1s)
- **E2E:** full templates-smoke 2/2 pass (52.1s)

#### Resume prompt
```
Caroline browser sign-off. Full build e2e suite. seed-expanded-uk-services if needed.
```

---

## Session: 2026-07-03 — Automation UAT + production routing/auth fixes (89b96435)

### Deploy checkpoint — 89b96435
- **Frontend:** SPA at root for capstonesoftware path-strip proxy; `_redirects` for `/engage/*`
- **Auth:** `SameSite=None` + `.capstonesoftware.co.uk` cookie domain for cross-subdomain SPA
- **E2E:** `gotoApp()` helper; global-setup full `/engage` URLs
- **UAT:** `automation-smoke` 2/2 pass — 13 stages + restore-default; `templates-smoke` 1/1 pass (1.0m total)

#### Resume prompt
```
Caroline browser sign-off on Settings → Automation. Smoke custom template under Yours filter.
```

---

## Session: 2026-07-03 — Automation UAT + frontend asset-path fix (deploying)

### Pre-deploy verification
- **API UAT:** `/api/touchpoints/templates` — 13/13 stages with populated UK subjects on demo tenant ✓
- **Restore-default API:** `POST .../PROPOSAL_ACCEPTED/restore-default` returns Engage wording ✓
- **Bug found:** Production SPA blank — `index.html` referenced `/engage/assets/*` but static host only served `/assets/*` (404). Fixed via `prepare-static-engage.mjs` nesting dist under `/engage/`.
- **E2E:** Added `automation-smoke.spec.ts`; build config base URL → `capstonesoftware.co.uk/engage`

#### Resume prompt
```
Verify frontend deploy live. Run automation-smoke + templates-smoke on production. Caroline browser UAT on Settings → Automation.
```

---

## Session: 2026-07-02 — Caroline Templates UAT + library backfill (e2018d88)

### Deploy checkpoint — e2018d88
- **Label:** Library backfill fix
- **Commit:** `fix: backfill isDefault flags for Engage library templates on GET`
- **Branch:** master (from integrate-deploy)
- **Render services:** engage-backend, engage-frontend
- **UAT result:** Templates page was showing 0 Engage library / 143 Yours — all rows had `isDefault: false` from pre-flag seed. Backfill on GET now promotes package-named rows; live API confirms 143 library / 0 custom. Demo tenant has no Caroline custom template yet (nothing replaced).
- **Also:** `templates-smoke.spec.ts` button selector → `New custom template`

#### Resume prompt
```
Verify e2018d88 live. Caroline: Settings → Automation — 13 stages with subjects + restore-default. Smoke create custom template under Yours filter.
```

---

## Session: 2026-07-02 — Template build deploy (e814c9cf)

### Deploy checkpoint — e814c9cf
- **Label:** Template build
- **Commit:** `Auto-seed Engage template library and populate lifecycle touchpoints`
- **Branch:** master (from integrate-deploy)
- **Render services:** engage-backend, engage-frontend
- **Scope:** Proposal template library auto-seed (`ensureProposalTemplateLibraryForTenant`); touchpoint defaults for all 13 stages; ProposalTemplates library/custom filters; Automation restore-default controls; library templates non-deletable
- **Pre-deploy verification:** backend `tsc` ✓ frontend `tsc` ✓

#### Resume prompt
```
Verify e814c9cf live. Caroline: Templates page shows full library + custom template. Settings → Automation shows populated stage subjects. Smoke custom template create under Yours filter.
```

---

## Session: 2026-07-01 — Build 2.0 deploy (c28d9216)

### Deploy checkpoint — c28d9216
- **Label:** Build 2.0
- **Commit:** `fix(e2e): handle build-mode chooser in proposal builder smoke tests`
- **Branch:** master (from integrate-deploy)
- **Render services:** engage-backend, engage-frontend
- **Scope:** 4 e2e files — `advanceToProposalServicesStep` helper; manual + Clara build-mode paths
- **Pre-deploy verification:** 3/3 targeted tests passed on production (~47s)

#### Resume prompt
```
Verify c28d9216 live. Run full e2e suite. Caroline UAT: partner approval + MFA + pricing.
```

---

## Session: 2026-07-01 — W0–W4 parallel agent batch + deploy (a14a7371)

### Build checkpoint — a14a7371
- **5 parallel agents:** smoke e2e, W1.6 approval, W0/W2 UX, W1/W3 integrations, W4 enterprise
- **77 files, +5444 lines**
- **Builds:** backend ✓ frontend ✓
- **E2E:** 22 pass, 3 fail (pre-existing Clara/add-service on prod), 1 skip (wizard hidden for demo tenant)
- **Migrations:** partner approval, firm group, AML fields
- **Pushed:** `integrate-deploy:master` → Render auto-deploy

#### Resume prompt
```
Verify 3 migrations on production. Caroline UAT: partner approval + MFA + pricing. Set XERO_* env vars.
```

---

## Session: 2026-07-01 — sendit resume: deploy + migration verification

### Verification checkpoint — 845effcf live
- **Backend:** `/ping` + `/health` healthy; DB connected
- **New routes live:** `/api/auth/2fa/login`, `/api/auth/forgot-password`, `/api/xero/connect`, `/api/proposals/bulk-renewal`, `/api/analytics/win-loss`, `/api/engagement-library/*`
- **Migrations (inferred):** `PasswordReset` + 2FA tables/columns working (`forgot-password` 200, `2fa/login` 401 not 500); engagement-library + decline-reason routes registered
- **Frontend:** bundle `index-DJfs409T.js` contains `twoFactor`, `bulk-renewal`, `paymentMandate`, `declineReason`, `pricing-calculator`
- **Next:** smoke-test wizard → bulk renew → sign + payment on production

---

## Session: 2026-07-01 — build upgrade deploy (845effcf)

### Deploy checkpoint — 845effcf
- **Commit:** 845effcf build upgrade: market leader batch — MFA, Xero, payments, wizard, renewals, pricing, compliance
- **Branch:** master (from integrate-deploy)
- **Render services:** engage-backend, engage-frontend
- **Deploy status:** deploying (auto-deploy; 4 new Prisma migrations)
- **Scope:** 83 files, +10k lines — see `MARKET_LEADER_PLAN.md`

#### Migrations to verify on production
- `20260701120000_add_security_2fa_password_reset`
- `20260701120000_add_payment_mandate`
- `20260701120000_engagement_library_versioning`
- `20260701120000_add_decline_reason`

#### Resume prompt
```
Continue per task_plan.md. Last deploy: 845effcf. Verify migrations + smoke wizard, bulk renew, sign payment on production.
```

---

## Session: 2026-07-01 — Market Leader plan + 9 parallel agent tracks

### Planning
- Created `MARKET_LEADER_PLAN.md` (phases W0–W4)
- Spawned 9 subagents; ~49 files changed, +3494 lines

### Implemented (not yet deployed)
- W0.1–W0.2: MFA + password reset
- W1.1–W1.5: Xero scaffold, post-sign payments, bulk renewals
- W2.1–W2.9: AI cost refactor, first proposal wizard, pricing calculator
- W3.1, W3.6: Engagement library versioning, win/loss analytics

### Before deploy
1. Run all Prisma migrations (`20260701120000_*` × 4)
2. Set XERO_* env vars if testing integrations
3. Full build + e2e smoke

#### Resume prompt
```
Deploy market-leader batch: migrate DB → build → smoke wizard + bulk renew + sign payment → /sendit
```

---

## Session: 2026-07-01 — per-client draft isolation deploy

### Deploy checkpoint — 7cc735bb
- **Commit:** 7cc735bb fix: isolate per-client proposal drafts when switching clients mid-build
- **Branch:** master (pushed from integrate-deploy)
- **Render services:** engage-backend, engage-frontend
- **Deploy status:** deploying (Render auto-deploy from master)
- **Fix:** `engage-draft-new-{clientId}` localStorage keys; flush on client switch; legacy key migration

#### Resume prompt
```
Continue per task_plan.md. Last deploy: 7cc735bb on master. Start Next Up #1 — Caroline multi-client draft smoke-test on production.
```

---

## Session: 2026-06-30 — templates smoke-test (sendit resume)

### Smoke-test checkpoint — templates flow
- **Test:** `e2e-tests/specs/templates-smoke.spec.ts` against production
- **Result:** pass (18.9s) — Catalogue → Templates → create → Use template → client → proposal pre-fills
- **Deploy:** fbed4b5f live on engage-frontend-0g6u / engage-backend-e1ue

#### Resume prompt
```
Continue per task_plan.md. Templates smoke-test passed. Start Next Up #1 — proposal snapshot isolation smoke-test on production.
```

---

## Session: 2026-06-30 — templates in play

### Deploy checkpoint — fbed4b5f
- **Commit:** fbed4b5f feat: add Templates section to sidebar with proposal template management
- **Also includes:** 48457d71 proposal/template snapshot isolation fix
- **Branch:** master (integrate-deploy)
- **Render services:** engage-backend, engage-frontend
- **Deploy status:** deploying (Render auto-deploy from master; no hook script)
- **Phase completed this session:** Templates catalogue + snapshot hardening

#### Built this session
- Sidebar **Templates** under Catalogue (next to Services)
- `/templates` management page: create, edit, delete, use template
- `PUT /api/proposal-templates/:id` for edits
- Proposal builder deep-link `?template=<id>`
- Backend: line-item snapshots preserved on save; templates deep-clone serviceConfig

#### Tests
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| frontend build | pass | pass | ok |
| backend build | pass | pass | ok |
| proposalSnapshot.test.ts | pass | pass | ok |

#### Resume prompt
```
Continue per task_plan.md. Last deploy: fbed4b5f on master. Templates in play. Start Next Up #1 — smoke-test Templates → Use template on production.
```

---

## Session: 2026-06-30 — manual proposal deploy

### Deploy checkpoint — 121574bc
- **Commit:** 121574bc feat(proposals): add manual new proposal shortcut on list
- **Branch:** master (integrate-deploy)
- **Render services:** engage-backend, engage-frontend
- **Deploy status:** deploying (sendit hooks triggered)
- **Phase completed this session:** Manual Proposal Builder

#### Built this session
- Build mode picker: scratch vs Clara on step 1
- Service catalogue toggle add/remove + clear all
- Catalogue price field typing fix; base hours removed from UI
- Personalised admin email on proposal acceptance
- E-signature certificate + Cloudflare email webhooks
- **New proposal (manual)** button on proposals list

#### Files touched
- `frontend/src/components/proposals/ProposalBuilder.tsx`
- `frontend/src/pages/proposals/Proposals.tsx`
- `frontend/src/pages/services/Services.tsx`
- `backend/src/services/acceptanceNotificationService.ts`
- (see commits eff1b326 → 121574bc)

#### Tests
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| frontend build | pass | pass | ok |
| backend build | pass | pass | ok |

#### Open issues
- Live smoke-test manual flow not yet run post-deploy

#### Resume prompt
```
Continue build per task_plan.md. Last deploy: 121574bc on master. Phase: Manual Proposal Builder complete. Start with Next Up item 1 — smoke-test New proposal (manual) on production.
```

---

## Earlier sessions

### Deploy checkpoint — fdbc3e8 (ui fixes dark/light)
- **Commit:** fdbc3e8 fix(ui): dark/light theme contrast, spacing, pale glassmorphism enhancements in Settings
- **Branch:** master
- **Render services:** engage-backend, engage-frontend
- **Deploy status:** live