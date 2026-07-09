import { buildProposalServiceRecord, calculateHeaderTotals } from '../proposalPricing';

const parseOneOffDueDate = (billingFrequency: string, raw: unknown) => {
  if (billingFrequency !== 'ONE_TIME') return null;
  if (!raw) return null;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
};

describe('proposalPricing', () => {
  it('stores lineTotal as discounted netTotal on create', () => {
    const record = buildProposalServiceRecord(
      {
        serviceId: 'svc-1',
        displayPrice: 200,
        billingFrequency: 'MONTHLY',
        quantity: 2,
        discountPercent: 15,
        vatRate: 20,
      },
      {
        id: 'svc-1',
        name: 'Bookkeeping',
        priceAmount: 200,
        billingCycle: 'MONTHLY',
      },
      parseOneOffDueDate
    );

    expect(record.lineTotal).toBe(340);
    expect(record.vatAmount).toBe(68);
    expect(record.grossTotal).toBe(408);
  });

  // Money invariants. Totals are currently held as Float (schema: displayPrice,
  // lineTotal, total ...), and they are converted to Int pence at the payment
  // boundary (proposal checkout uses Math.round(total * 100)). These tests
  // pin the arithmetic relationships so a future Float -> Int-pence migration
  // cannot silently change what a customer is charged.
  const build = (
    displayPrice: number,
    quantity: number,
    discountPercent: number,
    vatRate: number,
    billingFrequency = 'MONTHLY'
  ) =>
    buildProposalServiceRecord(
      { serviceId: 's', displayPrice, billingFrequency, quantity, discountPercent, vatRate },
      { id: 's', name: 'S', priceAmount: displayPrice },
      parseOneOffDueDate
    );

  const pence = (n: number) => Math.round(n * 100);

  it('keeps grossTotal === lineTotal + vatAmount on every line, incl. awkward prices', () => {
    const lines = [
      build(71, 3, 0, 20),
      build(33.33, 7, 12.5, 20),
      build(19.99, 1, 5, 5),
      build(250, 1, 33.3333, 20, 'ONE_TIME'),
      build(0.1, 9, 0, 20),
    ];
    for (const l of lines) {
      // Exact identity, not toBeCloseTo — stored money is rounded to pence
      expect(l.grossTotal).toBe(pence(l.lineTotal + l.vatAmount) / 100);
    }
  });

  it('persists every money field as whole pence (Stage 0 of the Int-pence migration)', () => {
    const awkward = [
      build(33.333, 3, 0, 20), // 99.999 raw net
      build(0.115, 2, 0, 20), // sub-penny display price
      build(19.99, 1.5, 7.77, 5), // fractional quantity + odd discount
    ];
    for (const l of awkward) {
      for (const field of [
        'displayPrice',
        'unitPrice',
        'lineTotal',
        'vatAmount',
        'grossTotal',
        'annualEquivalent',
      ] as const) {
        const v = l[field];
        expect(pence(v) / 100).toBeCloseTo(v, 10); // v IS a whole-pence value
      }
      expect(l.grossTotal).toBe(pence(l.lineTotal + l.vatAmount) / 100);
    }
    const totals = calculateHeaderTotals(awkward);
    for (const v of [totals.subtotal, totals.vatAmount, totals.total]) {
      expect(pence(v) / 100).toBeCloseTo(v, 10);
    }
  });

  it('keeps header total === subtotal + VAT across an awkward mixed basket', () => {
    const basket = [
      build(71, 3, 0, 20),
      build(33.33, 7, 12.5, 20),
      build(19.99, 1, 5, 5),
      build(250, 1, 33.3333, 20, 'ONE_TIME'),
      build(0.1, 9, 0, 20),
    ];
    const t = calculateHeaderTotals(basket);
    expect(t.total).toBeCloseTo(t.subtotal + t.vatAmount, 6);
  });

  it('converts the header total to whole pence exactly for clean amounts (payment boundary)', () => {
    const totals = calculateHeaderTotals([build(100, 1, 0, 20), build(500, 1, 10, 20, 'ONE_TIME')]);
    // 660.00 -> 66000p, the value fulfilment charges via Math.round(total * 100)
    expect(pence(totals.total)).toBe(66000);
  });

  it('calculates header totals from discounted line totals', () => {
    const monthly = buildProposalServiceRecord(
      {
        serviceId: 'svc-1',
        displayPrice: 100,
        billingFrequency: 'MONTHLY',
        quantity: 1,
        discountPercent: 0,
        vatRate: 20,
      },
      { id: 'svc-1', name: 'Monthly', priceAmount: 100 },
      parseOneOffDueDate
    );
    const oneTime = buildProposalServiceRecord(
      {
        serviceId: 'svc-2',
        displayPrice: 500,
        billingFrequency: 'ONE_TIME',
        quantity: 1,
        discountPercent: 10,
        vatRate: 20,
      },
      { id: 'svc-2', name: 'Setup', priceAmount: 500 },
      parseOneOffDueDate
    );

    const totals = calculateHeaderTotals([monthly, oneTime]);
    expect(totals.subtotal).toBe(550);
    expect(totals.vatAmount).toBe(110);
    expect(totals.total).toBe(660);
  });
});
