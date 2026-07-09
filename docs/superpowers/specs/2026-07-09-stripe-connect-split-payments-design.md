# Design — Stripe Connect split payments (client → practice)

**Date:** 2026-07-09
**Status:** Approved (design), pending implementation plan
**Author:** William + Claude

## Goal

Move Engage's **client → practice** payment collection onto **Stripe Connect**, so a
single client payment is split natively between the practice (the accountant) and
Engage (the platform fee). Stripe becomes the **only** payment rail. Revolut and the
GoCardless stub are removed entirely, including Revolut as an optional
subscription-billing processor — platform subscriptions become Stripe-only (already
the live default).

**Why Stripe, why now:** destination charges split a payment natively via
`application_fee_amount`; Revolut has no equivalent, so keeping it as a fallback would
be dead code that cannot perform the core job. Connect is already enabled on the live
platform account (`acct_…Mc2LR`, CAPSTONE SOFTWARE LTD), and Stripe is already the
live subscription processor, so the path to live is short.

## Chosen model — Option A: Destination charges + recipient accounts

Engage stays **merchant of record**. The client pays through the Engage-branded
Checkout; Stripe auto-transfers the money to the practice's connected account minus
`application_fee_amount` (= Engage's platform fee + processor markup).

Connected accounts use **Accounts v2** (`POST /v2/core/accounts`) as **recipient**
config:

- `dashboard: "express"`
- `defaults.responsibilities.fees_collector: "application"`
- `defaults.responsibilities.losses_collector: "application"`
- request capability `stripe_balance.stripe_transfers`
- do **not** request `merchant` / `card_payments` (recipients only receive → light onboarding)

**Liability (accepted):** as MoR with `losses_collector: application`, Engage owns
disputes and negative-balance liability. Acceptable: B2B accountancy fees are
low-chargeback, amounts are agreed at sign, and a first-payout hold
(`firstPayoutHeldUntil`, already in the schema) stays as a risk control. Refund /
dispute → reverse-transfer handling is **logged only in v1** and built out as a fast
follow.

Rejected alternatives:

- **Direct charges + merchant accounts (SaaS model):** practice would be MoR and bear
  chargebacks, but requires heavy per-practice merchant underwriting and departs from
  today's flow. Not the Engage value prop.
- **Separate charges + transfers:** only needed for multi-seller splits or
  hold-and-release. One client → one practice, so overkill.

## Architecture

### Data model

Prisma migration on `TenantPayoutSettings`:

- **Add:** `stripeConnectedAccountId String?`, `stripeTransfersStatus String @default("inactive")`
  (mirrors the v2 `stripe_transfers` capability status).
- **Drop:** `revolutCounterpartyId`, `bankDetailsEncrypted`, `bankDetailsLast4`,
  `allowRevolutPay`, `allowCard`. New `payoutMethod` canonical value: `"STRIPE_CONNECT"`.
  (Per-tenant method toggles are retired: with dynamic payment methods the accepted
  methods are configured in the Stripe Dashboard, not per tenant.)

Engage no longer collects or stores practice bank details — Stripe's hosted
onboarding collects bank + identity. This retires `utils/ukBankValidation.ts` and the
bank-detail encryption path (attack-surface reduction).

### New backend components

- `lib/stripe/connect.ts` — thin wrapper: create v2 recipient account, create account
  link (hosted onboarding), retrieve `stripe_transfers` capability status.
- `services/stripeConnectService.ts` — tenant-facing: `getOrCreateConnectedAccount(tenantId)`,
  `startOnboarding(tenantId) → accountLinkUrl`, `syncTransfersStatus(accountId)` (from
  `account.updated` webhook), and the gate that only lets a tenant enable collection
  when `stripeTransfersStatus === "active"`.
- `services/proposalPaymentStripe.ts` — `createStripeProposalCheckout(proposal)` →
  Stripe **Checkout Session**.
- `routes/webhooks/stripeConnect.ts` — new endpoint `/api/webhooks/stripe-connect`
  (separate signing secret from the existing subscription webhook).

### Split mapping

- `application_fee_amount` (pence) = existing `engageRevenuePence`
  = `platformFeePence + processorMarkupPence`.
- Practice net = gross − `application_fee_amount`, auto-transferred by Stripe.
- `splitCalculator.ts`: add a `STRIPE` branch to `estimateProcessorCost` that folds the
  estimated Stripe processing fee into the app fee (protects margin at the 2.5%
  platform rate, per Stripe guidance for sub-4% fees). Core `calculateSplit` math is
  unchanged. `buildFeePreview` is parametrised to estimate Stripe (not Revolut)
  processing for the client-facing fee preview.
- Relocate `getPlatformFeeBps()` from the deleted `lib/revolut/plans.ts` into a neutral
  `lib/payments/` config module.

### VAT

Client → practice payments are the **practice's** fees to **their** client. The
proposal `total` is the gross the client pays. **No** Stripe Tax / `automatic_tax` on
these destination charges — VAT is the practice's concern, not Engage's. (Distinct
from platform-subscription billing, which keeps Stripe Tax for Engage's own UK VAT.)

## Data flow

### Practice onboarding (Settings → Billing → "Receive Payments Through Engage")

1. Practice clicks **"Connect with Stripe"** → `POST /api/payout/stripe/onboard`.
2. Backend `getOrCreateConnectedAccount` (v2 recipient) + creates an **Account Link**;
   responds with the hosted onboarding URL.
3. Practice completes Stripe-hosted onboarding, returns to Settings.
4. `account.updated` webhook → `syncTransfersStatus` updates `stripeTransfersStatus`.
   Settings shows a Pending/Active status pill. Enabling collection is gated on
   `stripe_transfers: active`.

(Hosted Account Links for v1; embedded `account_onboarding` component is a later
upgrade.)

### Client payment (post-sign)

1. Proposal accepted + practice has collection enabled → `paymentCollection`
   creates a Checkout Session via `createStripeProposalCheckout`:
   - `mode: payment`, GBP line item `unit_amount = grossPence`
   - `payment_intent_data: { application_fee_amount, transfer_data: { destination: stripeConnectedAccountId } }`
   - `metadata: { proposalId, tenantId }`
   - success / cancel → proposal share-token URLs
   - **no** `payment_method_types` (dynamic payment methods)
2. Client pays on Stripe Checkout.
3. `/api/webhooks/stripe-connect` handles `checkout.session.completed`:
   - mark proposal `PAID`
   - write payout-ledger activity log
   - `reportConversion` to Superadmin
   - idempotency guard on event id + "proposal already PAID"

### Provider gating

`isStripeConnectConfigured()` (platform keys present) + tenant has an active connected
account → collection available; else unavailable. No multi-provider abstraction —
Stripe is the only rail.

## Error handling

- Onboarding incomplete (`stripe_transfers` not active) → block enabling collection;
  Settings surfaces "Finish Stripe onboarding".
- Connected account missing/disabled at checkout time → 409, no session created,
  graceful message.
- `application_fee_amount ≥ gross` → `calculateSplit` already throws; guard before
  session creation.
- Webhook: verify signature with the Connect signing secret; idempotent on event id;
  never double-fulfil an already-`PAID` proposal.
- Refunds/disputes → v1 logs only; reverse-transfer automation is a fast follow.

## Testing

- **Unit (extend Jest):** `STRIPE` split math across tier × discount × VAT combos;
  provider gating (configured + active vs not).
- **E2E (mirror `payout-smoke`), Stripe test mode:** create test connected account →
  onboarding link → checkout session asserts correct `application_fee_amount` +
  `transfer_data.destination` → webhook fulfilment marks proposal `PAID`.

## Rollout

1. Migration + backend Connect service + checkout + webhook — **test mode**.
2. Frontend onboarding + checkout redirect swap.
3. Test-mode E2E green (create a test-mode connected account via the Stripe MCP).
4. Remove all Revolut code + `REVOLUT_*` env; confirm build + tests green.
5. Add live Connect webhook endpoint + signing secret on Render.
6. Onboard the demo tenant's connected account (live), run payout smoke.
7. Open to real practices. `firstPayoutHeldUntil` hold stays on.

## Revolut removal manifest

- **Delete:** `backend/src/lib/revolut/` (business-auth, business-client, fulfilment,
  plans, revolut-client, splits, webhook), `frontend/src/lib/revolut-checkout.ts`,
  `backend/src/services/gocardlessStub.ts`, `backend/src/utils/ukBankValidation.ts`.
- **Rewrite around Stripe:** `services/paymentCollection.ts`,
  `services/payoutSettingsService.ts`, `services/proposalPayment.ts`.
- **Strip Revolut branches:** `routes/{billing,payments,payout,proposals-share}.ts`,
  `index.ts` (webhook mount), `middleware/auth.ts`, `constants/paymentAgreements.ts`.
- **Frontend:** rework `Settings.tsx` (onboarding), `public/ProposalView.tsx` (checkout
  redirect), clean `Subscription.tsx`, `types/payment.ts`, `plugins/injectBuildTime.ts`,
  and Revolut wording in the 3 legal pages (`ClientPaymentAuthorisation`,
  `PaymentCollectionTerms`, `TermsOfService`).
- **Env:** drop all `REVOLUT_*` secrets (client, business, webhook).
- **Docs:** drop the "Revolut Business API" item from `task_plan.md` / `sendit.resume`.

## Out of scope (v1)

- Automated refund / dispute reverse-transfers (logged only).
- Embedded onboarding components (hosted Account Links for v1).
- Payout scheduling controls beyond the existing first-payout hold.
