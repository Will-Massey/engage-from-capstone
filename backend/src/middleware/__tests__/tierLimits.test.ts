import { tenantHasPaidSubscription, tenantTrialIsActive } from '../tierLimits.js';

describe('tierLimits trial/paid classification', () => {
  const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const past = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  describe('tenantHasPaidSubscription', () => {
    it('treats a Stripe subscription id as paid', () => {
      expect(
        tenantHasPaidSubscription({ subscriptionStatus: null, stripeSubscriptionId: 'sub_1' })
      ).toBe(true);
    });

    it('treats status active as paid', () => {
      expect(
        tenantHasPaidSubscription({ subscriptionStatus: 'active', stripeSubscriptionId: null })
      ).toBe(true);
    });

    // Regression: 'trialing' must NOT count as paid, or a trialing tenant would
    // be treated as a permanent subscriber and never expire.
    it('does NOT treat trialing as paid', () => {
      expect(
        tenantHasPaidSubscription({ subscriptionStatus: 'trialing', stripeSubscriptionId: null })
      ).toBe(false);
    });

    it('treats status complimentary as paid (comped design-partner tenants)', () => {
      expect(
        tenantHasPaidSubscription({ subscriptionStatus: 'complimentary', stripeSubscriptionId: null })
      ).toBe(true);
    });

    it('does NOT treat trial as paid', () => {
      expect(
        tenantHasPaidSubscription({ subscriptionStatus: 'trial', stripeSubscriptionId: null })
      ).toBe(false);
    });
  });

  describe('tenantTrialIsActive', () => {
    it.each(['trial', 'trialing', 'TRIALING'])(
      'recognises %s as a trial within the window',
      (status) => {
        expect(tenantTrialIsActive({ subscriptionStatus: status, trialEndsAt: future })).toBe(true);
      }
    );

    it.each(['trial', 'trialing'])('expires %s after the trial end', (status) => {
      expect(tenantTrialIsActive({ subscriptionStatus: status, trialEndsAt: past })).toBe(false);
    });

    it('is not a trial for paid or cancelled statuses', () => {
      expect(tenantTrialIsActive({ subscriptionStatus: 'active', trialEndsAt: future })).toBe(
        false
      );
      expect(tenantTrialIsActive({ subscriptionStatus: 'cancelled', trialEndsAt: future })).toBe(
        false
      );
    });
  });
});
