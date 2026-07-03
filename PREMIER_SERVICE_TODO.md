# Engage — Premier Service TODO

**Goal:** Become the premier UK accountancy proposal platform.

**Last updated:** 3 July 2026 (implementation sprint — 4 parallel agents)

**Test status:** Backend Jest **91/91** · Frontend Vitest **13/13** · Frontend typecheck **pass**

---

## P0 — Trust & revenue ✅ (code complete; deploy manual steps remain)

### Pricing engine integrity
- [x] Unify `pricingEngine_v2` as sole backend source; shared package canonical
- [x] Fix ONE_TIME → MONTHLY display bug in `ProposalBuilder.tsx`
- [x] Fix POST `lineTotal` to use discounted `netTotal`
- [x] Mirror v2 in `@uk-proposal-platform/shared`; frontend imports shared
- [x] Jest: all billing cycles × discount × VAT combinations (91 tests)
- [x] Vitest: ProposalBuilder summary bands match API
- [ ] E2E: create → save → reload → PDF total = email total = client view total

### E-signature forensics
- [x] Migration: `signerEmail`, `documentHash`, `termsHash`, `consentText`, `signatureType`
- [x] SHA-256 document + terms hash at sign time
- [x] Require signer email + authorisation checkbox on public sign form
- [x] IP geolocation enrichment (ip-api.com JSON in `geoLocation`)
- [x] Signature Certificate PDF block in `pdfGenerator.ts`
- [x] `UPLOADS_DIR` defaults to `/var/data/uploads` when `DATA_DIR` set
- [x] Signature audit tab on ProposalDetail
- [ ] Staff in-app accept — verify uses same forensic path as public sign (audit)

### SaaS billing go-live
- [ ] Render **Starter** + 10 GB disk at `/var/data` — **manual Render dashboard**
- [ ] Revolut sandbox → live checkout smoke — **manual + env vars**
- [x] Stripe + Revolut tier config; annual plans (−15%) in `stripe.ts` / `revolut/plans.ts`
- [x] 14-day trial on tenant signup + `trialEndsAt` + Superadmin `reportTrialStarted`
- [x] Tier limits middleware (users/clients/proposals) — 402 when over limit
- [x] Trial expiry blocks proposal email send (403)
- [ ] `reportConversion` on paid checkout fulfilment — wire in Revolut fulfilment
- [x] Settings subscription display (existing Subscription page)

### Production reliability
- [x] Forgot-password flow (auth routes + ForgotPassword + ResetPassword + App routes)
- [x] `/proposals/:id/edit` route (`EditProposal.tsx`)
- [ ] Superadmin 6/6 integration checks on Render — **manual post-deploy**
- [ ] Production smoke per `VERIFICATION_ROADMAP_2026-06-30.md` — **manual**

---

## P1 — Premier differentiators ✅ (code complete)

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
- [ ] Acceptance email + certificate in one thread — verify in production send

### Email & deliverability
- [x] Email webhook stub `POST /api/webhooks/email-events`
- [ ] Email open/link tracking on sends — partial via webhook stub
- [ ] Reply routing → Clara draft — **not started**

### Go-to-market assets
- [x] `docs/ENGAGE_LANDING_COPY.md` — pricing £49/99/249, Founding Practice
- [ ] Publish landing to `capstonesoftware.co.uk/engage` — **manual / capstone-website**
- [ ] 2-min Loom demo — **manual**
- [ ] Case study template — **manual**

---

## P2 — Scale & ecosystem ✅ (partial)

### Analytics & intelligence
- [x] `GET /api/analytics/dashboard` — real metrics wired to Dashboard
- [x] Conversion funnel data in dashboard API
- [x] Clara attention queue (existing component)
- [ ] Win/loss monthly synthesis — **not started**
- [ ] Benchmark pricing expand beyond stub — **stub exists**

### Integrations
- [ ] Companies House API key on Render — **env var manual**
- [ ] AccountFlow handoff — **blocked on AccountFlow 503**
- [ ] Xero/QB mandate draft — **not started**
- [ ] HubSpot/Pipedrive bi-directional — **webhooks outbound only**

### Product depth
- [x] Proposal templates (contractor, landlord, SME Ltd) + `GET /api/proposal-templates`
- [x] Service catalog CSV import `POST /api/services/import-csv`
- [x] Command palette Cmd+K (clients + proposals search)
- [ ] Voice of practice upload — **not started**
- [ ] Client portal polish — **partial**
- [ ] API rate limiting on public sign + AI — **not started**

### Commercial expansion
- [ ] Agency sub-accounts UI — **not started**
- [ ] White-label subdomain — **not started**
- [ ] SOC2 audit export extend — **not started**
- [ ] Partner programme page — **not started**

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
10. Publish `ENGAGE_LANDING_COPY.md` to capstone-website

---

## Document links

- Strategy: `PREMIER_SERVICE_STRATEGY.md`
- Landing copy: `docs/ENGAGE_LANDING_COPY.md`
- Handoff: `task_plan.md`