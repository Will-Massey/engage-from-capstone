import {
  calculateLineItem,
  calculateProposalTotals,
} from '../pricingEngine_v2';

describe('pricingEngine_v2', () => {
  it('applies discount to netTotal and grossTotal', () => {
    const line = calculateLineItem({
      basePrice: 100,
      billingFrequency: 'MONTHLY',
      quantity: 2,
      discountPercent: 10,
      vatRate: 20,
    });
    expect(line.lineTotal).toBe(200);
    expect(line.netTotal).toBe(180);
    expect(line.vatAmount).toBe(36);
    expect(line.grossTotal).toBe(216);
  });

  it('handles ONE_TIME with zero annual equivalent', () => {
    const line = calculateLineItem({
      basePrice: 500,
      billingFrequency: 'ONE_TIME',
      quantity: 1,
      vatRate: 20,
    });
    expect(line.annualEquivalent).toBe(0);
    expect(line.priceDisplayMode).toBe('ONE_TIME');
  });

  it('groups weekly lines in proposal totals', () => {
    const weekly = calculateLineItem({
      basePrice: 50,
      billingFrequency: 'WEEKLY',
      quantity: 1,
      vatRate: 20,
    });
    const monthly = calculateLineItem({
      basePrice: 100,
      billingFrequency: 'MONTHLY',
      quantity: 1,
      vatRate: 20,
    });
    const totals = calculateProposalTotals([weekly, monthly]);
    expect(totals.weekly.items).toHaveLength(1);
    expect(totals.monthly.items).toHaveLength(1);
    expect(totals.grandTotal).toBe(weekly.grossTotal + monthly.grossTotal);
  });
});
