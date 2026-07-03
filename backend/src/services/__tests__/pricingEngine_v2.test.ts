import {
  calculateLineItem,
  calculateProposalTotals,
} from '../pricingEngine_v2';
import type { BillingFrequency } from '@shared/pricingEngine';

const BILLING_CYCLES: BillingFrequency[] = [
  'ONE_TIME',
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'ANNUALLY',
];

const DISCOUNTS = [0, 10, 25];
const VAT_RATES = [0, 5, 20];

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

  it('stores discounted netTotal as the line subtotal basis (POST parity)', () => {
    const line = calculateLineItem({
      basePrice: 250,
      billingFrequency: 'QUARTERLY',
      quantity: 2,
      discountPercent: 20,
      vatRate: 20,
    });
    expect(line.netTotal).toBe(400);
    expect(line.grossTotal).toBe(480);
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

  describe.each(BILLING_CYCLES)('billing cycle %s', (billingFrequency) => {
    describe.each(DISCOUNTS)('discount %s%%', (discountPercent) => {
      describe.each(VAT_RATES)('VAT %s%%', (vatRate) => {
        it('calculates consistent net, VAT and gross totals', () => {
          const line = calculateLineItem({
            basePrice: 120,
            billingFrequency,
            quantity: 2,
            discountPercent,
            vatRate,
          });

          const expectedNet = 240 - 240 * (discountPercent / 100);
          const expectedVat = Math.round(expectedNet * (vatRate / 100) * 100) / 100;

          expect(line.netTotal).toBeCloseTo(expectedNet, 2);
          expect(line.vatAmount).toBe(expectedVat);
          expect(line.grossTotal).toBeCloseTo(expectedNet + expectedVat, 2);
        });
      });
    });
  });

  it('aggregates all billing bands into grandTotal', () => {
    const lines = BILLING_CYCLES.map((billingFrequency) =>
      calculateLineItem({
        basePrice: 100,
        billingFrequency,
        quantity: 1,
        discountPercent: 0,
        vatRate: 20,
      })
    );
    const totals = calculateProposalTotals(lines);
    expect(totals.grandTotal).toBeCloseTo(
      lines.reduce((sum, line) => sum + line.grossTotal, 0),
      2
    );
    expect(totals.oneTime.items).toHaveLength(1);
    expect(totals.weekly.items).toHaveLength(1);
    expect(totals.monthly.items).toHaveLength(1);
    expect(totals.quarterly.items).toHaveLength(1);
    expect(totals.annually.items).toHaveLength(1);
  });
});