const sessionCreate = jest.fn(async (_args: any) => ({
  id: 'cs_sub_1',
  url: 'https://checkout.stripe.com/cs_sub_1',
}));
const subRetrieve = jest.fn(async () => ({ metadata: { proposalId: 'p1', tenantId: 't1' } }));
const activityCreate = jest.fn(async () => ({}));
const portalCreate = jest.fn(async () => ({ url: 'https://billing.stripe.com/session_1' }));

jest.mock('../../config/stripe.js', () => ({
  stripe: {
    checkout: { sessions: { create: sessionCreate } },
    subscriptions: { retrieve: subRetrieve },
    billingPortal: { sessions: { create: portalCreate } },
  },
}));
jest.mock('../../config/logger.js', () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
const proposalCount = jest.fn(async () => 0);
const activityFindMany = jest.fn(async (): Promise<{ metadata: string | null }[]> => []);
const activityCount = jest.fn(async () => 0);

jest.mock('../../config/database.js', () => ({
  prisma: {
    proposal: { count: proposalCount },
    activityLog: { create: activityCreate, findMany: activityFindMany, count: activityCount },
  },
}));

import {
  createRecurringCheckout,
  bpsToPercent,
  handleRecurringInvoicePaid,
  handleRecurringInvoiceFailed,
  createBillingPortalSession,
  getRecurringRevenueSummary,
} from '../proposalRecurringStripe.js';

const group = {
  key: 'month:1',
  interval: { interval: 'month' as const, interval_count: 1 },
  lines: [
    { name: 'Bookkeeping', unitAmountPence: 8500, quantity: 1 },
    { name: 'VAT returns', unitAmountPence: 4000, quantity: 1 },
  ],
};

describe('bpsToPercent', () => {
  it('converts basis points to Stripe application_fee_percent', () => {
    expect(bpsToPercent(250)).toBe(2.5);
    expect(bpsToPercent(100)).toBe(1);
  });
});

describe('createRecurringCheckout', () => {
  beforeEach(() => jest.clearAllMocks());

  it('builds a subscription-mode session with the fee split and recurring prices', async () => {
    const r = await createRecurringCheckout({
      proposalId: 'p1',
      tenantId: 't1',
      reference: 'PROP-1',
      group,
      connectedAccountId: 'acct_1',
      platformFeeBps: 250,
      customerEmail: 'c@x.com',
      successUrl: 'https://s',
      cancelUrl: 'https://c',
    });
    const arg: any = sessionCreate.mock.calls[0][0];
    expect(arg.mode).toBe('subscription');
    expect(arg.subscription_data.application_fee_percent).toBe(2.5);
    expect(arg.subscription_data.transfer_data.destination).toBe('acct_1');
    expect(arg.subscription_data.metadata).toEqual({ proposalId: 'p1', tenantId: 't1' });
    expect(arg.line_items).toHaveLength(2);
    expect(arg.line_items[0].price_data.recurring).toEqual({
      interval: 'month',
      interval_count: 1,
    });
    expect(arg.line_items[0].price_data.unit_amount).toBe(8500);
    expect(r.applicationFeePercent).toBe(2.5);
    expect(r.sessionId).toBe('cs_sub_1');
  });

  it('appends one-off lines as non-recurring items on the first invoice', async () => {
    await createRecurringCheckout({
      proposalId: 'p1',
      tenantId: 't1',
      reference: 'PROP-1',
      group,
      oneOffLines: [{ name: 'Onboarding', unitAmountPence: 60000, quantity: 1 }],
      connectedAccountId: 'acct_1',
      platformFeeBps: 250,
      customerEmail: 'c@x.com',
      successUrl: 'https://s',
      cancelUrl: 'https://c',
    });
    const arg: any = sessionCreate.mock.calls[0][0];
    expect(arg.line_items).toHaveLength(3);
    const oneOff = arg.line_items[2];
    expect(oneOff.price_data.recurring).toBeUndefined();
    expect(oneOff.price_data.unit_amount).toBe(60000);
    expect(oneOff.price_data.product_data.name).toBe('Onboarding');
  });
});

describe('recurring invoice webhooks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('logs RECURRING_PAYMENT on invoice.paid (metadata from subscription_details)', async () => {
    await handleRecurringInvoicePaid({
      id: 'in_1',
      subscription: 'sub_1',
      amount_paid: 12500,
      subscription_details: { metadata: { proposalId: 'p1', tenantId: 't1' } },
    });
    expect(subRetrieve).not.toHaveBeenCalled(); // metadata was on the invoice
    expect(activityCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'RECURRING_PAYMENT' }) })
    );
  });

  it('retrieves the subscription for metadata when the invoice lacks it', async () => {
    await handleRecurringInvoicePaid({ id: 'in_2', subscription: 'sub_1', amount_paid: 12500 });
    expect(subRetrieve).toHaveBeenCalledWith('sub_1');
    expect(activityCreate).toHaveBeenCalled();
  });

  it('logs RECURRING_PAYMENT_FAILED on invoice.payment_failed', async () => {
    await handleRecurringInvoiceFailed({
      id: 'in_3',
      subscription: 'sub_1',
      amount_due: 12500,
      subscription_details: { metadata: { proposalId: 'p1', tenantId: 't1' } },
    });
    expect(activityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'RECURRING_PAYMENT_FAILED' }),
      })
    );
  });
});

describe('createBillingPortalSession', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a portal session for the subscription customer', async () => {
    subRetrieve.mockResolvedValueOnce({ customer: 'cus_1' } as any);
    const url = await createBillingPortalSession('sub_1', 'https://return');
    expect(subRetrieve).toHaveBeenCalledWith('sub_1');
    expect(portalCreate).toHaveBeenCalledWith({ customer: 'cus_1', return_url: 'https://return' });
    expect(url).toBe('https://billing.stripe.com/session_1');
  });

  it('returns null when the subscription has no customer', async () => {
    subRetrieve.mockResolvedValueOnce({ customer: null } as any);
    const url = await createBillingPortalSession('sub_1', 'https://return');
    expect(portalCreate).not.toHaveBeenCalled();
    expect(url).toBeNull();
  });
});

describe('getRecurringRevenueSummary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('aggregates active subscriptions, collected pence, and failures', async () => {
    proposalCount.mockResolvedValueOnce(3);
    activityFindMany.mockResolvedValueOnce([
      { metadata: JSON.stringify({ amountPaid: 12500 }) },
      { metadata: JSON.stringify({ amountPaid: 8000 }) },
      { metadata: 'not-json' }, // malformed rows are skipped
      { metadata: JSON.stringify({}) }, // missing amount is skipped
    ]);
    activityCount.mockResolvedValueOnce(2);

    const summary = await getRecurringRevenueSummary('t1');

    expect(summary).toEqual({
      activeSubscriptions: 3,
      paidLast30DaysPence: 20500,
      failedLast30Days: 2,
    });
    expect(proposalCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 't1', stripeSubscriptionId: { not: null } }),
      })
    );
  });
});
