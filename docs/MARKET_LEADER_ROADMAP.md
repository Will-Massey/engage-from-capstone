# Engage — Path to Market Leader (roadmap)

<!-- Extends MARKET_LEADER_PLAN.md (W0–W4). This doc is the W5+ prioritisation
     after the Stripe Connect proposal-to-cash work shipped (PR #44, Jul 2026)
     and a fresh competitive read vs Ignition / GoProposal+OverSuite / FigsFlow. -->

**North Star (unchanged):** fastest path from Companies House lookup → priced UK
proposal → signed engagement → **collected _and recurring_ fees** — with AI that
saves 30+ min per proposal without runaway token cost.

## Where we are (Jul 2026)

Shipped and ahead of a baseline GoProposal setup: proposal-to-cash on **Stripe
Connect** (destination charges, application-fee split), Clara with cost discipline,
engagement-letter versioning, Companies House → priced proposal, MTD tooling,
analytics, command palette, MFA + password reset.

The gaps to **leadership** (not parity) are specific and ranked below.

## Competitive moats to beat

| Competitor                 | Moat                                                                                                                | Our answer                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Ignition**               | Proposal → **recurring** invoice + collect; **AI Price Insights** (anonymised benchmarks across thousands of firms) | R1 recurring fees; R3 cross-tenant benchmarks          |
| **FigsFlow**               | Regulatory engagement letters **with integrated AML**; aggressive £8/mo                                             | R2 productised AML; content (R6)                       |
| **GoProposal + OverSuite** | Pricing methodology + compliance-grade letters                                                                      | already at parity (pricing engine + letter versioning) |

---

## Phase R1 — Recurring revenue loop (highest ROI)

**Why:** accountancy fees are mostly monthly recurring. We win the sale at "signed"
but lose the LTV/retention story to Ignition, whose core moat is proposal → recurring
invoice + collect. This extends the Connect rail we just shipped.

| ID   | Deliverable                                                                                           | Notes                                           |
| ---- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| R1.1 | Detect recurring proposal lines (MONTHLY/QUARTERLY/ANNUAL) → recurring vs one-off split               | pricing already models `billingFrequency`       |
| R1.2 | Stripe **subscription** on the practice's connected account, `application_fee_percent` = platform fee | reuses `stripeConnectService` connected account |
| R1.3 | Connect webhook: `invoice.paid` / `invoice.payment_failed` → recurring payment ledger                 | extends `stripeConnect.ts`                      |
| R1.4 | Client billing portal (Stripe billing portal session) for card update / cancel                        |                                                 |
| R1.5 | Practice dashboard: MRR, active recurring engagements, failed-payment dunning                         |                                                 |

**Exit:** a signed proposal with monthly lines creates a live subscription; practice
sees MRR; failed payment triggers dunning.

## Phase R2 — Compliance moat: productised AML _(blocked on partner creds)_

**Why:** FigsFlow/GoProposal lead on "engagement letters **with integrated AML**." We
have `/api/aml` scaffolding; turning it into a real purchase-and-verify flow is a
buying-decision blocker for regulated firms.

| ID   | Deliverable                                                                | Notes              |
| ---- | -------------------------------------------------------------------------- | ------------------ |
| R2.1 | SmartSearch **or** Creditsafe live integration (behind provider interface) | needs API creds    |
| R2.2 | ID verification at client onboarding (portal token flow)                   |                    |
| R2.3 | AML status on client + proposal; block send until cleared (configurable)   |                    |
| R2.4 | Purchasable per-check billing (platform fee on AML checks)                 | ties to R1 billing |

**Blocked:** needs SmartSearch/Creditsafe API keys. Provider interface + demo stub can
be built now; go-live is creds-gated.

## Phase R3 — Network-data moat: anonymised pricing benchmarks

**Why:** Ignition sells **AI Price Insights** ($349/yr) — benchmark a firm's fees vs
thousands of anonymised firms. It's a defensible network effect: better with scale,
uncopyable without the data. We already aggregate accepted-proposal pricing per tenant.

| ID   | Deliverable                                                                  | Notes                         |
| ---- | ---------------------------------------------------------------------------- | ----------------------------- |
| R3.1 | Cross-tenant fee aggregation by service + turnover band, **k-anonymity ≥ N** | privacy floor before exposing |
| R3.2 | Benchmark endpoint + "your fee vs market P25/P50/P75" in pricing calculator  |                               |
| R3.3 | Opt-in data sharing toggle per tenant (contribute → consume)                 |                               |

**Exit:** a practice sees "your bookkeeping fee is in the 40th percentile for £1–2m
turnover clients," from ≥ N contributing firms.

## Phase R4 — Complete the loop (fast follows)

| ID   | Deliverable                                                              | Status/Notes                                            |
| ---- | ------------------------------------------------------------------------ | ------------------------------------------------------- |
| R4.1 | Deep Xero/QBO sync — push **recurring invoices**, not just contact notes | Xero scaffold done; **blocked on OAuth creds** for live |
| R4.2 | Partner approval workflow (junior drafts → partner approves → send)      | pure app logic; unblocked                               |
| R4.3 | 100+ ICAEW/ACCA-aligned engagement templates                             | content; #1 onboarding-drop-off fix                     |
| R4.4 | Mobile signing polish + Clara FAQ on public sign page                    |                                                         |

## Phase R5 — Beyond parity (true differentiators)

These are what make Engage _the_ leader, not a catch-up.

| ID   | Deliverable                                                                                                                                          | Why it's a moat                                                     |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| R5.1 | **Agentic Clara** — watches the book of clients and acts: "3 clients cross the MTD threshold in April → draft + price + queue renewals for approval" | co-pilot no competitor has; uses the full-funnel data               |
| R5.2 | **Regulatory rule engine** (rules, not LLM) — proactive "this client now needs X"                                                                    | proactive compliance = trust moat in a fear-driven market           |
| R5.3 | **Proposal-to-cash intelligence** — revenue forecasting + churn-risk from payment behaviour                                                          | only Engage will have lookup→price→sign→collect→recur in one funnel |

## Fixes / risks (from the Jul 2026 code review)

| ID  | Fix                                                                                                                           | Severity             | Status                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------- |
| F1  | `config/env.ts` validates `process.env` at import-time, before `index.ts` runs `dotenv.config()` — breaks local `npm run dev` | DX-blocking          | **in this PR**                              |
| F2  | Stripe Connect dispute/refund is v1-logged-only; as MoR we eat chargebacks — need reverse-transfer + dispute handling         | financial liability  | **in this PR**                              |
| F3  | Live Accounts-v2 payload unvalidated (`as any` in `lib/stripe/connect.ts`)                                                    | go-live risk         | run `stripe-connect-smoke` with a valid key |
| F4  | Node version drift (repo wants 20; jest segfaults on 25)                                                                      | contributor friction | **doc'd in this PR**                        |

## Success metrics (extend MARKET_LEADER_PLAN)

| Metric                                     | Now | R-target                      |
| ------------------------------------------ | --- | ----------------------------- |
| Recurring MRR under management             | £0  | first £X within 90 days of R1 |
| AML attach rate (regulated firms)          | 0%  | 50%                           |
| Benchmark opt-in                           | 0%  | 40%                           |
| Proposal → signed → _recurring_ conversion | n/a | track from R1                 |

## Sequencing

```
R1 recurring ──► R1.5 dunning ──► R3 benchmarks (needs pricing data)
   │
   ├─► F1/F2/F4 fixes (ship first, low risk)
   └─► R2 AML (creds) ┐
       R4.1 Xero (creds)┘ parallel once creds land
R5 differentiators build on R1+R3 data
```

**Ship order this session (unattended):** F1, F4 (safe fixes) → F2 (dispute handling)
→ R1 (recurring) → R3 (benchmarks). AML/Xero go-live and anything touching prod money
flow waits for review + credentials.
