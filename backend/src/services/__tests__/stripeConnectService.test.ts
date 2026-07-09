const getOrCreatePayoutSettings = jest.fn();
const findUniquePayout = jest.fn();
const updatePayout = jest.fn(async () => ({}));
const updateManyPayout = jest.fn(async () => ({ count: 1 }));
const findUniqueTenant = jest.fn(async () => ({
  name: 'Acme',
  users: [{ email: 'p@x.com' }],
}));
const createRecipientAccount = jest.fn(async () => ({ id: 'acct_new' }));
const createOnboardingLink = jest.fn(async () => ({ url: 'https://link' }));
const getTransfersStatus = jest.fn(async () => 'active');

jest.mock('../../config/database.js', () => ({
  prisma: {
    tenantPayoutSettings: {
      findUnique: findUniquePayout,
      update: updatePayout,
      updateMany: updateManyPayout,
    },
    tenant: {
      findUnique: findUniqueTenant,
    },
  },
}));

jest.mock('../../lib/stripe/connect.js', () => ({
  createRecipientAccount,
  createOnboardingLink,
  getTransfersStatus,
}));

jest.mock('../payoutSettingsService.js', () => ({
  getOrCreatePayoutSettings,
}));

import {
  getOrCreateConnectedAccount,
  startOnboarding,
  syncTransfersStatus,
  isCollectionReady,
} from '../stripeConnectService.js';

describe('stripeConnectService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates and stores a connected account when none exists', async () => {
    getOrCreatePayoutSettings.mockResolvedValueOnce({
      tenantId: 't1',
      stripeConnectedAccountId: null,
    });
    const id = await getOrCreateConnectedAccount('t1');
    expect(id).toBe('acct_new');
    expect(createRecipientAccount).toHaveBeenCalledWith(
      expect.objectContaining({ country: 'gb', email: 'p@x.com', businessName: 'Acme' })
    );
    expect(updatePayout).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 't1' },
        data: expect.objectContaining({
          stripeConnectedAccountId: 'acct_new',
          payoutMethod: 'STRIPE_CONNECT',
        }),
      })
    );
  });

  it('reuses an existing connected account', async () => {
    getOrCreatePayoutSettings.mockResolvedValueOnce({
      tenantId: 't1',
      stripeConnectedAccountId: 'acct_old',
    });
    expect(await getOrCreateConnectedAccount('t1')).toBe('acct_old');
    expect(createRecipientAccount).not.toHaveBeenCalled();
  });

  it('startOnboarding returns link URL', async () => {
    getOrCreatePayoutSettings.mockResolvedValueOnce({
      tenantId: 't1',
      stripeConnectedAccountId: 'acct_old',
    });
    const r = await startOnboarding('t1', 'https://ret', 'https://ref');
    expect(r.url).toBe('https://link');
    expect(createOnboardingLink).toHaveBeenCalledWith('acct_old', 'https://ret', 'https://ref');
  });

  it('syncs transfers status by account id', async () => {
    await syncTransfersStatus('acct_old');
    expect(getTransfersStatus).toHaveBeenCalledWith('acct_old');
    expect(updateManyPayout).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeConnectedAccountId: 'acct_old' },
        data: { stripeTransfersStatus: 'active' },
      })
    );
  });

  it('isCollectionReady reflects stored status', async () => {
    findUniquePayout.mockResolvedValueOnce({ stripeTransfersStatus: 'active' });
    expect(await isCollectionReady('t1')).toBe(true);

    findUniquePayout.mockResolvedValueOnce({ stripeTransfersStatus: 'pending' });
    expect(await isCollectionReady('t1')).toBe(false);

    findUniquePayout.mockResolvedValueOnce(null);
    expect(await isCollectionReady('t1')).toBe(false);
  });
});
