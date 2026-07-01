import {
  evaluateTenantBilling,
  getTrialEndsAt,
  TRIAL_EXPIRED_MESSAGE,
} from '../subscriptionService.js';

describe('subscriptionService', () => {
  const baseTenant = {
    id: 'tenant-1',
    createdAt: new Date('2026-06-01T00:00:00Z'),
    settings: JSON.stringify({ trialEndsAt: '2026-06-20T00:00:00Z' }),
    subscriptionStatus: 'trialing',
    stripeSubscriptionId: null,
  };

  beforeEach(() => {
    delete process.env.BYPASS_SUBSCRIPTION_ENFORCEMENT;
  });

  it('allows sending during an active trial', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-10T00:00:00Z'));

    const result = evaluateTenantBilling(baseTenant);
    expect(result.allowed).toBe(true);
    expect(result.daysRemaining).toBeGreaterThan(0);

    jest.useRealTimers();
  });

  it('blocks sending after trial expiry', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-01T00:00:00Z'));

    const result = evaluateTenantBilling(baseTenant);
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('TRIAL_EXPIRED');
    expect(result.message).toBe(TRIAL_EXPIRED_MESSAGE);

    jest.useRealTimers();
  });

  it('allows sending with an active paid subscription', () => {
    const result = evaluateTenantBilling({
      ...baseTenant,
      subscriptionStatus: 'active',
      stripeSubscriptionId: 'sub_123',
    });
    expect(result.allowed).toBe(true);
  });

  it('derives trial end from tenant creation when settings omit trialEndsAt', () => {
    const trialEndsAt = getTrialEndsAt({
      createdAt: new Date('2026-01-01T00:00:00Z'),
      settings: '{}',
    });
    expect(trialEndsAt.toISOString().slice(0, 10)).toBe('2026-01-15');
  });
});