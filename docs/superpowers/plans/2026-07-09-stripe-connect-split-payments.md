# Stripe Connect Split Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move client→practice payment collection to Stripe Connect destination charges (recipient accounts, native `application_fee_amount` split), make Stripe the sole payment rail, and remove Revolut + the GoCardless stub entirely.

**Architecture:** Engage stays merchant of record. A client pays through an Engage-created Stripe Checkout Session; `payment_intent_data.transfer_data.destination` routes the money to the practice's Accounts-v2 **recipient** connected account, minus `application_fee_amount` (= Engage's platform fee + processor markup). Practices onboard via Stripe-hosted Account Links. A dedicated Connect webhook fulfils payments and syncs onboarding capability status.

**Tech Stack:** Node/TypeScript, Express, Prisma (Postgres/Neon), Stripe SDK `^20.4.0` (`v2.core.accounts` + `v2.core.accountLinks` + Checkout + webhooks), Jest + ts-jest (ESM, `.js` import specifiers), React/Vite frontend.

Design spec: `docs/superpowers/specs/2026-07-09-stripe-connect-split-payments-design.md`.

## Global Constraints

- **Currency:** GBP; all amounts in integer pence.
- **Connect model:** Accounts v2 recipient config only — `dashboard: "express"`, `fees_collector: "application"`, `losses_collector: "application"`, capability `stripe_balance.stripe_transfers`. NEVER `type: 'express'|'custom'|'standard'` (deprecated v1).
- **Charge pattern:** Destination charges. Fee via `application_fee_amount`. NEVER `application_fee_amount` with separate charges+transfers.
- **Never pass `payment_method_types`** on any PaymentIntent/Checkout Session (dynamic payment methods).
- **Go-live capability check:** `configuration.recipient.capabilities.stripe_balance.stripe_transfers.status === 'active'`. Never use `charges_enabled`/`payouts_enabled`.
- **Split identity:** `application_fee_amount` (pence) = `engageRevenuePence` = `platformFeePence + processorMarkupPence`.
- **No Stripe Tax** on client→practice charges (practice's VAT, not Engage's). Platform-subscription billing keeps Stripe Tax unchanged.
- **Test command:** from `backend/`, `npx jest <path>` (config ignores `/smoke/`). Typecheck: `npx tsc --noEmit`.
- **Stripe object is nullable** (`config/stripe.ts` exports `stripe` or `null`); guard before use and throw `ApiError('STRIPE_NOT_CONFIGURED', ..., 503)`.

---

### Task 1: Decouple + extend the split calculator

Relocate `getPlatformFeeBps()` off the (to-be-deleted) `lib/revolut/plans.ts` and add a `STRIPE` processor-cost estimate so the split math no longer references Revolut.

**Files:**
- Create: `backend/src/lib/payments/feeConfig.ts`
- Modify: `backend/src/lib/payments/splitCalculator.ts:1` (import), `:38-49` (`estimateProcessorCost`), `:88-101` (`buildFeePreview`)
- Test: `backend/src/lib/payments/__tests__/splitCalculator.test.ts`

**Interfaces:**
- Produces: `getPlatformFeeBps(): number` (from `feeConfig.js`); `estimateProcessorCost(provider: 'STRIPE', grossPence: number): number`; `buildFeePreview(grossPence: number, platformFeeBps: number)` unchanged signature, now Stripe-based.

- [x] **Step 1: Write `feeConfig.ts` with the relocated helper**

```typescript
// backend/src/lib/payments/feeConfig.ts
/** Default platform fee in basis points when no tier/override applies. */
export function getPlatformFeeBps(): number {
  const raw = Number(process.env.ENGAGE_PLATFORM_FEE_BPS ?? 250);
  if (!Number.isFinite(raw) || raw < 0 || raw > 10000) return 250;
  return Math.round(raw);
}

/** Estimated Stripe processing cost to Engage (pence). UK standard card ~1.5% + 20p. */
export function estimateStripeProcessorCost(grossPence: number): number {
  const bps = Number(process.env.ENGAGE_STRIPE_PROCESSOR_BPS ?? 150);
  const fixed = Number(process.env.ENGAGE_STRIPE_PROCESSOR_FIXED_PENCE ?? 20);
  const safeBps = Number.isFinite(bps) && bps >= 0 ? bps : 150;
  const safeFixed = Number.isFinite(fixed) && fixed >= 0 ? fixed : 20;
  return Math.round((grossPence * safeBps) / 10000) + safeFixed;
}
```

- [x] **Step 2: Write failing tests**

```typescript
// append to splitCalculator.test.ts
import { getPlatformFeeBps, estimateStripeProcessorCost } from '../feeConfig.js';

describe('feeConfig', () => {
  it('estimates Stripe processing cost (1.5% + 20p)', () => {
    expect(estimateStripeProcessorCost(10000)).toBe(170); // 150 + 20
  });
  it('defaults platform fee to 250 bps', () => {
    delete process.env.ENGAGE_PLATFORM_FEE_BPS;
    expect(getPlatformFeeBps()).toBe(250);
  });
});

describe('splitCalculator STRIPE branch', () => {
  it('estimates processor cost for STRIPE', () => {
    expect(estimateProcessorCost('STRIPE', 10000)).toBe(170);
  });
  it('fee preview nets practice share after Stripe cost + platform fee', () => {
    const p = buildFeePreview(10000, 250);
    expect(p.platformFeePence).toBe(250);
    expect(p.processingFeePence).toBeGreaterThan(0);
    expect(p.netToPracticePence).toBe(10000 - p.platformFeePence - p.processingFeePence);
  });
});
```

- [x] **Step 3: Run tests — expect FAIL**

Run: `cd backend && npx jest splitCalculator -v`
Expected: FAIL — `feeConfig` module not found / `estimateProcessorCost('STRIPE', ...)` unhandled.

- [x] **Step 4: Update `splitCalculator.ts`**

Change line 1 import from `'../revolut/plans.js'` to:
```typescript
import { getPlatformFeeBps, estimateStripeProcessorCost } from './feeConfig.js';
```
Replace `estimateProcessorCost` body (lines ~30-40) with:
```typescript
export function estimateProcessorCost(
  provider: 'STRIPE',
  grossPence: number
): number {
  return estimateStripeProcessorCost(grossPence);
}
```
In `buildFeePreview` (line ~89) change the first line from the Revolut estimate to:
```typescript
  const processorFeePence = estimateProcessorCost('STRIPE', grossPence);
```

- [x] **Step 5: Run tests + typecheck — expect PASS**

Run: `cd backend && npx jest splitCalculator -v && npx tsc --noEmit`
Expected: PASS; no type errors from `splitCalculator.ts` (note: `tsc` may still error on other files that import `lib/revolut` — those are removed in Task 9; scope this check to jest passing + no NEW errors in `splitCalculator.ts`/`feeConfig.ts`).

- [x] **Step 6: Commit**

```bash
git add backend/src/lib/payments/feeConfig.ts backend/src/lib/payments/splitCalculator.ts backend/src/lib/payments/__tests__/splitCalculator.test.ts
git commit -m "feat(payments): decouple split calc from Revolut, add Stripe processor estimate"
```


---

### Task 2: Prisma migration — Stripe payout columns

**Files:**
- Modify: `backend/prisma/schema.prisma:616-641` (model `TenantPayoutSettings`)
- Create: `backend/prisma/migrations/<timestamp>_stripe_connect_payout/migration.sql` (generated)

**Interfaces:**
- Produces: `TenantPayoutSettings.stripeConnectedAccountId: string | null`, `TenantPayoutSettings.stripeTransfersStatus: string` (default `"inactive"`). Removes `revolutCounterpartyId`, `bankDetailsEncrypted`, `bankDetailsLast4`, `allowRevolutPay`, `allowCard`.

- [x] **Step 1: Edit the model**

In `TenantPayoutSettings`, delete the lines for `allowRevolutPay`, `allowCard`, `bankDetailsEncrypted`, `bankDetailsLast4`, `revolutCounterpartyId`. Change `payoutMethod` default to `"STRIPE_CONNECT"`. Add:
```prisma
  stripeConnectedAccountId String?  @map("stripe_connected_account_id")
  stripeTransfersStatus    String   @default("inactive") @map("stripe_transfers_status")
```

- [x] **Step 2: Generate the migration**

Manual migration (no local `DATABASE_URL`): `backend/prisma/migrations/20260709120000_stripe_connect_payout/migration.sql`. `prisma generate` OK.

- [x] **Step 3: Verify client types**

Stale refs still in `payoutSettingsService.ts`, `paymentCollection.ts`, `routes/payout.ts`, `revolut/business-client.ts` — fixed in Task 5/9. Client regenerated.

- [x] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(db): TenantPayoutSettings Stripe Connect columns, drop Revolut/bank fields"
```

---

### Task 3: `lib/stripe/connect.ts` — v2 recipient account wrapper

Spike the exact v2 payload against test mode first (retrieval over memory), then wrap it.

**Files:**
- Create: `backend/src/lib/stripe/connect.ts`
- Test: `backend/src/lib/stripe/__tests__/connect.test.ts`

**Interfaces:**
- Consumes: `stripe` from `config/stripe.js`.
- Produces:
  - `createRecipientAccount(params: { country: string; email?: string; businessName?: string }): Promise<{ id: string }>`
  - `createOnboardingLink(accountId: string, returnUrl: string, refreshUrl: string): Promise<{ url: string }>`
  - `getTransfersStatus(accountId: string): Promise<string>` — returns the `stripe_transfers` capability status string (`"active" | "pending" | "inactive" | ...`).

- [x] **Step 1: Spike the payload in test mode**

Deferred live spike (no `STRIPE_SECRET_KEY_TEST` in session). Shape taken from plan + Stripe Accounts v2 docs (`dashboard: express`, recipient `stripe_balance.stripe_transfers`). Confirm against test mode before first deploy.

Using a test-mode secret key, confirm the exact accepted shape:
```bash
cd backend && node --input-type=module -e "
import Stripe from 'stripe';
const s = new Stripe(process.env.STRIPE_SECRET_KEY_TEST);
const a = await s.v2.core.accounts.create({
  dashboard: 'express',
  defaults: { responsibilities: { fees_collector: 'application', losses_collector: 'application' } },
  identity: { country: 'gb' },
  configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
  include: ['configuration.recipient', 'requirements'],
});
console.log(a.id, JSON.stringify(a.configuration?.recipient?.capabilities, null, 2));
"
```
Expected: an `acct_...` id prints and the capability tree includes `stripe_balance.stripe_transfers` with a `status`. If any field is rejected, adjust to the error's guidance and record the working shape here before continuing.

- [x] **Step 2: Write failing tests (mock `stripe`)**

```typescript
// backend/src/lib/stripe/__tests__/connect.test.ts
import { jest } from '@jest/globals';

const create = jest.fn(async () => ({ id: 'acct_123' }));
const linkCreate = jest.fn(async () => ({ url: 'https://connect.stripe.com/setup/abc' }));
const retrieve = jest.fn(async () => ({
  configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: 'active' } } } } },
}));

jest.unstable_mockModule('../../../config/stripe.js', () => ({
  stripe: { v2: { core: { accounts: { create, retrieve }, accountLinks: { create: linkCreate } } } },
}));

const { createRecipientAccount, createOnboardingLink, getTransfersStatus } = await import('../connect.js');

describe('stripe connect wrapper', () => {
  it('creates a recipient account and returns its id', async () => {
    const r = await createRecipientAccount({ country: 'gb', email: 'p@x.com' });
    expect(r.id).toBe('acct_123');
    expect(create).toHaveBeenCalled();
  });
  it('creates an onboarding link', async () => {
    const r = await createOnboardingLink('acct_123', 'https://ret', 'https://ref');
    expect(r.url).toContain('connect.stripe.com');
  });
  it('reads the stripe_transfers capability status', async () => {
    expect(await getTransfersStatus('acct_123')).toBe('active');
  });
});
```

- [x] **Step 3: Run — expect FAIL**

Run: `cd backend && npx jest lib/stripe/__tests__/connect -v`
Expected: FAIL — `../connect.js` not found.

- [x] **Step 4: Implement `connect.ts`**

```typescript
// backend/src/lib/stripe/connect.ts
import { stripe } from '../../config/stripe.js';

function requireStripe() {
  if (!stripe) throw new Error('STRIPE_NOT_CONFIGURED');
  return stripe;
}

export async function createRecipientAccount(params: {
  country: string;
  email?: string;
  businessName?: string;
}): Promise<{ id: string }> {
  const s = requireStripe();
  const account = await (s as any).v2.core.accounts.create({
    dashboard: 'express',
    defaults: { responsibilities: { fees_collector: 'application', losses_collector: 'application' } },
    identity: { country: params.country },
    contact_email: params.email,
    display_name: params.businessName,
    configuration: {
      recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
    },
    include: ['configuration.recipient', 'requirements'],
  });
  return { id: account.id };
}

export async function createOnboardingLink(
  accountId: string,
  returnUrl: string,
  refreshUrl: string
): Promise<{ url: string }> {
  const s = requireStripe();
  const link = await (s as any).v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: 'account_onboarding',
      account_onboarding: { configurations: ['recipient'], return_url: returnUrl, refresh_url: refreshUrl },
    },
  });
  return { url: link.url };
}

export async function getTransfersStatus(accountId: string): Promise<string> {
  const s = requireStripe();
  const account = await (s as any).v2.core.accounts.retrieve(accountId, {
    include: ['configuration.recipient'],
  });
  return (
    account?.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status ??
    'inactive'
  );
}
```

- [x] **Step 5: Run — expect PASS**

Run: `cd backend && npx jest lib/stripe/__tests__/connect -v`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add backend/src/lib/stripe/connect.ts backend/src/lib/stripe/__tests__/connect.test.ts
git commit -m "feat(stripe): Accounts v2 recipient account + onboarding link wrapper"
```

---

### Task 4: `services/stripeConnectService.ts` — tenant onboarding orchestration

**Files:**
- Create: `backend/src/services/stripeConnectService.ts`
- Test: `backend/src/services/__tests__/stripeConnectService.test.ts`

**Interfaces:**
- Consumes: `createRecipientAccount`, `createOnboardingLink`, `getTransfersStatus` (Task 3); `prisma` from `config/database.js`.
- Produces:
  - `getOrCreateConnectedAccount(tenantId: string): Promise<string>` — returns `stripeConnectedAccountId`, creating it if absent.
  - `startOnboarding(tenantId: string, returnUrl: string, refreshUrl: string): Promise<{ url: string }>`
  - `syncTransfersStatus(accountId: string): Promise<void>` — writes `stripeTransfersStatus` for the owning tenant.
  - `isCollectionReady(tenantId: string): Promise<boolean>` — true iff `stripeTransfersStatus === 'active'`.

- [ ] **Step 1: Write failing tests** (mock connect lib + prisma). Cover: creates account when none stored and persists id; `startOnboarding` returns link URL; `syncTransfersStatus` updates the row by `stripeConnectedAccountId`; `isCollectionReady` reflects the stored status.

```typescript
// backend/src/services/__tests__/stripeConnectService.test.ts
import { jest } from '@jest/globals';
const findUnique = jest.fn();
const update = jest.fn(async () => ({}));
const updateMany = jest.fn(async () => ({ count: 1 }));
jest.unstable_mockModule('../../config/database.js', () => ({
  prisma: { tenantPayoutSettings: { findUnique, update, updateMany }, tenant: { findUnique: jest.fn(async () => ({ name: 'Acme', users: [{ email: 'p@x.com' }] })) } },
}));
jest.unstable_mockModule('../../lib/stripe/connect.js', () => ({
  createRecipientAccount: jest.fn(async () => ({ id: 'acct_new' })),
  createOnboardingLink: jest.fn(async () => ({ url: 'https://link' })),
  getTransfersStatus: jest.fn(async () => 'active'),
}));
const svc = await import('../stripeConnectService.js');

describe('stripeConnectService', () => {
  it('creates and stores a connected account when none exists', async () => {
    findUnique.mockResolvedValueOnce({ tenantId: 't1', stripeConnectedAccountId: null });
    const id = await svc.getOrCreateConnectedAccount('t1');
    expect(id).toBe('acct_new');
    expect(update).toHaveBeenCalled();
  });
  it('reuses an existing connected account', async () => {
    findUnique.mockResolvedValueOnce({ tenantId: 't1', stripeConnectedAccountId: 'acct_old' });
    expect(await svc.getOrCreateConnectedAccount('t1')).toBe('acct_old');
  });
  it('syncs transfers status by account id', async () => {
    await svc.syncTransfersStatus('acct_old');
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { stripeConnectedAccountId: 'acct_old' } }));
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`cd backend && npx jest stripeConnectService -v`).

- [ ] **Step 3: Implement the service**

```typescript
// backend/src/services/stripeConnectService.ts
import { prisma } from '../config/database.js';
import { createRecipientAccount, createOnboardingLink, getTransfersStatus } from '../lib/stripe/connect.js';
import { getOrCreatePayoutSettings } from './payoutSettingsService.js';

export async function getOrCreateConnectedAccount(tenantId: string): Promise<string> {
  const settings = await getOrCreatePayoutSettings(tenantId);
  if (settings.stripeConnectedAccountId) return settings.stripeConnectedAccountId;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, users: { take: 1, select: { email: true } } },
  });
  const { id } = await createRecipientAccount({
    country: 'gb',
    email: tenant?.users?.[0]?.email,
    businessName: tenant?.name,
  });
  await prisma.tenantPayoutSettings.update({
    where: { tenantId },
    data: { stripeConnectedAccountId: id, payoutMethod: 'STRIPE_CONNECT' },
  });
  return id;
}

export async function startOnboarding(
  tenantId: string,
  returnUrl: string,
  refreshUrl: string
): Promise<{ url: string }> {
  const accountId = await getOrCreateConnectedAccount(tenantId);
  return createOnboardingLink(accountId, returnUrl, refreshUrl);
}

export async function syncTransfersStatus(accountId: string): Promise<void> {
  const status = await getTransfersStatus(accountId);
  await prisma.tenantPayoutSettings.updateMany({
    where: { stripeConnectedAccountId: accountId },
    data: { stripeTransfersStatus: status },
  });
}

export async function isCollectionReady(tenantId: string): Promise<boolean> {
  const s = await prisma.tenantPayoutSettings.findUnique({
    where: { tenantId },
    select: { stripeTransfersStatus: true },
  });
  return s?.stripeTransfersStatus === 'active';
}
```

- [ ] **Step 4: Run — expect PASS** (`cd backend && npx jest stripeConnectService -v`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/stripeConnectService.ts backend/src/services/__tests__/stripeConnectService.test.ts
git commit -m "feat(payments): Stripe Connect onboarding + capability sync service"
```

---

### Task 5: Rewrite payout settings + Stripe checkout + collection gating

Rewrite `payoutSettingsService.ts` (drop Revolut/bank logic), add the Stripe checkout builder, and make `paymentCollection.ts` Stripe-only.

**Files:**
- Rewrite: `backend/src/services/payoutSettingsService.ts`
- Create: `backend/src/services/proposalPaymentStripe.ts`
- Rewrite: `backend/src/services/paymentCollection.ts`
- Test: `backend/src/services/__tests__/proposalPaymentStripe.test.ts`, `backend/src/services/__tests__/paymentCollection.test.ts`

**Interfaces:**
- Consumes: `isCollectionReady`, `getOrCreateConnectedAccount` (Task 4); `calculateSplit`, `estimateProcessorCost`, `estimateProcessorMarkup`, `resolvePlatformFeeBps` (Task 1 + existing `splitCalculator.ts`); `stripe` from `config/stripe.js`.
- Produces:
  - `createStripeProposalCheckout(input: { proposalId; tenantId; reference; title; grossPence; connectedAccountId; platformFeeBps; customerEmail; successUrl; cancelUrl }): Promise<{ sessionId: string; checkoutUrl: string; applicationFeePence: number }>`
  - `resolvePaymentProvider(): 'stripe' | 'none'`
  - `shouldCollectPaymentAtSign(tenantId): Promise<boolean>` (unchanged name; Stripe-gated)
  - `createPostSignMandate(proposalId, options): Promise<MandateSetupResult>` (unchanged name; returns Stripe checkout)

- [ ] **Step 1: Write failing test for the checkout builder**

```typescript
// backend/src/services/__tests__/proposalPaymentStripe.test.ts
import { jest } from '@jest/globals';
const sessionCreate = jest.fn(async () => ({ id: 'cs_1', url: 'https://checkout.stripe.com/cs_1' }));
jest.unstable_mockModule('../../config/stripe.js', () => ({
  stripe: { checkout: { sessions: { create: sessionCreate } } },
}));
const { createStripeProposalCheckout } = await import('../proposalPaymentStripe.js');

describe('createStripeProposalCheckout', () => {
  it('builds a destination charge with the correct application fee and destination', async () => {
    const r = await createStripeProposalCheckout({
      proposalId: 'p1', tenantId: 't1', reference: 'PROP-1', title: 'Accounts',
      grossPence: 10000, connectedAccountId: 'acct_1', platformFeeBps: 250,
      customerEmail: 'c@x.com', successUrl: 'https://s', cancelUrl: 'https://c',
    });
    const arg = sessionCreate.mock.calls[0][0];
    expect(arg.mode).toBe('payment');
    expect(arg.payment_intent_data.transfer_data.destination).toBe('acct_1');
    expect(arg.payment_intent_data.application_fee_amount).toBe(r.applicationFeePence);
    expect(arg.line_items[0].price_data.unit_amount).toBe(10000);
    expect(arg.line_items[0].price_data.currency).toBe('gbp');
    expect(arg.payment_method_types).toBeUndefined(); // dynamic methods
    expect(arg.metadata).toEqual({ proposalId: 'p1', tenantId: 't1' });
    expect(r.checkoutUrl).toContain('checkout.stripe.com');
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`cd backend && npx jest proposalPaymentStripe -v`).

- [ ] **Step 3: Implement `proposalPaymentStripe.ts`**

```typescript
// backend/src/services/proposalPaymentStripe.ts
import { stripe } from '../config/stripe.js';
import { calculateSplit, estimateProcessorCost } from '../lib/payments/splitCalculator.js';
import { estimateProcessorMarkup } from '../lib/payments/splitCalculator.js';

export interface StripeCheckoutInput {
  proposalId: string;
  tenantId: string;
  reference: string;
  title: string;
  grossPence: number;
  connectedAccountId: string;
  platformFeeBps: number;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export async function createStripeProposalCheckout(input: StripeCheckoutInput): Promise<{
  sessionId: string;
  checkoutUrl: string;
  applicationFeePence: number;
}> {
  if (!stripe) throw new Error('STRIPE_NOT_CONFIGURED');

  const processorFeePence = estimateProcessorCost('STRIPE', input.grossPence);
  const processorMarkupPence = estimateProcessorMarkup(input.grossPence);
  const split = calculateSplit({
    grossPence: input.grossPence,
    platformFeeBps: input.platformFeeBps,
    processorFeePence,
    processorMarkupPence,
  });
  const applicationFeePence = split.engageRevenuePence;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: input.customerEmail,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'gbp',
          unit_amount: input.grossPence,
          product_data: { name: `${input.reference} — ${input.title}` },
        },
      },
    ],
    payment_intent_data: {
      application_fee_amount: applicationFeePence,
      transfer_data: { destination: input.connectedAccountId },
    },
    metadata: { proposalId: input.proposalId, tenantId: input.tenantId },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });

  return { sessionId: session.id, checkoutUrl: session.url ?? '', applicationFeePence };
}
```

- [ ] **Step 4: Run — expect PASS** (`cd backend && npx jest proposalPaymentStripe -v`).

- [ ] **Step 5: Rewrite `payoutSettingsService.ts`**

Remove imports of `encrypt`, `validateUkBankDetails`, `maskAccountLast4`, `createCounterpartyFromBankDetails`. `PayoutSettingsPublic` loses `allowRevolutPay`, `allowCard`, `bankDetailsLast4`, `revolutCounterpartyId`; gains `stripeConnectedAccountId: string | null` and `stripeTransfersStatus: string`. `savePayoutSettings` drops all bank/counterparty branches — enabling requires accepted terms **and** `stripeTransfersStatus === 'active'` (throw otherwise). Keep `getOrCreatePayoutSettings`, `getPayoutSettingsPublic`, `isPayoutCollectionEnabled`. New public shape:
```typescript
export interface PayoutSettingsPublic {
  enabled: boolean;
  payoutMethod: string;
  accountHolderName: string | null;
  stripeConnectedAccountId: string | null;
  stripeTransfersStatus: string;
  verificationStatus: string;
  verifiedAt: string | null;
  consentVersion: string | null;
  consentAcceptedAt: string | null;
  platformFeeBps: number;
  collectPaymentAtSign: boolean;
}
```
`savePayoutSettings` enable-guard:
```typescript
if (enabled === true) {
  if (!consentAccepted || consentVersion !== PAYMENT_COLLECTION_TERMS_VERSION) {
    throw new Error('Payment Collection Terms must be accepted before enabling payouts');
  }
  if (current.stripeTransfersStatus !== 'active') {
    throw new Error('Finish Stripe onboarding before enabling payment collection');
  }
  data.enabled = true;
  data.enabledAt = new Date();
  data.enabledByUserId = userId;
  data.consentVersion = consentVersion;
  data.consentAcceptedAt = new Date();
  data.consentIp = consentIp ?? null;
} else if (enabled === false) {
  data.enabled = false;
}
```

- [ ] **Step 6: Rewrite `paymentCollection.ts`**

Replace `isRevolutConfigured`/`createProposalCheckoutOrder` imports with Stripe. `resolvePaymentProvider()` returns `'stripe'` when `stripe` is configured, else `'none'`. `PaymentProviderName = 'stripe' | 'none'`. `shouldCollectPaymentAtSign` uses `isCollectionReady(tenantId)` AND `collectPaymentAtSign` AND provider `stripe`. `createPostSignMandate` builds the Stripe checkout:
```typescript
import { stripe } from '../config/stripe.js';
import { getOrCreateConnectedAccount, isCollectionReady } from './stripeConnectService.js';
import { createStripeProposalCheckout } from './proposalPaymentStripe.js';
import { resolvePlatformFeeBps } from '../lib/payments/splitCalculator.js';
// ... inside createPostSignMandate, after the existing accepted/auth checks:
const ready = await isCollectionReady(proposal.tenantId);
if (!ready) throw new Error('This practice has not completed Stripe onboarding');
const connectedAccountId = await getOrCreateConnectedAccount(proposal.tenantId);
const base = getFrontendBaseUrl(proposal.tenant.subdomain);
const platformFeeBps = resolvePlatformFeeBps(
  proposal.tenant.subscriptionTier,
  proposal.tenant.payoutSettings?.platformFeeBpsOverride
);
const checkout = await createStripeProposalCheckout({
  proposalId: proposal.id, tenantId: proposal.tenantId,
  reference: proposal.reference, title: proposal.title,
  grossPence: Math.round((proposal.total ?? 0) * 100),
  connectedAccountId, platformFeeBps, customerEmail,
  successUrl: `${base}/proposals/view/${shareToken}?payment=success`,
  cancelUrl: `${base}/proposals/view/${shareToken}?payment=cancelled`,
});
await prisma.proposal.update({
  where: { id: proposalId },
  data: { paymentMandateId: checkout.sessionId, paymentProvider: 'stripe', paymentUrl: checkout.checkoutUrl },
});
return { provider: 'stripe', mandateId: checkout.sessionId, paymentId: checkout.sessionId,
  checkoutUrl: checkout.checkoutUrl, status: 'PENDING', isStub: false };
```
Update `getPublicPaymentConfig` to set `provider: 'stripe'`, `providerConfigured: provider === 'stripe'`, drop the `methods.revolutPay`/`card` toggles (return `{ card: true }` or remove the field — match the frontend change in Task 8).

- [ ] **Step 7: Write + run `paymentCollection.test.ts`**

Test `resolvePaymentProvider()` returns `'stripe'` when `stripe` truthy and `'none'` when null; `shouldCollectPaymentAtSign` false when `isCollectionReady` false. Mock `config/stripe.js`, `stripeConnectService.js`, `config/database.js`.
Run: `cd backend && npx jest paymentCollection proposalPaymentStripe -v` → PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/payoutSettingsService.ts backend/src/services/proposalPaymentStripe.ts backend/src/services/paymentCollection.ts backend/src/services/__tests__/
git commit -m "feat(payments): Stripe-only payout settings, checkout, and collection gating"
```

---

### Task 6: Connect webhook endpoint

**Files:**
- Create: `backend/src/routes/webhooks/stripeConnect.ts`
- Modify: `backend/src/index.ts` (mount `/api/webhooks/stripe-connect`)
- Test: `backend/src/routes/webhooks/__tests__/stripeConnect.test.ts`

**Interfaces:**
- Consumes: `stripe`, `prisma`, `syncTransfersStatus` (Task 4).
- Produces: Express router; handles `checkout.session.completed` (mark proposal `PAID`, idempotent) and `account.updated` (call `syncTransfersStatus`). Signing secret env: `STRIPE_CONNECT_WEBHOOK_SECRET`.

- [ ] **Step 1: Write failing test** — a `checkout.session.completed` event with `metadata.proposalId` marks the proposal PAID exactly once; a second delivery is a no-op. Mock `stripe.webhooks.constructEvent` to return the event, and `prisma.proposal`.

```typescript
// backend/src/routes/webhooks/__tests__/stripeConnect.test.ts
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
const constructEvent = jest.fn();
const findUnique = jest.fn();
const update = jest.fn(async () => ({}));
jest.unstable_mockModule('../../../config/stripe.js', () => ({ stripe: { webhooks: { constructEvent } } }));
jest.unstable_mockModule('../../../config/database.js', () => ({ prisma: { proposal: { findUnique, update }, activityLog: { create: jest.fn() } } }));
jest.unstable_mockModule('../../../services/stripeConnectService.js', () => ({ syncTransfersStatus: jest.fn() }));
const { default: router } = await import('../stripeConnect.js');

function app() { const a = express(); a.use('/api/webhooks/stripe-connect', router); return a; }

describe('stripe-connect webhook', () => {
  beforeEach(() => { process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec'; jest.clearAllMocks(); });
  it('marks the proposal PAID once', async () => {
    constructEvent.mockReturnValue({ type: 'checkout.session.completed', data: { object: { metadata: { proposalId: 'p1' } } } });
    findUnique.mockResolvedValue({ id: 'p1', paymentStatus: 'PENDING' });
    const res = await request(app()).post('/api/webhooks/stripe-connect').set('stripe-signature', 'x').send('{}');
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ paymentStatus: 'PAID' }) }));
  });
  it('is a no-op when already PAID', async () => {
    constructEvent.mockReturnValue({ type: 'checkout.session.completed', data: { object: { metadata: { proposalId: 'p1' } } } });
    findUnique.mockResolvedValue({ id: 'p1', paymentStatus: 'PAID' });
    await request(app()).post('/api/webhooks/stripe-connect').set('stripe-signature', 'x').send('{}');
    expect(update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`cd backend && npx jest stripeConnect -v`). If `supertest` is absent, install: `npm i -D supertest @types/supertest` (check `backend/package.json` first).

- [ ] **Step 3: Implement the router** (mirror `routes/stripeWebhook.ts`)

```typescript
// backend/src/routes/webhooks/stripeConnect.ts
import { Router } from 'express';
import express from 'express';
import { stripe } from '../../config/stripe.js';
import { prisma } from '../../config/database.js';
import { asyncHandler, ApiError } from '../../middleware/errorHandler.js';
import { syncTransfersStatus } from '../../services/stripeConnectService.js';

const router = Router();

async function fulfilProposalPayment(session: any) {
  const proposalId = session?.metadata?.proposalId;
  if (!proposalId) return;
  const proposal = await prisma.proposal.findUnique({ where: { id: proposalId }, select: { id: true, paymentStatus: true } });
  if (!proposal || proposal.paymentStatus === 'PAID') return; // idempotent
  await prisma.proposal.update({ where: { id: proposalId }, data: { paymentStatus: 'PAID' } });
  await prisma.activityLog.create({
    data: { tenantId: session.metadata.tenantId, action: 'PAYMENT_COMPLETED', entityType: 'PROPOSAL',
      entityId: proposalId, proposalId, description: 'payment completed',
      metadata: JSON.stringify({ sessionId: session.id, applicationFee: session.application_fee_amount }) },
  });
  // reportConversion to Superadmin is fire-and-forget; reuse existing superadmin client if present.
}

router.post('/', express.raw({ type: 'application/json' }), asyncHandler(async (req, res) => {
  if (!stripe) throw new ApiError('STRIPE_NOT_CONFIGURED', 'Stripe is not configured', 503);
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!sig || !secret) throw new ApiError('INVALID_WEBHOOK', 'Invalid webhook configuration', 400);
  let event;
  try { event = stripe.webhooks.constructEvent(req.body, sig, secret); }
  catch { throw new ApiError('INVALID_SIGNATURE', 'Invalid signature', 400); }

  switch (event.type) {
    case 'checkout.session.completed': await fulfilProposalPayment(event.data.object); break;
    case 'account.updated': {
      const acct: any = event.data.object;
      if (acct?.id) await syncTransfersStatus(acct.id);
      break;
    }
  }
  res.json({ received: true });
}));

export default router;
```

- [ ] **Step 4: Mount in `index.ts`**

Near the existing `stripeWebhook` mount, add (BEFORE any global `express.json()` body parser, matching how `stripeWebhook` is mounted):
```typescript
import stripeConnectWebhook from './routes/webhooks/stripeConnect.js';
app.use('/api/webhooks/stripe-connect', stripeConnectWebhook);
```

- [ ] **Step 5: Run — expect PASS** (`cd backend && npx jest stripeConnect -v`).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/webhooks/stripeConnect.ts backend/src/index.ts backend/src/routes/webhooks/__tests__/stripeConnect.test.ts
git commit -m "feat(payments): Stripe Connect webhook — fulfil payment + sync capability"
```

---

### Task 7: Onboarding route + payout settings API

**Files:**
- Modify: `backend/src/routes/payout.ts`
- Test: `backend/src/routes/__tests__/payout.stripe.test.ts`

**Interfaces:**
- Consumes: `startOnboarding` (Task 4), `getPayoutSettingsPublic` (Task 5).
- Produces: `POST /api/payout/stripe/onboard` → `{ url }`; existing `GET /api/payout/settings` returns the new public shape.

- [ ] **Step 1: Write failing test** — authenticated `POST /api/payout/stripe/onboard` returns `{ url }` from `startOnboarding` (mock it). Assert the return/refresh URLs point at the app's Settings billing tab.

- [ ] **Step 2: Run — expect FAIL** (`cd backend && npx jest payout.stripe -v`).

- [ ] **Step 3: Add the route** (mirror existing auth middleware usage in `payout.ts`)

```typescript
import { startOnboarding } from '../services/stripeConnectService.js';
// inside the router, protected by the same requireAuth used on other payout routes:
router.post('/stripe/onboard', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const base = (process.env.APP_URL || 'https://capstonesoftware.co.uk/engage').replace(/\/$/, '');
  const ret = `${base}/settings?tab=billing&onboarding=complete`;
  const link = await startOnboarding(tenantId, ret, ret);
  res.json(link);
}));
```
Remove any Revolut counterparty/bank-detail handlers from `payout.ts`.

- [ ] **Step 4: Run — expect PASS** (`cd backend && npx jest payout.stripe -v`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/payout.ts backend/src/routes/__tests__/payout.stripe.test.ts
git commit -m "feat(payments): Stripe onboarding route + payout settings API"
```

---

### Task 8: Frontend — onboarding UI + checkout redirect

**Files:**
- Modify: `frontend/src/pages/Settings.tsx` (Receive Payments section)
- Modify: `frontend/src/pages/public/ProposalView.tsx` (post-sign checkout)
- Modify: `frontend/src/types/payment.ts`, `frontend/src/plugins/injectBuildTime.ts`
- Delete: `frontend/src/lib/revolut-checkout.ts`

**Interfaces:**
- Consumes: `POST /api/payout/stripe/onboard` → `{ url }`; `GET /api/payout/settings` new shape; public payment config `provider: 'stripe'`, `checkoutUrl`.

- [ ] **Step 1: Settings — replace the bank-details form** with a **"Connect with Stripe"** button that calls `POST /api/payout/stripe/onboard` and does `window.location.href = url`. Render a status pill from `stripeTransfersStatus` (`active` → "Connected", else "Onboarding incomplete"). The "Enable payment collection" toggle is disabled unless `stripeTransfersStatus === 'active'`. Remove sort-code/account-number/Revolut-counterparty inputs and the `allowRevolutPay`/`allowCard` toggles.

- [ ] **Step 2: ProposalView — replace the Revolut checkout call** with a redirect to the Stripe Checkout `checkoutUrl` returned by the post-sign mandate endpoint (`window.location.href = checkoutUrl`). Delete the `revolut-checkout.ts` import + file.

- [ ] **Step 3: Types** — in `types/payment.ts` remove Revolut fields/enums; set provider type to `'stripe' | 'none'`. In `injectBuildTime.ts` remove any `REVOLUT_*` build-time injection.

- [ ] **Step 4: Verify frontend build + existing Vitest**

Run: `cd frontend && npm run build && npx vitest run`
Expected: build succeeds; existing tests pass. Fix any references to removed types.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(payments): Stripe Connect onboarding UI + checkout redirect, drop Revolut UI"
```

---

### Task 9: Remove all remaining Revolut + GoCardless code

**Files:**
- Delete: `backend/src/lib/revolut/` (all 7 files), `backend/src/services/gocardlessStub.ts`, `backend/src/services/proposalPayment.ts` (orphaned after Task 5), `backend/src/utils/ukBankValidation.ts`
- Modify: `backend/src/index.ts`, `backend/src/middleware/auth.ts`, `backend/src/routes/billing.ts`, `backend/src/routes/payments.ts`, `backend/src/routes/proposals-share.ts`, `backend/src/constants/paymentAgreements.ts`
- Modify frontend legal copy: `frontend/src/pages/legal/{ClientPaymentAuthorisation,PaymentCollectionTerms,TermsOfService}.tsx`, `frontend/src/pages/Subscription.tsx`

**Interfaces:** none produced; this task removes dead code and must leave build + tests green.

- [ ] **Step 1: Delete the files**

```bash
git rm -r backend/src/lib/revolut backend/src/services/gocardlessStub.ts backend/src/services/proposalPayment.ts backend/src/utils/ukBankValidation.ts frontend/src/lib/revolut-checkout.ts
```

- [ ] **Step 2: Find every remaining reference**

Run: `cd /c/Users/willi/engage-from-capstone && grep -rniE "revolut|gocardless|ukBankValidation|counterparty" backend/src frontend/src --include=*.ts --include=*.tsx`
Expected: a finite list. For each hit: remove the import/branch. Common ones — `index.ts` (Revolut webhook + payments-config mount), `middleware/auth.ts` (Revolut webhook path allowlist), `billing.ts`/`payments.ts` (Revolut subscription + checkout branches → keep only Stripe), `proposals-share.ts` (Revolut config surface), `constants/paymentAgreements.ts` (rename Revolut-specific constants; keep `PAYMENT_COLLECTION_TERMS_VERSION` + `CLIENT_PAYMENT_AUTH_VERSION`).

- [ ] **Step 3: Update legal + subscription copy**

In the 3 legal pages and `Subscription.tsx`, replace "Revolut" wording with "Stripe" (payment processor references) and remove Revolut-specific clauses. Keep the terms/authorisation structure intact.

- [ ] **Step 4: Full backend typecheck + tests**

Run: `cd backend && npx tsc --noEmit && npx jest`
Expected: no type errors, all tests pass. Iterate on any missed reference until clean.

- [ ] **Step 5: Full frontend build**

Run: `cd frontend && npm run build && npx vitest run`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(payments): remove Revolut + GoCardless entirely (Stripe-only)"
```

---

### Task 10: End-to-end smoke (Stripe test mode)

**Files:**
- Create: `scripts/stripe-connect-smoke.mjs`

**Interfaces:** Consumes the live app (test-mode keys). Validates onboarding link + destination-charge session + webhook fulfilment.

- [ ] **Step 1: Write the smoke script** — with test-mode keys: (a) `POST /api/payout/stripe/onboard` returns a `connect.stripe.com` URL; (b) create a checkout session for a seeded accepted proposal and assert `application_fee_amount > 0` and `transfer_data.destination` is the connected account; (c) simulate `checkout.session.completed` (Stripe CLI `stripe trigger` or a signed test event) and assert the proposal flips to `PAID`.

```javascript
// scripts/stripe-connect-smoke.mjs — outline; fill URLs from env API_URL + E2E_BYPASS_SECRET
// 1. onboard -> assert url startsWith https://connect.stripe.com
// 2. create checkout -> assert body.application_fee_amount > 0 && body.transfer_data.destination startsWith acct_
// 3. after webhook -> GET proposal -> assert paymentStatus === 'PAID'
```

- [ ] **Step 2: Run in test mode**

Run: `API_URL=http://localhost:3000 STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY_TEST node scripts/stripe-connect-smoke.mjs`
Expected: all three assertions print PASS.

- [ ] **Step 3: Commit**

```bash
git add scripts/stripe-connect-smoke.mjs
git commit -m "test(payments): Stripe Connect e2e smoke (onboarding + split + fulfilment)"
```

---

### Task 11: Docs + rollout checklist

**Files:**
- Modify: `task_plan.md`, `sendit.resume`, `PREMIER_SERVICE_TODO.md`

- [ ] **Step 1: Update handoff docs** — drop the "Revolut Business API" next-up item; add "Stripe Connect live: create live Connect webhook endpoint (`/api/webhooks/stripe-connect`) + set `STRIPE_CONNECT_WEBHOOK_SECRET` on Render; onboard demo tenant; run `stripe-connect-smoke.mjs` against prod." In `PREMIER_SERVICE_TODO.md` mark the Revolut items removed and add the Stripe Connect line.

- [ ] **Step 2: Commit**

```bash
git add task_plan.md sendit.resume PREMIER_SERVICE_TODO.md
git commit -m "docs: Stripe Connect rollout notes, drop Revolut items"
```

- [ ] **Step 3: Live rollout (manual, after merge)** — set live `STRIPE_CONNECT_WEBHOOK_SECRET` + register the Connect webhook endpoint in the Stripe Dashboard (events: `checkout.session.completed`, `account.updated`); redeploy; onboard the demo tenant's connected account; run the smoke against prod; then open to real practices. Keep the `firstPayoutHeldUntil` hold on.

---

## Notes for the implementer

- Two `node_modules/stripe` may exist (root + backend hoist); the backend imports resolve to the SDK exposing `v2.core.accounts` — verified.
- The v2 account/accountLink payloads in Task 3 are validated by the Step-1 spike; trust the spike's working shape over the sample if they differ.
- `express.raw` MUST be applied on the webhook route and it MUST be mounted before any global JSON body parser, exactly like the existing `stripeWebhook` mount.
