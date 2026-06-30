# Engage by Capstone — AI-Native World-Class TODO

> **North star:** Clara is not a chat sidebar — she is the intelligence layer that makes every proposal feel bespoke, every email feel written by the partner, and every client think *this practice really understands us*. AI permeates the product; nothing is bolted on.

**Principle:** If a feature could work without AI, ask *what would AI add that changes the outcome?* (higher win rate, less partner time, clearer client understanding). If the answer is nothing, simplify the UI — don't add AI for show.

**Stack:** xAI Grok (`grok-3-mini` copilot, `grok-3` deep research) · Cloudflare email · UK English throughout

---

## Phase 0 — Foundation (this week)

*Unblock wow — infra + security so AI and email can run reliably*

- [ ] Upgrade **engage-backend** to Render **Starter** + 10 GB disk at `/var/data` ([dashboard](https://dashboard.render.com/web/srv-d6qkjlua2pns73a2r1fg/settings)) — **manual step pending**
- [ ] Custom domain: `engage.capstonesoftware.co.uk` (tenant subdomains later)
- [ ] Verify Clara live after deploy: `/api/ai/status`, ProposalBuilder sidebar, global panel
- [x] Per-tenant **AI token budget** in `tenant.settings` + usage in `/api/ai/status` (settings UI meter pending)
- [x] Log every AI call to `ActivityLog` with feature name (PII-redacted) — audit trail for trust

---

## Phase 1 — Wow from the first minute (2–3 weeks)

*First login → first sent proposal should feel like magic, not a blank form*

### Onboarding that thinks

- [x] **Welcome flow with Clara** — after login, Clara asks 3 questions (practice size, typical clients, MTD status) and pre-seeds service catalog + cover letter tone
- [ ] **First proposal wizard** — "Create your first proposal in 5 minutes" with Clara guiding each step (not optional sidebar — the primary path)
- [x] **Companies House moment** — enter company number → Clara produces a one-paragraph client brief (sector, size, filing history flags) before you pick services
- [ ] **Empty states** — every empty screen has Clara suggesting the next best action ("Add a client like X", "Clone last year's proposal")

### Client-fit intelligence (core differentiator)

- [x] **Client context card** — persistent panel on builder + detail: turnover, employees, VAT, MTD, prior proposals, win/loss — fed to every Clara prompt automatically
- [x] **Auto-fit on client select** — selecting a client triggers background Clara pass: suggested title, services, fee band, cover letter tone (partner approves each block)
- [ ] **Pricing advisor** — Clara compares line items to catalog floor/ceiling + client size; flags "fee below typical for limited company at £X turnover"
- [ ] **Regulatory fit** — rule engine + Clara: MTD clause present?, AML wording for new client?, engagement letter clauses match services?

### Proposal builder (AI-native, not AI-extra)

- [x] Clara sidebar: suggest services, title, cover letter, pre-send review (`b97b86d4`)
- [x] **Streaming drafts** — cover + engagement + **proposal send email** now stream live (body chunks delivered incrementally). Added very cheap Clara tweak buttons ("Warmer", "Shorter", "Add urgency") that do tiny follow-up prompts on the existing draft — maximum client wow for minimal extra tokens. [2026-06-30]
- [ ] **Section accept/reject** — each Clara suggestion is a card: Accept · Edit · Reject (never overwrite without consent)
- [ ] **Real-time client preview** — split pane: edit left, "what client sees" right, updates as Clara fills content
- [ ] **Voice of the practice** — tenant uploads 2–3 example letters; Clara fine-tunes tone (stored as tenant embedding / style prompt, not raw paste in every call)

---

## Phase 2 — Emails that explain, persuade, and wow (2–4 weeks)

*Emails are the product's shop window — generic templates kill differentiation*

### Proposal send email (highest impact)

- [x] **Replace static HTML template** with Clara-generated body per send:
  - Who you are and why you're writing (2 sentences)
  - What you're proposing, in plain English (not just a link)
  - Service summary table in email (names, cadence, indicative fees)
  - What happens next (view → questions → sign → onboarding)
  - Valid until date and how to get in touch
- [x] **Partner approval gate** — show full email preview in app before send; "Edit with Clara" inline
- [ ] **Personalisation inputs** — client name, contact, company CH data, proposal JSON, partner sign-off — all in prompt context
- [x] **A/B subject lines** — cheap `/suggest-email-subjects` + UI chips in the email preview (one tiny call, high impact)  [2026-06-30]

### Follow-up & lifecycle emails

- [x] **AI follow-up replaces templates** in `emailAutomation.ts` — chase emails reference view history ("I noticed you opened the proposal on Tuesday…")
- [x] **Acceptance thank-you** — detailed confirmation email: what was agreed, next steps, AML if needed, calendar link optional
- [x] **Renewal emails** — Clara drafts annual renewal narrative with uplift justification (inflation, scope change, statutory burden)
- [x] **Touchpoint engine** — replace static touchpoint copy in `touchpointEngine.ts` with Clara-generated content from client lifecycle stage

### Email infrastructure

- [ ] Cloudflare delivery webhooks → update proposal `emailHistory`, bounce/suppression list
- [ ] **Reply routing** (Phase 2b) — client replies hit Cloudflare routing → Clara triages → draft response for partner

---

## Phase 3 — Clara everywhere (permeate the app) (4–6 weeks)

*Every screen knows context; Clara is one intelligence, many surfaces*

| Surface | AI behaviour |
|---------|----------------|
| **Dashboard** | "3 proposals need attention" — Clara prioritises by revenue × likelihood to close |
| **Clients list** | Per-client "engagement readiness" score; suggest next proposal type |
| **Client detail** | Research brief, proposal history synthesis, "what to propose next" |
| **Proposal list** | Sort by Clara health score; bulk "draft follow-ups" |
| **Proposal detail** | Health, follow-up, engagement letter, renewal — already partial |
| **Public proposal view** | Client Q&A: questions answered from proposal content only (no hallucinated HMRC dates) |
| **Signing flow** | Plain-English summary of what they're agreeing to before signature |
| **Settings** | Clara explains MTD settings impact on generated clauses |

### Proactive agent (not reactive chat)

- [ ] **Daily engagement brief** — email or in-app: "Call Client X — proposal viewed 3×, no sign"; "Revise fees on Y — below catalog"
- [ ] **Post-sign onboarding** — Clara generates client onboarding checklist from signed services
- [ ] **Win/loss learning** — monthly synthesis per tenant: what won, what stalled, pricing patterns

### Technical pattern (enforce everywhere)

```
User action → gather tenant-scoped context (client, proposal, CH, catalog, history)
           → Clara service with structured JSON output
           → UI presents as editable draft
           → partner approves → persist + ActivityLog
```

- [x] Refactor: single `aiContextBuilder.ts` — one place that assembles context for all features
- [x] Refactor: `tenantMailer` accepts Clara overrides (`aiHtml`/`aiText`/`aiSubject`) on send

---

## Phase 4 — World-class polish (6–10 weeks)

*Stand out visually, emotionally, and operationally*

### UX & trust

- [ ] Mobile-first **signing** — thumb-friendly, progressive disclosure, Clara "any questions?" on sign page
- [ ] **Branded client portal** per tenant — logo, colours, Clara voice matches practice
- [ ] WCAG 2.1 AA on proposal view + signing
- [x] **Proposal funnel analytics** — attention queue + analytics attention-summary (full funnel narrative pending)

### Integrations that feel intelligent

- [ ] Companies House auto-fill wired to Clara brief (key on Render)
- [ ] Xero/QB — accepted proposal → mandate draft with Clara explanation email to client
- [ ] Stripe — payment link email with Clara-written context

### Commercial & compliance

- [ ] SOC 2 path: MFA, monitoring, pen-test, staging
- [ ] Terms + privacy + **AI disclosure** ("Clara assists your team; you approve every client-facing word")
- [ ] GDPR export/delete per tenant

---

## Phase 5 — Moat (10–16 weeks)

*Things competitors cannot copy quickly*

- [x] **Regulatory watcher** — MTD / Companies Act changes → flag affected live proposals (stub API `/api/ai/regulatory-alerts`)
- [x] **Benchmark pricing** (opt-in, anonymised) — placeholder bands via `/api/ai/benchmark-pricing`
- [x] **Voice proposal** — partner dictates scope on mobile → structured proposal (stub `/api/ai/voice-proposal`)
- [ ] **Client sentiment** — analyse reply emails; surface risk of churn on unsigned proposals

---

## Done recently (don't redo)

- [x] Cloudflare email + `tenantMailer` proposal send
- [x] Clara backend: suggest services, cover letter, follow-up, engagement letter, health, renewal, command, draft-review, suggest-title
- [x] Clara UI: global assistant panel, ProposalBuilder sidebar, ProposalAiAssist on detail
- [x] Security P0: tenant isolation, signature IDOR, CSRF, upload auth
- [x] xAI configured on production (`configured: true`)

---

## Suggested build order (next 4 sprints)

| Sprint | Focus | Wow outcome |
|--------|-------|-------------|
| **1** | Render Starter + AI proposal **send email** (Clara body, approval preview) | Client receives email that explains the engagement in detail |
| **2** | Client select **auto-fit** + CH brief + streaming cover letter | Partner picks client → proposal 70% drafted in 30 seconds |
| **3** | Follow-up + touchpoint AI emails; dashboard **attention queue** | Software tells partner who to call and what to say |
| **4** | Public proposal Q&A + signing summary; onboarding wizard | Client-facing wow; first-run magic |

---

## Success metrics (how you'll know it's world-class)

| Metric | Target |
|--------|--------|
| Time to first sent proposal (new tenant) | < 15 minutes |
| Partner edits per Clara draft | < 20% of words changed (good fit) |
| Proposal open → sign rate | +25% vs static template baseline |
| Follow-up emails using Clara | 80%+ of chases (not generic templates) |
| Client "wow" feedback | Qualitative — "felt written for us" |

---

*Last updated: 2026-06-30 · Owner: William · Repo: `engage-from-capstone` master*
*Streaming drafts implemented (live token streaming for cover + engagement).*