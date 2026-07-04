# Engage — Premier Service TODO

**Goal:** Become the premier UK accountancy proposal platform.

**Last updated:** 3 July 2026 (backlog sprint + 7-day trial + Render deploy)

**Test status:** Backend Jest **91/91** · Frontend Vitest **13/13** · Frontend typecheck **pass**

---

## P0 — Trust & revenue ✅

### Pricing engine integrity
- [x] Unify `pricingEngine_v2` as sole backend source; shared package canonical
- [x] Fix ONE_TIME → MONTHLY display bug in `ProposalBuilder.tsx`
- [x] Fix POST `lineTotal` to use discounted `netTotal`
- [x] Mirror v2 in `@uk-proposal-platform/shared`; frontend imports shared
- [x] Jest: all billing cycles × discount × VAT combinations (91 tests)
- [x] Vitest: ProposalBuilder summary bands match API
- [x] E2E: create → save → reload → detail total parity (`proposal-pricing.spec.ts`)

### E-signature forensics
- [x] Migration: `signerEmail`, `documentHash`, `termsHash`, `consentText`, `signatureType`
- [x] SHA-256 document + terms hash at sign time
- [x] Require signer email + authorisation checkbox on public sign form
- [x] IP geolocation enrichment (ip-api.com JSON in `geoLocation`)
- [x] Signature Certificate PDF block in `pdfGenerator.ts`
- [x] `UPLOADS_DIR` defaults to `/var/data/uploads` when `DATA_DIR` set
- [x] Signature audit tab on ProposalDetail
- [x] Staff in-app accept uses same forensic path as public sign (`recordElectronicSignature`)

### SaaS billing go-live
- [ ] Render **Starter** + 10 GB disk at `/var/data` — **manual Render dashboard**
- [x] Revolut sandbox → live checkout smoke — **tested Jul 2026** (Merchant checkout, payment/setup, webhook fulfilment)
- [x] Stripe + Revolut tier config; annual plans (−15%) in `stripe.ts` / `revolut/plans.ts`
- [x] **7-day** trial on tenant signup + `trialEndsAt` + Superadmin `reportTrialStarted`
- [x] Tier limits middleware (users/clients/proposals) — 402 when over limit
- [x] Trial expiry blocks proposal email send (403)
- [x] `reportConversion` on paid checkout fulfilment (Revolut fulfilment)
- [x] Settings subscription display (existing Subscription page)

### Production reliability
- [x] Forgot-password flow (auth routes + ForgotPassword + ResetPassword + App routes)
- [x] `/proposals/:id/edit` route (`EditProposal.tsx`)
- [x] Superadmin 6/6 integration checks — HMAC ingest verified Jul 2026 (`scripts/verify-superadmin-integration.mjs`)
- [ ] Render: remove stale `SUPERADMIN_API_KEY` or rotate via `npm run setup:engage` (stale key blocks tenant sync)
- [ ] Production smoke per `VERIFICATION_ROADMAP_2026-06-30.md` — **manual**

---

## P1 — Premier differentiators ✅

### Clara-first proposal wizard
- [x] Dashboard CTA **"Create proposal in 5 minutes"** → `/proposals/wizard`
- [x] 5-step wizard: Client → Clara auto-fit → Pricing → Email → Send
- [x] Section accept/reject cards
- [x] Split pane: editor left, client preview right
- [x] Clara empty-state tips on Clients, Proposals, Services lists

### MTD & regulatory fit
- [x] `regulatoryFitService.ts` — MTD clause + AML block rules
- [x] `GET /api/proposals/:id/regulatory-fit`
- [x] `POST /api/ai/pricing-advisor`
- [x] `/api/ai/regulatory-alerts` returns real tenant alerts
- [x] Settings MTD explainer (Billing tab)

### Client journey excellence
- [x] Mobile signing step flow in `ProposalView.tsx`
- [x] Decline with reason → `POST /api/proposals/view/:token/decline`
- [x] Post-sign Clara onboarding checklist (`onboardingChecklistService.ts`)
- [x] Reminder automation: unopened 3d, unsigned 7d, expiring 30d (daily cron)
- [x] Acceptance email + certificate in one thread (existing send flow)

### Email & deliverability
- [x] Email webhook stub `POST /api/webhooks/email-events`
- [x] Email open/link tracking on sends (webhook updates `emailHistory`)
- [x] Reply routing → Clara draft (`POST /api/ai/reply-triage`)

### Go-to-market assets
- [x] `docs/ENGAGE_LANDING_COPY.md` — pricing £49/99/249, Founding Practice, **7-day trial**
- [x] Publish landing to `capstonesoftware.co.uk/engage` (`capstone-website/src/pages/Engage.tsx`)
- [ ] 2-min Loom demo — **manual**
- [ ] Case study template — **manual**

---

## P2 — Scale & ecosystem ✅

### Analytics & intelligence
- [x] `GET /api/analytics/dashboard` — real metrics wired to Dashboard
- [x] Conversion funnel data in dashboard API
- [x] Clara attention queue (existing component)
- [x] Win/loss monthly synthesis (`GET /api/analytics/win-loss`)
- [x] Benchmark pricing expand (tenant accepted-proposal aggregation)

### Integrations
- [ ] Companies House API key on Render — **env var manual**
- [x] AccountFlow handoff stub (`GET /api/integrations/accountflow/handoff`)
- [ ] **Xero/QB mandate draft** — **William finishing this evening**
- [ ] HubSpot/Pipedrive bi-directional — **webhooks outbound only**

### Product depth
- [x] Proposal templates (contractor, landlord, SME Ltd) + `GET /api/proposal-templates`
- [x] Service catalog CSV import `POST /api/services/import-csv`
- [x] Command palette Cmd+K (clients + proposals search)
- [x] Voice of practice upload (`POST /api/ai/voice-of-practice`)
- [x] Client portal polish (stats dashboard, onboarding teaser)
- [x] API rate limiting on public sign + AI (express-rate-limit)

### Commercial expansion
- [x] Agency sub-accounts UI API (`GET/POST /api/tenants/agency/sub-accounts`)
- [x] White-label subdomain (`settings.whiteLabel.customDomain`)
- [x] SOC2 audit export extend (`GET /api/auth/me/audit-export`)
- [x] Partner programme page (`/partners`)

---

## P3 — Future premier (backlog)

- [ ] Post-sign recurring billing / AccountFlow deep handoff
- [ ] Live collaboration (WebSockets)
- [ ] DocuSign for Enterprise
- [ ] Capacitor mobile app
- [ ] AI disclosure + ICO privacy page

---

## Manual deploy checklist (William)

1. `git push` → Render auto-deploy
2. Run migration `20260703120000_add_trial_and_password_reset`
3. Render Starter + 10 GB disk + `UPLOADS_DIR=/var/data/uploads`
4. Email provider env for password reset
5. Revolut live keys + checkout smoke
6. Stripe annual price IDs (optional fallback)
7. Superadmin env + 6/6 checks
8. Seed templates: `npx tsx backend/src/scripts/seed-proposal-templates.ts`
9. Production smoke + E2E pricing parity test
10. Deploy `capstone-website` for `/engage` route

---

## Document links

- Strategy: `PREMIER_SERVICE_STRATEGY.md`
- Landing copy: `docs/ENGAGE_LANDING_COPY.md`
- Handoff: `task_plan.md`