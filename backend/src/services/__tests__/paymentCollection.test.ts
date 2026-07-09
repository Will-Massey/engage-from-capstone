const isCollectionReady = jest.fn(async () => false);
const isPayoutCollectionEnabled = jest.fn(async () => true);
const findUniqueTenant = jest.fn(async () => ({
  settings: JSON.stringify({ payments: { collectPaymentAtSign: true } }),
}));

jest.mock('../../config/stripe.js', () => ({
  stripe: { checkout: { sessions: { create: jest.fn() } } },
}));

jest.mock('../stripeConnectService.js', () => ({
  isCollectionReady,
  getOrCreateConnectedAccount: jest.fn(async () => 'acct_1'),
}));

jest.mock('../payoutSettingsService.js', () => ({
  isPayoutCollectionEnabled,
}));

jest.mock('../../config/database.js', () => ({
  prisma: {
    tenant: { findUnique: findUniqueTenant },
  },
}));

import {
  resolvePaymentProvider,
  shouldCollectPaymentAtSign,
  isPaymentCollectionAvailable,
} from '../paymentCollection.js';

describe('paymentCollection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('resolvePaymentProvider', () => {
    it('returns stripe when stripe client is configured', () => {
      expect(resolvePaymentProvider()).toBe('stripe');
      expect(isPaymentCollectionAvailable()).toBe(true);
    });
  });

  describe('shouldCollectPaymentAtSign', () => {
    it('returns false when Connect is not ready', async () => {
      isCollectionReady.mockResolvedValueOnce(false);
      isPayoutCollectionEnabled.mockResolvedValueOnce(true);
      expect(await shouldCollectPaymentAtSign('t1')).toBe(false);
    });

    it('returns true when payout enabled, Connect ready, and collect-at-sign on', async () => {
      isCollectionReady.mockResolvedValueOnce(true);
      isPayoutCollectionEnabled.mockResolvedValueOnce(true);
      findUniqueTenant.mockResolvedValueOnce({
        settings: JSON.stringify({ payments: { collectPaymentAtSign: true } }),
      });
      expect(await shouldCollectPaymentAtSign('t1')).toBe(true);
    });

    it('returns false when payout collection disabled', async () => {
      isCollectionReady.mockResolvedValueOnce(true);
      isPayoutCollectionEnabled.mockResolvedValueOnce(false);
      expect(await shouldCollectPaymentAtSign('t1')).toBe(false);
    });
  });
});

describe('resolvePaymentProvider when Stripe missing', () => {
  it('returns none', async () => {
    jest.resetModules();
    jest.doMock('../../config/stripe.js', () => ({ stripe: null }));
    jest.doMock('../stripeConnectService.js', () => ({
      isCollectionReady: jest.fn(),
      getOrCreateConnectedAccount: jest.fn(),
    }));
    jest.doMock('../payoutSettingsService.js', () => ({
      isPayoutCollectionEnabled: jest.fn(),
    }));
    jest.doMock('../../config/database.js', () => ({
      prisma: { tenant: { findUnique: jest.fn() } },
    }));
    const mod = await import('../paymentCollection.js');
    expect(mod.resolvePaymentProvider()).toBe('none');
    expect(mod.isPaymentCollectionAvailable()).toBe(false);
  });
});
