import {
  evaluateTenantBilling,
  getTrialEndsAt,
  TRIAL_EXPIRED_MESSAGE,
} from '../subscriptionService.js';
import { TRIAL_DAYS } from '../../config/trial.js';

describe('subscriptionService', () => {
  const baseTenant = {
    id: 'tenant-1',
    createdAt: new Date('2026-06-01T00:00:00Z'),
    settings: JSON.stringify({ trialEndsAt: '2026-06-20T00:00:00Z' }),
    subscriptionStatus: 'trialing',
    stripeSubscriptionId: null as string | null,
    trialEndsAt: null as Date | null,
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

  it('never blocks a live Stripe subscriber on a stale/blank status', () => {
    // Stripe "trialing" (card on file) or a blank status must not expire while
    // the subscription id is present and not in a blocked (past_due) state.
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2027-01-01T00:00:00Z')); // long past any trial window

    for (const status of ['trialing', 'active', '', null]) {
      const result = evaluateTenantBilling({
        ...baseTenant,
        subscriptionStatus: status,
        stripeSubscriptionId: 'sub_live',
      });
      expect(result.allowed).toBe(true);
    }

    jest.useRealTimers();
  });

  it('allows a complimentary tenant even after its trial has expired', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2027-01-01T00:00:00Z')); // long past any trial window

    const result = evaluateTenantBilling({
      ...baseTenant,
      subscriptionStatus: 'complimentary',
      stripeSubscriptionId: null,
    });
    expect(result.allowed).toBe(true);

    jest.useRealTimers();
  });

  it('still blocks a Stripe subscriber whose payment is past_due', () => {
    const result = evaluateTenantBilling({
      ...baseTenant,
      subscriptionStatus: 'past_due',
      stripeSubscriptionId: 'sub_live',
    });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('SUBSCRIPTION_INACTIVE');
  });

  it('prefers the trialEndsAt column over legacy settings.trialEndsAt', () => {
    jest.useFakeTimers();
    // settings say the trial ended in June; the column says it runs to end of July
    jest.setSystemTime(new Date('2026-07-15T00:00:00Z'));

    const result = evaluateTenantBilling({
      ...baseTenant,
      settings: JSON.stringify({ trialEndsAt: '2026-06-20T00:00:00Z' }),
      trialEndsAt: new Date('2026-07-31T00:00:00Z'),
    });
    expect(result.allowed).toBe(true);
    expect(result.trialEndsAt?.toISOString().slice(0, 10)).toBe('2026-07-31');

    jest.useRealTimers();
  });

  it(`derives trial end from tenant creation + ${TRIAL_DAYS} days when nothing else is set`, () => {
    const trialEndsAt = getTrialEndsAt({
      createdAt: new Date('2026-01-01T00:00:00Z'),
      settings: '{}',
      trialEndsAt: null,
    });
    const expected = new Date('2026-01-01T00:00:00Z');
    expected.setDate(expected.getDate() + TRIAL_DAYS);
    expect(trialEndsAt.toISOString().slice(0, 10)).toBe(expected.toISOString().slice(0, 10));
  });
});
