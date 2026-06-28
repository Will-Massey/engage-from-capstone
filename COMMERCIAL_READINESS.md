# Engage by Capstone — Commercial Readiness Plan

> Generated: 2026-06-28 | Production: engage-backend-e1ue / engage-frontend-0g6u / capstone-engage.onrender.com

---

## Executive summary

| Area | Status | Target |
|------|--------|--------|
| **Deploy** | Live (Cloudflare email commit `a6763005`) | Stable CI/CD, paid tier for SLA |
| **Email** | Cloudflare Email Service (worker + API) | ✅ Operational |
| **Multi-tenancy** | Row-level `tenantId`, soft middleware | Hardened isolation |
| **Security** | Helmet, CSRF, JWT, rate limits | SOC 2 Type II equivalent |
| **AI** | Backend wired (`/api/ai/*`, xAI Grok) — frontend integration partial | AI-native product |

**SOC 2 readiness estimate:** ~50% (post P0 hardening 2026-06-28) → target 85%+ before enterprise sales.

---

## P0 — Block commercial launch (fix immediately)

### Deploy & runtime
- [x] Set `ENCRYPTION_KEY` + `OAUTH_STATE_SECRET` on Render (was causing `update_failed`)
- [x] Cloudflare email env vars on engage-backend + capstone-engage
- [ ] Move engage-backend to **Starter plan** (free tier sleeps, ephemeral disk, no SLA)
- [ ] Add **persistent disk** for uploads/signatures (`/var/data/uploads` in render.yaml — verify mounted)
- [ ] Re-enable `tsc` in Render build once Prisma enums synced (or commit verified `dist/`)

### Security (critical)
- [x] **Remove public `/uploads` static serving** — authenticated `/api/uploads/signatures/:tenantId/:filename` only
- [x] **Fix signature IDOR** — `getSignatureImage(id, tenantId)` tenant-scoped; route uses `findFirst` with proposal tenant
- [x] **Cross-tenant header rejection** — `authenticate` rejects `X-Tenant-Id` ≠ JWT `tenantId`; `validateTenantMembership` on touchpoints + uploads
- [x] **Rate-limit `POST /api/tenants`** (5/hour) — signup disabled in prod unless `ALLOW_PUBLIC_TENANT_SIGNUP=true`
- [x] **Remove CSRF debug logs** from production frontend (`api.ts` gated on `import.meta.env.DEV`)
- [x] **Dedicated secrets in production** — `ENCRYPTION_KEY`, `OAUTH_STATE_SECRET` required; 2FA/oauth no JWT fallback in prod
- [ ] Require invite token or Turnstile on tenant signup (when re-enabled)

### Multi-tenancy
- [x] `serviceTemplate.findMany` scoped to `tenantId` on proposal create (master)
- [ ] Load `req.tenant` in auth middleware (proposals-share assumes it exists)
- [ ] Fix login without `tenantId` — use explicit tenant or subdomain, not `findFirst` by email
- [ ] Document Render tenancy model: `DEFAULT_TENANT_SUBDOMAIN=demo` + JWT `tenantId` (not subdomain)

### Email
- [x] Platform transport → Cloudflare (`sendgridTransport.ts` repurposed)
- [x] `tenantMailer.sendProposalEmail` wired on master
- [ ] Remove dead `@sendgrid/mail` dependency when webhook retired
- [ ] Cloudflare delivery webhooks / bounce handling (replaces SendGrid event webhook)

---

## P1 — Commercial readiness (4–6 weeks)

### SOC 2 / ISO 27001 equivalent controls

| Control | Action |
|---------|--------|
| **CC6.1 Access** | Implement MFA (2FA routes exist but return 501); session revocation UI |
| **CC6.6 Boundary** | Tenant isolation tests in CI; pen-test before launch |
| **CC7.2 Monitoring** | Structured security events (failed login, CSRF, IDOR) → log drain / alerting |
| **CC7.3 Evaluation** | Fail CI on `npm audit` high/critical; quarterly pen-test |
| **CC8.1 Change mgmt** | Remove prod DDL via `/api/admin/migrate`; migrations only in deploy pipeline |
| **A1.2 Availability** | Uptime monitoring (UptimeRobot); status page; backup restore drill |
| **P1 Privacy** | Consent logging; subprocessor register (Cloudflare, Stripe, Render, Neon); DPA template |

### Infrastructure
- [ ] Redis for rate limiting + CSRF store (multi-instance safe)
- [ ] Neon/Postgres **automated backups** + tested restore procedure
- [ ] Custom domain: `engage.capstonesoftware.co.uk` with tenant subdomain routing
- [ ] Staging environment mirroring production secrets pattern
- [ ] Secrets rotation runbook (JWT, encryption, worker secret)

### Product completeness
- [ ] Password reset flow (currently 501)
- [ ] Stripe billing + trial enforcement wired end-to-end
- [ ] Onboarding wizard completion tracking
- [ ] E2E test suite green against staging (Playwright)
- [ ] UK English copy audit across frontend

### Legal & compliance
- [ ] Terms of service + privacy policy linked in app
- [ ] Engagement letter AI disclosure aligned with actual AI features
- [ ] GDPR data export/delete tested per tenant
- [ ] Email suppression list + unsubscribe for follow-ups

---

## P2 — World-class product (8–12 weeks)

### UX & polish
- [ ] Proposal builder: real-time preview, mobile signing experience
- [ ] Client portal: branded per tenant, progressive disclosure
- [ ] Command palette actions wired to real features (not placeholders)
- [ ] Empty states, loading skeletons, error recovery on all flows
- [ ] Accessibility: WCAG 2.1 AA on proposal view + signing

### Analytics & insights
- [ ] Proposal funnel: sent → viewed → signed with time-to-convert
- [ ] Practice dashboard: revenue pipeline, win rate, service mix
- [ ] Cohort analysis by tenant (for your own product metrics)

### Integrations
- [ ] Xero / QuickBooks proposal-to-mandate sync
- [ ] Companies House auto-fill (key exists on Render)
- [ ] Practice management exports (CSV, API)

---

## AI-native roadmap (xAI / Grok — not window dressing)

**Principle:** AI must change outcomes (faster proposals, higher win rates, less partner time), not add a chat bubble.

### Tier 1 — Embedded intelligence (ship first)

| Feature | How it drives the product | xAI usage |
|---------|---------------------------|-----------|
| **Proposal copilot** | Draft services, pricing narrative, cover letter from client context + CH data | `grok-3-mini` streaming in `ProposalBuilder` |
| **Pricing advisor** | Suggest fee range vs service catalog + client size | Structured JSON output, tool calls to pricing engine |
| **Follow-up composer** | Personalised chase emails using proposal + view history | Already have follow-up job — replace templates with AI + human approve |
| **Proposal health score** | "Missing MTD clause", "fee below catalog floor" before send | Rules + LLM validation pass |
| **Client research brief** | Pre-proposal one-pager from company number | Companies House + web search tool |

**Implementation pattern:**
```
backend/src/services/ai/aiClient.ts  → xAI API (already stubbed in deploy-hardening)
backend/src/services/ai/proposalAiService.ts → tenant-scoped prompts with proposal JSON context
frontend ProposalAiAssist.tsx → streaming UI, accept/reject per section
```

**Guardrails:** UK English; never invent statutory deadlines; cite HMRC/CH sources; tenant data never crosses prompts; log prompts/responses in `ActivityLog` with PII redaction.

### Tier 2 — Proactive agent

| Feature | Behaviour |
|---------|-----------|
| **Engagement manager agent** | Watches proposal states daily; suggests "call client X", "revise pricing on Y" |
| **Touchpoint engine + AI** | Replace static touchpoint templates with generated content from `touchpointEngine.ts` |
| **Inbox triage** | Parse client reply emails (Cloudflare routing) → update proposal status |
| **Win/loss analysis** | Monthly Grok synthesis across tenant proposals → practice insights |

### Tier 3 — Differentiation

| Feature | Why world-class |
|---------|-----------------|
| **Voice proposal** | Partner dictates scope → structured proposal (mobile-first) |
| **Benchmark pricing** | Anonymised cross-tenant benchmarks (opt-in) for fee confidence |
| **Regulatory watcher** | MTD/Companies Act changes → flagged in affected proposals |
| **Client Q&A on proposal** | Signer asks questions on public view → AI answers from proposal only |

### xAI configuration (Render — already partially set)

```env
XAI_API_KEY=<set on Render>
XAI_MODEL=grok-3-mini          # fast, cost-effective for copilot
XAI_MODEL_DEEP=grok-3          # research / analysis tasks
```

**Cost control:** Per-tenant monthly token budget in `tenant.settings`; cache CH lookups; stream to UI to cap latency.

---

## Pressure test results (2026-06-28)

| Test | Result |
|------|--------|
| 20× `/ping` concurrent | All 200 — stable under light load |
| Invalid Bearer token | `INVALID_TOKEN` — correct |
| Open tenant registration | `403 CSRF_MISSING` — blocked (signup also disabled in prod) |
| Cookie auth + CSRF send flow | Login → CSRF cookie → `POST /send` works |
| AI status (`/api/ai/status`) | `configured: true`, Clara + Grok ready |
| Test proposal email | **PROP-MQYAHNG5-DHM** sent to william@capstonesoftware.co.uk ✅ |
| Cross-tenant `X-Tenant-Id` header | **Fixed in `4dd15530`** — deploy pending verification |

**Not yet tested:** concurrent proposal sends, cross-tenant IDOR fuzzing at scale, CSRF bypass, signature URL enumeration, load at 50+ RPS.

---

## Suggested fix order (this week)

1. ✅ Deploy with `ENCRYPTION_KEY` / Cloudflare email
2. ✅ Send test proposal to william@capstonesoftware.co.uk (Cloudflare + engage API)
3. ✅ Remove public `/uploads` + fix signature IDOR
4. ✅ Cross-tenant isolation in `authenticate` + tenant-scoped uploads
5. ✅ xAI `proposalAiService` + `/api/ai/*` routes (wire UI copilot in ProposalBuilder)
6. [ ] Upgrade Render plan + persistent disk
7. [ ] Full E2E + tenant isolation test suite in CI

---

## Repos & URLs

| Component | URL / repo |
|-----------|------------|
| Engage backend | https://engage-backend-e1ue.onrender.com |
| Engage frontend | https://engage-frontend-0g6u.onrender.com |
| Capstone Engage | https://capstone-engage.onrender.com |
| Email worker | https://capstone-engage-email.william-19a.workers.dev |
| GitHub | Will-Massey/engage-from-capstone (master) |
| Demo login | admin@demo.practice / DemoPass123! |

---

## Files to watch

- `backend/src/middleware/tenant.ts` — isolation enforcement
- `backend/src/services/tenantMailer.ts` — all outbound email
- `backend/src/services/sendgridTransport.ts` — Cloudflare platform transport
- `backend/src/routes/proposals.ts` — send flow
- `backend/src/config/env.ts` — production secret validation
- `render.yaml` — plan tier, env vars, build command