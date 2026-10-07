import { proposalHasRecurringEngagement } from '../renewalReminders.js';

describe('proposalHasRecurringEngagement', () => {
  it('treats an hourly-only proposal as quoted, not a repeating engagement', () => {
    expect(
      proposalHasRecurringEngagement({
        paymentFrequency: 'HOURLY',
        services: [{ billingFrequency: 'HOURLY' }],
      })
    ).toBe(false);
    expect(
      proposalHasRecurringEngagement({
        paymentFrequency: 'ONE_TIME',
        services: [{ billingFrequency: 'HOURLY' }, { billingFrequency: 'ONE_TIME' }],
      })
    ).toBe(false);
  });

  it('still treats a monthly line as recurring', () => {
    expect(
      proposalHasRecurringEngagement({
        paymentFrequency: 'ONE_TIME',
        services: [{ billingFrequency: 'MONTHLY' }],
      })
    ).toBe(true);
    expect(
      proposalHasRecurringEngagement({
        paymentFrequency: 'MONTHLY',
        services: [{ billingFrequency: 'HOURLY' }],
      })
    ).toBe(true);
  });
});
