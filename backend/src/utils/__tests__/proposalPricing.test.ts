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