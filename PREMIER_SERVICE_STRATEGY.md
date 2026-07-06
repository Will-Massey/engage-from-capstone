# Engage — Premier Service Strategy

**Date:** 3 July 2026  
**Scope:** Current iteration (v1.x, Clara AI-native, Render production)  
**Purpose:** Pricing research, SWOT, gap analysis, and positioning to become the premier UK accountancy proposal platform.

---

## Executive summary

Engage is **feature-rich and differentiated on AI + UK compliance**, but **not yet premier** on trust (pricing engine parity, e-sign forensics), go-to-market (billing live, landing conversion), or post-sign workflow (billing automation vs Ignition). The path to premier status is: **fix reliability → close legal gaps → ship the Clara-led 5-minute wizard → price AI as included value → own MTD ITSA**.

---

## 1. Current product snapshot

| Dimension            | State (Jul 2026)                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Core loop**        | Client → services → pricing → PDF → share → e-sign → acceptance email                                                               |
| **AI (Clara)**       | Streaming cover/engagement/send emails, auto-fit, CH brief, onboarding, analysis/tweaks, follow-ups — **production xAI configured** |
| **UK moat**          | MTD ITSA assessment, engagement clause library, Companies House, VAT/frequency pricing                                              |
| **Billing (SaaS)**   | Tiers defined: Starter £49 / Professional £99 / Enterprise £249 — Revolut + Stripe scaffold                                         |
| **Platform fee**     | 2.5% on client proposal payments (configurable via `ENGAGE_PLATFORM_FEE_BPS`)                                                       |
| **Deploy**           | `engage.capstonesoftware.co.uk` — backend on Render; superadmin wiring in progress                                                  |
| **Known weaknesses** | Pricing v1/v2 drift, signature storage ephemeral, forgot-password missing, proposal edit gaps, dashboard metrics partly mock        |

---

## 2. Pricing research

### 2.1 Engage current pricing (configured in codebase)

| Tier             | Monthly (GBP) | Users     | Clients   | Proposals | Positioning                                   |
| ---------------- | ------------- | --------- | --------- | --------- | --------------------------------------------- |
| **Starter**      | £49           | 3         | 50        | 100/mo    | Small practice                                |
| **Professional** | £99           | 10        | 500       | Unlimited | Growing practice — **Clara should live here** |
| **Enterprise**   | £249          | Unlimited | Unlimited | Unlimited | Large firm / white-label                      |

- **Trial:** Not codified as a fixed day count in tiers — recommend **14 days, no card** (match Ignition/TaxClarity family).
- **Annual:** Not implemented — recommend **15% discount** (2 months free).
- **Add-on revenue:** 2.5% platform fee on client payments collected through Engage.

### 2.2 Competitor landscape (UK accountancy proposals)

> Figures are indicative from public positioning and industry reports (2025–2026). **Verify live before publishing marketing pages** — several competitor sites block automated price extraction.

| Product                           | Type                              | Indicative pricing                        | What you get                                                                      |
| --------------------------------- | --------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------- |
| **Ignition**                      | Proposal + **billing + payments** | ~£79–£250+/mo (tiered; enterprise custom) | Proposals, recurring billing, client payments, workflows — market leader globally |
| **GoProposal**                    | UK proposal specialist            | ~£39–£79/mo                               | Fast UK engagement letters, pricing tools — **less AI**                           |
| **TaxDome**                       | Full practice OS                  | ~£40–£75 **per user**/mo                  | Proposals one module among PM, docs, billing                                      |
| **PandaDoc / Proposify**          | Generic proposals                 | ~£15–£49 **per user**/mo                  | Templates, e-sign — **not UK compliance-native**                                  |
| **Pitchly**                       | Enterprise content                | Contact sales                             | Data-driven proposals for large firms                                             |
| **Capstone TaxClarity** (sibling) | AI research SaaS                  | £49 / £99 / £249                          | Same tier ladder — family consistency                                             |

### 2.3 Value comparison

| Capability                   | Engage                        | Ignition  | GoProposal |
| ---------------------------- | ----------------------------- | --------- | ---------- |
| Sub-5-min proposal build     | ✅ Claim + AI path            | ✅ Mature | ✅ Core    |
| UK engagement letter clauses | ✅ Library                    | ✅        | ✅ Strong  |
| MTD ITSA automation          | ✅ **Differentiator**         | Partial   | Partial    |
| AI-written client emails     | ✅ **Clara — differentiator** | Limited   | ❌         |
| Companies House client brief | ✅                            | ❌        | ❌         |
| Post-sign recurring billing  | ❌ Gap                        | ✅ Core   | Limited    |
| E-sign legal forensics       | ⚠️ Partial                    | ✅ Mature | ✅         |
| Practice management          | ❌ (AccountFlow sibling)      | ❌        | ❌         |

### 2.4 Pricing recommendations

**Keep the £49 / £99 / £249 ladder** — it matches Capstone Clarity products and is defensible vs GoProposal (premium for AI) and below Ignition all-in-one (which includes billing).

| Change                                                                   | Rationale                                             |
| ------------------------------------------------------------------------ | ----------------------------------------------------- |
| **14-day free trial** on all tiers                                       | Industry standard; lowers friction vs Ignition        |
| **Clara included from Professional**                                     | AI is the moat — don't nickel-and-dime tokens on £99+ |
| **Starter: 5 Clara drafts/mo** or token cap                              | Protects margin; upgrade path clear                   |
| **Annual billing −15%**                                                  | Improves retention and cash flow                      |
| **Founding Practice** (first 20 firms): Professional @ £79 for 12 months | Case studies + benchmark data                         |
| **MTD ITSA Pack** marketing                                              | Justify £10–15 premium vs generic proposal tools      |
| **Platform fee 2.5%**                                                    | Disclose transparently; optional waive for Enterprise |
| **Per-seat add-on** above tier limits                                    | £15/user/mo — simpler than forcing Enterprise jump    |

**Price positioning statement:**  
_"Less than one hour of partner time per month — with AI that writes the emails your clients actually read."_

---

## 3. SWOT analysis

### Strengths

- **Clara AI layer** — streaming proposal emails, auto-fit, CH brief, lifecycle emails; hard for GoProposal to match quickly.
- **UK-native** — MTD ITSA, engagement clauses, VAT/frequency pricing, UK English throughout.
- **Speed narrative** — sub-5-minute proposals with wizard potential.
- **Capstone ecosystem** — AccountFlow, TaxClarity, Superadmin, portfolio site cross-sell.
- **Technical depth** — 75+ API endpoints, shared pricing engine, multi-tenant RBAC, Revolut/Stripe.
- **Recent polish** — dark/light glass UI, email analysis checklist, voice stub, budget meter.

### Weaknesses

- **Pricing engine drift** — v1/v2 mismatch risks wrong totals (trust killer).
- **E-sign forensics incomplete** — no document hash, signer email, durable signature storage.
- **Incomplete primary path** — first-proposal wizard not the default UX; Clara still feels sidebar-adjacent.
- **Ops fragility** — Render free tier, signatures on ephemeral FS, forgot-password missing.
- **Billing not fully live** — Revolut/Stripe env gaps; conversion funnel untested.
- **Post-sign gap** — no mandate/recurring billing vs Ignition's core value.

### Opportunities

- **MTD ITSA April 2026** — practices need compliant engagement wording now.
- **AI fatigue with generic tools** — "partner-quality" AI emails are a clear story.
- **Ignition price/complexity** — practices that only need proposals + sign, not full billing OS.
- **Benchmark pricing network** — opt-in anonymised fee data (stub exists).
- **AccountFlow integration** — won client → practice record (when AccountFlow healthy).
- **Agency white-label** — multi-tenant already; sell to bookkeeping franchises.

### Threats

- **Ignition** — brand, billing automation, accountant community trust.
- **GoProposal** — entrenched UK UX, lower price, accountant word-of-mouth.
- **TaxDome** — "good enough" proposals inside all-in-one PM.
- **AI commoditisation** — ChatGPT + Word templates for cheapskate practices.
- **Compliance risk** — weak e-sign audit trail if disputed.
- **Reputation** — pricing bugs or lost signatures destroy premier positioning instantly.

---

## 4. Gap analysis — current vs premier

| Area                       | Premier bar                                    | Current                                        | Gap severity |
| -------------------------- | ---------------------------------------------- | ---------------------------------------------- | ------------ |
| **Pricing accuracy**       | Single source of truth; tested all cycles      | v1/v2 drift, known bugs                        | 🔴 Critical  |
| **E-sign defensibility**   | Certificate PDF, hashes, durable storage       | Partial canvas sign; FS ephemeral              | 🔴 Critical  |
| **Time-to-first-proposal** | Clara wizard < 5 min, zero training            | Sidebar AI; wizard incomplete                  | 🟠 High      |
| **Client email quality**   | Partner approves; streams; personalised        | ✅ Largely done                                | 🟢 Low       |
| **MTD compliance**         | Clauses auto-inserted per client               | Logic exists; regulatory fit engine incomplete | 🟠 High      |
| **Pricing intelligence**   | Clara flags under/over fee vs catalog          | Advisor not shipped                            | 🟠 High      |
| **Post-sign workflow**     | Onboarding checklist, AML prompt, Xero mandate | Partial acceptance email                       | 🟠 High      |
| **Analytics**              | Real conversion funnel, pipeline £             | Dashboard partly mock                          | 🟠 High      |
| **SaaS billing**           | Live checkout, trial → paid                    | Scaffold only                                  | 🔴 Critical  |
| **Integrations**           | CH live, AccountFlow, email webhooks           | CH needs Render key; AF 503                    | 🟠 High      |
| **Mobile signing**         | Thumb-friendly client sign                     | Basic responsive                               | 🟡 Medium    |
| **Support & docs**         | Help centre, onboarding videos                 | Sparse                                         | 🟡 Medium    |
| **Performance**            | No cold-start on free Render                   | 15-min sleep on free tier                      | 🟠 High      |

**Premier definition (measurable):**

1. Partner creates and sends first proposal in **< 5 minutes** without support.
2. **Zero pricing disputes** — client total always matches PDF and email.
3. **Signed PDF** withstands a client challenge (audit certificate).
4. **Trial → paid** conversion path works end-to-end.
5. NPS-style internal target: _"I'd recommend this over GoProposal"_ from 3+ pilot practices.

---

## 5. Strategic priorities (ordered)

1. **Trust** — pricing engine + e-sign forensics (non-negotiable).
2. **Wow** — Clara-first proposal wizard as default path.
3. **Convert** — live billing, trial, landing page with proof.
4. **Defend** — MTD + regulatory fit + pricing advisor.
5. **Expand** — post-sign onboarding, AccountFlow handoff, benchmark network.

---

## 6. Related documents

- `PREMIER_SERVICE_TODO.md` — actionable build list (canonical from Jul 2026)
- `AI_NATIVE_TODO.md` — Clara feature depth
- `ENGAGE_WORLD_CLASS_TODO.md` — e-sign and reliability detail
- `backend/src/config/stripe.ts` — tier definitions
