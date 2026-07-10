import {
  stripeIntervalFor,
  splitRecurring,
  hasRecurringLines,
  planRecurringCheckout,
} from '../recurringLines.js';

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
    expect(byKey['month:1'].lines[0]).toEqual({
      name: 'Bookkeeping',
      unitAmountPence: 8500,
      quantity: 1,
    });
    expect(byKey['year:1'].lines).toHaveLength(1);
    expect(byKey['year:1'].lines[0].unitAmountPence).toBe(30000);
  });

  it('multiplies by quantity for one-off lines', () => {
    const r = splitRecurring([
      { name: 'Setup', displayPrice: 50, billingFrequency: 'ONE_TIME', quantity: 3 },
    ]);
    expect(r.oneOffPence).toBe(15000);
    expect(r.recurringGroups).toHaveLength(0);
  });
});

describe('hasRecurringLines', () => {
  it('detects recurring lines', () => {
    expect(hasRecurringLines([{ name: 'x', displayPrice: 10, billingFrequency: 'MONTHLY' }])).toBe(
      true
    );
    expect(hasRecurringLines([{ name: 'x', displayPrice: 10, billingFrequency: 'ONE_TIME' }])).toBe(
      false
    );
  });
});

describe('planRecurringCheckout', () => {
  const services = [
    { name: 'Bookkeeping', billingFrequency: 'MONTHLY', grossTotal: 102 }, // £85 + VAT
    { name: 'VAT returns', billingFrequency: 'MONTHLY', grossTotal: 48 },
    { name: 'Onboarding', billingFrequency: 'ONE_TIME', grossTotal: 600 },
  ];

  it('plans a single-interval subscription with one-off lines when totals match', () => {
    const plan = planRecurringCheckout(services, 750); // 102 + 48 + 600
    expect(plan).not.toBeNull();
    expect(plan!.group.key).toBe('month:1');
    expect(plan!.group.lines).toHaveLength(2);
    expect(plan!.group.lines[0]).toEqual({
      name: 'Bookkeeping',
      unitAmountPence: 10200,
      quantity: 1,
    });
    expect(plan!.oneOffLines).toEqual([
      { name: 'Onboarding', unitAmountPence: 60000, quantity: 1 },
    ]);
  });

  it('falls back (null) when recurring lines span multiple intervals', () => {
    const mixed = [
      ...services,
      { name: 'Tax review', billingFrequency: 'ANNUALLY', grossTotal: 300 },
    ];
    expect(planRecurringCheckout(mixed, 1050)).toBeNull();
  });

  it('falls back (null) when there are no recurring lines', () => {
    expect(
      planRecurringCheckout([{ name: 'Setup', billingFrequency: 'ONE_TIME', grossTotal: 100 }], 100)
    ).toBeNull();
  });

  it('falls back (null) when the line sum disagrees with the stored total (e.g. discount)', () => {
    expect(planRecurringCheckout(services, 700)).toBeNull();
  });
});
