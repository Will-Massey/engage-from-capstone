import { calculateRenewalDate } from '../../jobs/renewalReminders.js';

describe('calculateRenewalDate', () => {
  // updateMissingRenewalDates applies the same rule set-based in SQL:
  // "renewalDate" = "acceptedAt" + interval '1 year'
  it('sets renewal to 12 months after acceptance', () => {
    const accepted = new Date('2026-03-15T10:30:00.000Z');
    const renewal = calculateRenewalDate(accepted);

    expect(renewal.getUTCFullYear()).toBe(2027);
    expect(renewal.getUTCMonth()).toBe(accepted.getUTCMonth());
    expect(renewal.getUTCDate()).toBe(accepted.getUTCDate());
  });

  it('does not mutate the input date', () => {
    const accepted = new Date('2026-03-15T10:30:00.000Z');
    const before = accepted.toISOString();
    calculateRenewalDate(accepted);
    expect(accepted.toISOString()).toBe(before);
  });

  it('crosses year boundaries correctly', () => {
    const accepted = new Date('2026-12-31T23:59:59.000Z');
    expect(calculateRenewalDate(accepted).getUTCFullYear()).toBe(2027);
  });
});
