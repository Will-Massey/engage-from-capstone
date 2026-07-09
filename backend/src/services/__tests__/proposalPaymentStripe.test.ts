const sessionCreate = jest.fn(async (_args: any) => ({
  id: 'cs_1',
  url: 'https://checkout.stripe.com/cs_1',
}));

jest.mock('../../config/stripe.js', () => ({
  stripe: { checkout: { sessions: { create: sessionCreate } } },
}));

import { createStripeProposalCheckout } from '../proposalPaymentStripe.js';

describe('createStripeProposalCheckout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds a destination charge with the correct application fee and destination', async () => {
    const r = await createStripeProposalCheckout({
      proposalId: 'p1',
      tenantId: 't1',
      reference: 'PROP-1',
      title: 'Accounts',
      grossPence: 10000,
      connectedAccountId: 'acct_1',
      platformFeeBps: 250,
      customerEmail: 'c@x.com',
      successUrl: 'https://s',
      cancelUrl: 'https://c',
    });

    const arg: any = sessionCreate.mock.calls[0][0];
    expect(arg.mode).toBe('payment');
    expect(arg.customer_email).toBe('c@x.com');
    expect(arg.payment_intent_data.transfer_data.destination).toBe('acct_1');
    expect(arg.payment_intent_data.application_fee_amount).toBe(r.applicationFeePence);
    expect(arg.line_items[0].price_data.unit_amount).toBe(10000);
    expect(arg.line_items[0].price_data.currency).toBe('gbp');
    expect(arg.payment_method_types).toBeUndefined(); // dynamic payment methods
    expect(arg.metadata).toEqual({ proposalId: 'p1', tenantId: 't1' });
    expect(r.sessionId).toBe('cs_1');
    expect(r.checkoutUrl).toContain('checkout.stripe.com');
    // application fee = engageRevenuePence = platformFee(250) + processorMarkup(50) for 10000 @ 250bps
    expect(r.applicationFeePence).toBe(300);
  });

  it('throws when Stripe is not configured', async () => {
    jest.resetModules();
    jest.doMock('../../config/stripe.js', () => ({ stripe: null }));
    const { createStripeProposalCheckout: fn } = await import('../proposalPaymentStripe.js');
    await expect(
      fn({
        proposalId: 'p1',
        tenantId: 't1',
        reference: 'PROP-1',
        title: 'Accounts',
        grossPence: 10000,
        connectedAccountId: 'acct_1',
        platformFeeBps: 250,
        customerEmail: 'c@x.com',
        successUrl: 'https://s',
        cancelUrl: 'https://c',
      })
    ).rejects.toThrow(/STRIPE_NOT_CONFIGURED/);
    jest.dontMock('../../config/stripe.js');
  });
});
