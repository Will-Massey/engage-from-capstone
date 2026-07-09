const create = jest.fn(async () => ({ id: 'acct_123' }));
const linkCreate = jest.fn(async () => ({ url: 'https://connect.stripe.com/setup/abc' }));
const retrieve = jest.fn(async () => ({
  configuration: {
    recipient: {
      capabilities: {
        stripe_balance: { stripe_transfers: { status: 'active' } },
      },
    },
  },
}));

jest.mock('../../../config/stripe.js', () => ({
  stripe: {
    v2: {
      core: {
        accounts: { create, retrieve },
        accountLinks: { create: linkCreate },
      },
    },
  },
}));

import {
  createRecipientAccount,
  createOnboardingLink,
  getTransfersStatus,
} from '../connect.js';

describe('stripe connect wrapper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a recipient account and returns its id', async () => {
    const r = await createRecipientAccount({ country: 'gb', email: 'p@x.com' });
    expect(r.id).toBe('acct_123');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        dashboard: 'express',
        identity: { country: 'gb' },
        contact_email: 'p@x.com',
      })
    );
  });

  it('creates an onboarding link', async () => {
    const r = await createOnboardingLink('acct_123', 'https://ret', 'https://ref');
    expect(r.url).toContain('connect.stripe.com');
    expect(linkCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        account: 'acct_123',
        use_case: expect.objectContaining({ type: 'account_onboarding' }),
      })
    );
  });

  it('reads the stripe_transfers capability status', async () => {
    expect(await getTransfersStatus('acct_123')).toBe('active');
  });

  it('defaults transfers status to inactive when capability missing', async () => {
    retrieve.mockResolvedValueOnce({ configuration: undefined } as never);
    expect(await getTransfersStatus('acct_123')).toBe('inactive');
  });
});
