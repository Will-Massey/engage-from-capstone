import {
  suggestFees,
  resolveCatalogServices,
  type PricingMethodologyInput,
} from '../pricingMethodology.js';

const ltd250kPayroll: PricingMethodologyInput = {
  turnoverBand: 'BAND_250K_500K',
  entityType: 'LIMITED_COMPANY',
  employeeCount: 5,
  vatRegistered: true,
  mtdStatus: 'NOT_APPLICABLE',
  complexity: {
    hasPayroll: true,
    hasRd: false,
    multiSite: false,
  },
};

describe('pricingMethodology', () => {
  it('selects core Ltd compliance services plus VAT and payroll', () => {
    const services = resolveCatalogServices(ltd250kPayroll);
    const names = services.map((s) => s.name);

    expect(names).toContain('Statutory Annual Accounts');
    expect(names).toContain('CT600 Corporation Tax Return');
    expect(names).toContain('Confirmation Statement (CS01)');
    expect(names).toContain('VAT Return Preparation');
    expect(names).toContain('Monthly Payroll Processing');
  });

  it('calculates £250k Ltd with payroll — example output', () => {
    const result = suggestFees(ltd250kPayroll);

    const accounts = result.services.find((s) => s.catalogName === 'Statutory Annual Accounts');
    const ct600 = result.services.find((s) => s.catalogName === 'CT600 Corporation Tax Return');
    const payroll = result.services.find((s) => s.catalogName === 'Monthly Payroll Processing');
    const vat = result.services.find((s) => s.catalogName === 'VAT Return Preparation');

    expect(accounts).toBeDefined();
    expect(accounts!.suggestedPrice).toBe(72);
    expect(accounts!.feeLow).toBe(65);
    expect(accounts!.feeHigh).toBe(79);

    expect(ct600).toBeDefined();
    expect(ct600!.suggestedPrice).toBe(58);

    expect(payroll).toBeDefined();
    expect(payroll!.suggestedPrice).toBe(57);

    expect(vat).toBeDefined();
    expect(vat!.suggestedPrice).toBe(77);

    expect(result.totals.monthlySuggested).toBeGreaterThan(200);
    expect(result.totals.currency).toBe('GBP');
    expect(result.byCategory.length).toBeGreaterThan(0);
  });

  it('adds R&D service when complexity flag set', () => {
    const withRd = suggestFees({
      ...ltd250kPayroll,
      complexity: { ...ltd250kPayroll.complexity, hasRd: true },
    });
    expect(withRd.services.some((s) => s.catalogName === 'R&D Tax Credit Claim')).toBe(true);
  });

  it('applies multi-site uplift', () => {
    const base = suggestFees(ltd250kPayroll);
    const multi = suggestFees({
      ...ltd250kPayroll,
      complexity: { ...ltd250kPayroll.complexity, multiSite: true },
    });

    const baseAccounts = base.services.find((s) => s.catalogName === 'Statutory Annual Accounts');
    const multiAccounts = multi.services.find((s) => s.catalogName === 'Statutory Annual Accounts');
    expect(multiAccounts!.suggestedPrice).toBeGreaterThan(baseAccounts!.suggestedPrice);
  });
});