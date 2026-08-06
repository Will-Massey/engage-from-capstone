import {
  buildProposalServiceRecord,
  calculateHeaderTotals,
  penceToPounds,
} from '../proposalPricing';

const parseOneOffDueDate = (billingFrequency: string, raw: unknown) => {
  if (billingFrequency !== 'ONE_TIME') return null;
  if (!raw) return null;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
};

describe('proposalPricing', () => {
  it('stores lineTotalPence as discounted netTotal on create', () => {
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

    expect(record.lineTotalPence).toBe(34000);
    expect(record.vatAmountPence).toBe(6800);
    expect(record.grossTotalPence).toBe(40800);
  });

  // Money invariants. Storage is integer pence only (Stage 2 of the pence
  // migration, docs/money-int-pence-migration.md) — pounds exist solely at
  // the API boundary via penceToPounds. These tests pin the arithmetic
  // relationships so refactors cannot silently change what a customer is
  // charged.
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

  it('keeps grossTotalPence === lineTotalPence + vatAmountPence on every line, incl. awkward prices', () => {
    const lines = [
      build(71, 3, 0, 20),
      build(33.33, 7, 12.5, 20),
      build(19.99, 1, 5, 5),
      build(250, 1, 33.3333, 20, 'ONE_TIME'),
      build(0.1, 9, 0, 20),
    ];
    for (const l of lines) {
      // Exact integer identity — no float rounding anywhere in stored money
      expect(l.grossTotalPence).toBe(l.lineTotalPence + l.vatAmountPence);
    }
  });

  it('persists every money field as an integer pence value', () => {
    const awkward = [
      build(33.333, 3, 0, 20), // 99.999 raw net
      build(0.115, 2, 0, 20), // sub-penny display price
      build(19.99, 1.5, 7.77, 5), // fractional quantity + odd discount
    ];
    for (const l of awkward) {
      for (const field of [
        'displayPricePence',
        'unitPricePence',
        'lineTotalPence',
        'vatAmountPence',
        'grossTotalPence',
        'annualEquivalentPence',
      ] as const) {
        expect(Number.isInteger(l[field])).toBe(true);
      }
      expect(l.grossTotalPence).toBe(l.lineTotalPence + l.vatAmountPence);
    }
    const totals = calculateHeaderTotals(awkward);
    for (const v of [totals.subtotalPence, totals.vatAmountPence, totals.totalPence]) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('keeps header totalPence === subtotalPence + vatAmountPence across an awkward mixed basket', () => {
    const basket = [
      build(71, 3, 0, 20),
      build(33.33, 7, 12.5, 20),
      build(19.99, 1, 5, 5),
      build(250, 1, 33.3333, 20, 'ONE_TIME'),
      build(0.1, 9, 0, 20),
    ];
    const t = calculateHeaderTotals(basket);
    expect(t.totalPence).toBe(t.subtotalPence + t.vatAmountPence);
  });

  it('produces the exact pence total charged at the payment boundary', () => {
    const totals = calculateHeaderTotals([build(100, 1, 0, 20), build(500, 1, 10, 20, 'ONE_TIME')]);
    // £660.00 — the checkout charges totalPence directly
    expect(totals.totalPence).toBe(66000);
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
    expect(totals.subtotalPence).toBe(55000);
    expect(totals.vatAmountPence).toBe(11000);
    expect(totals.totalPence).toBe(66000);
  });

  it('sums header pence from line pence, not from re-rounded pounds', () => {
    const lines = [build(33.33, 1, 0, 20), build(0.01, 1, 0, 20), build(99.99, 3, 7, 20)];
    const t = calculateHeaderTotals(lines);
    expect(t.subtotalPence).toBe(lines.reduce((s, l) => s + l.lineTotalPence, 0));
    expect(t.vatAmountPence).toBe(lines.reduce((s, l) => s + l.vatAmountPence, 0));
    expect(t.totalPence).toBe(lines.reduce((s, l) => s + l.grossTotalPence, 0));
    expect(t.totalPence).toBe(t.subtotalPence + t.vatAmountPence);
    expect(Number.isInteger(t.totalPence)).toBe(true);
  });

  it('penceToPounds is the lossless inverse of stored pence at the API boundary', () => {
    const r = build(33.33, 1.5, 0, 20);
    expect(penceToPounds(r.lineTotalPence)).toBeCloseTo(r.lineTotalPence / 100, 10);
    expect(penceToPounds(null)).toBe(0);
    expect(penceToPounds(undefined)).toBe(0);
    expect(penceToPounds(66000)).toBe(660);
  });
});
