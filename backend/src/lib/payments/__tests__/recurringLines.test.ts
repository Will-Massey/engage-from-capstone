import { stripeIntervalFor, splitRecurring, hasRecurringLines } from '../recurringLines.js';

describe('stripeIntervalFor', () => {
  it('maps UK cycles to Stripe intervals', () => {
    expect(stripeIntervalFor('MONTHLY')).toEqual({ interval: 'month', interval_count: 1 });
    expect(stripeIntervalFor('QUARTERLY')).toEqual({ interval: 'month', interval_count: 3 });
    expect(stripeIntervalFor('ANNUALLY')).toEqual({ interval: 'year', interval_count: 1 });
    expect(stripeIntervalFor('WEEKLY')).toEqual({ interval: 'week', interval_count: 1 });
  });
  it('treats ONE_TIME and FIXED_DATE as non-recurring', () => {
    expect(stripeIntervalFor('ONE_TIME')).toBeNull();
    expect(stripeIntervalFor('FIXED_DATE')).toBeNull();
  });
});

describe('splitRecurring', () => {
  it('separates one-off from recurring and groups by interval', () => {
    const r = splitRecurring([
      { name: 'Bookkeeping', displayPrice: 85, billingFrequency: 'MONTHLY' },
      { name: 'VAT returns', displayPrice: 40, billingFrequency: 'MONTHLY', quantity: 1 },
      { name: 'Year-end accounts', displayPrice: 600, billingFrequency: 'ONE_TIME' },
      { name: 'Tax review', displayPrice: 300, billingFrequency: 'ANNUALLY' },
    ]);
    expect(r.oneOffPence).toBe(60000); // £600
    // one monthly group (2 lines) + one yearly group (1 line)
    const byKey = Object.fromEntries(r.recurringGroups.map((g) => [g.key, g]));
    expect(byKey['month:1'].lines).toHaveLength(2);
    expect(byKey['month:1'].lines[0]).toEqual({ name: 'Bookkeeping', unitAmountPence: 8500, quantity: 1 });
    expect(byKey['year:1'].lines).toHaveLength(1);
    expect(byKey['year:1'].lines[0].unitAmountPence).toBe(30000);
  });

  it('multiplies by quantity for one-off lines', () => {
    const r = splitRecurring([{ name: 'Setup', displayPrice: 50, billingFrequency: 'ONE_TIME', quantity: 3 }]);
    expect(r.oneOffPence).toBe(15000);
    expect(r.recurringGroups).toHaveLength(0);
  });
});

describe('hasRecurringLines', () => {
  it('detects recurring lines', () => {
    expect(hasRecurringLines([{ name: 'x', displayPrice: 10, billingFrequency: 'MONTHLY' }])).toBe(true);
    expect(hasRecurringLines([{ name: 'x', displayPrice: 10, billingFrequency: 'ONE_TIME' }])).toBe(false);
  });
});
