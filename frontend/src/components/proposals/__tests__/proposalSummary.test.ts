import { describe, expect, it } from 'vitest';
import { calculateLineItem, calculateProposalTotals } from '@shared/pricingEngine';
import {
  calculateProposalSummaryFromInputs,
  calculateProposalSummaryBands,
} from '@shared/proposalSummary';
import { resolveCatalogBillingCycle } from '@shared/serviceBilling';

describe('proposal summary bands', () => {
  it('matches API grand totals for mixed billing cycles', () => {
    const inputs = [
      {
        basePrice: 100,
        billingFrequency: 'MONTHLY' as const,
        quantity: 1,
        discountPercent: 10,
        vatRate: 20,
      },
      {
        basePrice: 850,
        billingFrequency: 'ANNUALLY' as const,
        quantity: 1,
        discountPercent: 0,
        vatRate: 20,
      },
      {
        basePrice: 500,
        billingFrequency: 'ONE_TIME' as const,
        quantity: 1,
        discountPercent: 0,
        vatRate: 20,
      },
    ];

    const lineResults = inputs.map((input) => calculateLineItem(input));
    const apiTotals = calculateProposalTotals(lineResults);
    const summary = calculateProposalSummaryFromInputs(inputs);

    expect(summary.monthly.total).toBe(apiTotals.monthly.total);
    expect(summary.annually.total).toBe(apiTotals.annually.total);
    expect(summary.oneTime.total).toBe(apiTotals.oneTime.total);
    expect(summary.contractTotalIncVat).toBe(apiTotals.grandTotal);
    expect(summary.totalSubtotalExVat).toBe(
      apiTotals.monthly.subtotal +
        apiTotals.annually.subtotal +
        apiTotals.oneTime.subtotal
    );
    expect(summary.totalVat).toBe(
      apiTotals.monthly.vatAmount + apiTotals.annually.vatAmount + apiTotals.oneTime.vatAmount
    );
  });

  it('groups discounted lines into the correct investment bands', () => {
    const summary = calculateProposalSummaryBands([
      {
        billingFrequency: 'QUARTERLY',
        lineTotal: 270,
        vatAmount: 54,
        grossTotal: 324,
      },
      {
        billingFrequency: 'WEEKLY',
        lineTotal: 40,
        vatAmount: 8,
        grossTotal: 48,
      },
    ]);

    expect(summary.quarterly).toMatchObject({ subtotal: 270, vat: 54, total: 324, count: 1 });
    expect(summary.weekly).toMatchObject({ subtotal: 40, vat: 8, total: 48, count: 1 });
    expect(summary.contractTotalIncVat).toBe(372);
    expect(summary.monthly.count).toBe(0);
  });
});

describe('resolveCatalogBillingCycle', () => {
  it('detects ONE_TIME when legacy migration left billingCycle as MONTHLY', () => {
    expect(
      resolveCatalogBillingCycle({
        billingCycle: 'MONTHLY',
        defaultFrequency: 'MONTHLY',
        priceDisplayMode: 'ONE_TIME',
      })
    ).toBe('ONE_TIME');
  });

  it('prefers explicit ONE_TIME billing cycle', () => {
    expect(
      resolveCatalogBillingCycle({
        billingCycle: 'ONE_TIME',
        defaultFrequency: 'MONTHLY',
        priceDisplayMode: 'PER_MONTH',
      })
    ).toBe('ONE_TIME');
  });
});