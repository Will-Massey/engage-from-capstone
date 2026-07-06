import {
  annualEquivalentFor,
  calculateLineItem,
  monthlyEquivalentFor,
  roundMoney,
  vatAmountFor,
} from '../pricingEngine';

describe('roundMoney', () => {
  it('rounds to whole pence', () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(10.004)).toBe(10.0);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });
});

describe('vatAmountFor', () => {
  it('defaults to 20% and rounds to pence', () => {
    expect(vatAmountFor(100)).toBe(20);
    expect(vatAmountFor(85)).toBe(17);
    expect(vatAmountFor(33.33)).toBe(6.67);
  });

  it('supports reduced and zero rates', () => {
    expect(vatAmountFor(100, 5)).toBe(5);
    expect(vatAmountFor(100, 0)).toBe(0);
  });

  it('matches calculateLineItem VAT exactly', () => {
    const line = calculateLineItem({
      basePrice: 123.45,
      billingFrequency: 'MONTHLY',
      quantity: 3,
      discountPercent: 7.5,
    });
    expect(line.vatAmount).toBe(vatAmountFor(line.netTotal));
  });
});

describe('annualEquivalentFor', () => {
  it('converts each recurring frequency', () => {
    expect(annualEquivalentFor(10, 'WEEKLY')).toBe(520);
    expect(annualEquivalentFor(100, 'MONTHLY')).toBe(1200);
    expect(annualEquivalentFor(300, 'QUARTERLY')).toBe(1200);
    expect(annualEquivalentFor(1200, 'ANNUALLY')).toBe(1200);
  });

  it('excludes ONE_TIME by default, amortises on request', () => {
    expect(annualEquivalentFor(500, 'ONE_TIME')).toBe(0);
    expect(annualEquivalentFor(500, 'ONE_TIME', { oneTime: 'amortised' })).toBe(500);
  });

  it('treats unknown frequencies as MONTHLY (engine historical default)', () => {
    expect(annualEquivalentFor(100, 'FORTNIGHTLY')).toBe(1200);
    expect(annualEquivalentFor(100, '')).toBe(1200);
  });

  it('matches calculateLineItem annualEquivalent for every frequency', () => {
    for (const f of ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY', 'ONE_TIME'] as const) {
      const line = calculateLineItem({ basePrice: 250, billingFrequency: f });
      expect(line.annualEquivalent).toBe(annualEquivalentFor(250, f));
    }
  });
});

describe('monthlyEquivalentFor', () => {
  it('is annual / 12 for every frequency', () => {
    expect(monthlyEquivalentFor(100, 'MONTHLY')).toBe(100);
    expect(monthlyEquivalentFor(300, 'QUARTERLY')).toBe(100);
    expect(monthlyEquivalentFor(1200, 'ANNUALLY')).toBe(100);
    expect(monthlyEquivalentFor(12, 'WEEKLY')).toBe(52);
    expect(monthlyEquivalentFor(600, 'ONE_TIME')).toBe(0);
    expect(monthlyEquivalentFor(600, 'ONE_TIME', { oneTime: 'amortised' })).toBe(50);
  });
});
