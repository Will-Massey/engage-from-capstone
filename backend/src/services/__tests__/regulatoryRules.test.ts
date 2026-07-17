import { CompanyType, MTDITSAStatus } from '@prisma/client';
import {
  checkRegulatoryRules,
  evaluateClientRules,
  hasAccountsCoverage,
  hasConfirmationStatementCoverage,
  hasPayrollCoverage,
  hasVatReturnCoverage,
  MTD_ITSA_THRESHOLD_2026,
  MTD_ITSA_THRESHOLD_2027,
  VAT_REGISTRATION_THRESHOLD,
  type ClientRuleInput,
  type EngagedService,
} from '../regulatoryRules.js';
import {
  DEFAULT_REGULATORY_SETTINGS,
  getRegulatorySettings,
  type RegulatorySettings,
} from '../../utils/tenantRegulatorySettings.js';

const NOW = new Date('2026-07-12T12:00:00.000Z');

function settings(overrides: Partial<RegulatorySettings> = {}): RegulatorySettings {
  return { ...DEFAULT_REGULATORY_SETTINGS, ...overrides };
}

function client(overrides: Partial<ClientRuleInput> = {}): ClientRuleInput {
  return { companyType: CompanyType.LIMITED_COMPANY, vatRegistered: false, ...overrides };
}

function daysFromNow(days: number): Date {
  return new Date(NOW.getTime() + days * 86_400_000);
}

function ruleIds(
  input: ClientRuleInput,
  engaged: EngagedService[] = [],
  s: RegulatorySettings = settings()
): string[] {
  return evaluateClientRules(input, engaged, s, NOW).map((r) => r.id);
}

describe('vat family', () => {
  it('fires vat-registration-required exactly at the threshold', () => {
    const ids = ruleIds(client({ turnover: VAT_REGISTRATION_THRESHOLD }));
    expect(ids).toContain('vat-registration-required');
    expect(ids).not.toContain('vat-registration-approaching');
  });

  it('fires vat-registration-approaching at 85% of threshold', () => {
    const ids = ruleIds(client({ turnover: VAT_REGISTRATION_THRESHOLD * 0.85 }));
    expect(ids).toContain('vat-registration-approaching');
    expect(ids).not.toContain('vat-registration-required');
  });

  it('does not fire below 85% of threshold', () => {
    expect(ruleIds(client({ turnover: 76_499 }))).toEqual([]);
  });

  it('is suppressed when the client is already VAT registered', () => {
    const ids = ruleIds(client({ vatRegistered: true, turnover: 120_000 }));
    expect(ids).not.toContain('vat-registration-required');
    expect(ids).not.toContain('vat-registration-approaching');
  });

  it('suggests deregistration review when registered and well below threshold', () => {
    const rules = evaluateClientRules(
      client({ vatRegistered: true, turnover: 30_000 }),
      [],
      settings(),
      NOW
    );
    expect(rules.map((r) => r.id)).toContain('vat-deregistration-review');
    expect(rules.find((r) => r.id === 'vat-deregistration-review')?.severity).toBe('info');
  });

  it('respects a per-tenant vatThreshold override', () => {
    const s = settings({ vatThreshold: 100_000 });
    expect(ruleIds(client({ turnover: 95_000 }), [], s)).toContain('vat-registration-approaching');
    expect(ruleIds(client({ turnover: 100_000 }), [], s)).toContain('vat-registration-required');
  });

  it('fires nothing when the vat family is disabled', () => {
    const s = settings({ vatEnabled: false });
    expect(ruleIds(client({ turnover: 200_000 }), [], s)).toEqual([]);
  });
});

describe('mtd_itsa family', () => {
  const soleTrader = (income: number) =>
    client({ companyType: CompanyType.SOLE_TRADER, turnover: income });

  it('fires the 2026 wave exactly at £50k with action_required severity', () => {
    const rules = evaluateClientRules(soleTrader(MTD_ITSA_THRESHOLD_2026), [], settings(), NOW);
    const rule = rules.find((r) => r.id === 'mtd-itsa-2026-mandatory');
    expect(rule?.severity).toBe('action_required');
    expect(rule?.family).toBe('mtd_itsa');
  });

  it('fires the 2027 wave exactly at £30k', () => {
    const ids = ruleIds(soleTrader(MTD_ITSA_THRESHOLD_2027));
    expect(ids).toContain('mtd-itsa-2027-mandatory');
    expect(ids).not.toContain('mtd-itsa-2026-mandatory');
  });

  it('fires the approaching rule at 80% of the £30k threshold and not below', () => {
    expect(ruleIds(soleTrader(24_000))).toContain('mtd-itsa-approaching-2027');
    expect(ruleIds(soleTrader(23_999))).not.toContain('mtd-itsa-approaching-2027');
  });

  it('prefers mtditsaIncome over turnover as the income basis', () => {
    const ids = ruleIds(
      client({ companyType: CompanyType.SOLE_TRADER, turnover: 10_000, mtditsaIncome: 55_000 })
    );
    expect(ids).toContain('mtd-itsa-2026-mandatory');
  });

  it.each([
    CompanyType.LIMITED_COMPANY,
    CompanyType.LLP,
    CompanyType.CHARITY,
    CompanyType.NON_PROFIT,
  ])('does not apply MTD ITSA to %s', (companyType) => {
    const ids = ruleIds(
      client({ companyType, turnover: 80_000, mtditsaStatus: MTDITSAStatus.REQUIRED_2026 })
    );
    expect(ids.filter((id) => id.startsWith('mtd-itsa'))).toEqual([]);
  });

  it('applies to partnerships', () => {
    expect(ruleIds(client({ companyType: CompanyType.PARTNERSHIP, turnover: 60_000 }))).toContain(
      'mtd-itsa-2026-mandatory'
    );
  });

  it('flags a REQUIRED_2026 client record status', () => {
    const ids = ruleIds(
      client({
        companyType: CompanyType.SOLE_TRADER,
        turnover: 10_000,
        mtditsaStatus: MTDITSAStatus.REQUIRED_2026,
      })
    );
    expect(ids).toContain('mtd-itsa-status-flagged');
  });

  it('respects per-tenant wave threshold overrides', () => {
    const s = settings({ mtdItsaThreshold2026: 40_000, mtdItsaThreshold2027: 20_000 });
    expect(ruleIds(soleTrader(40_000), [], s)).toContain('mtd-itsa-2026-mandatory');
    expect(ruleIds(soleTrader(20_000), [], s)).toContain('mtd-itsa-2027-mandatory');
  });

  it('fires nothing when the mtd_itsa family is disabled', () => {
    const s = settings({ mtdItsaEnabled: false });
    expect(ruleIds(soleTrader(60_000), [], s).filter((id) => id.startsWith('mtd'))).toEqual([]);
  });
});

describe('filing_deadlines family', () => {
  it('fires filing-confirmation-statement-gap when due within the window and uncovered', () => {
    const rules = evaluateClientRules(
      client({ nextConfirmationStatementDue: daysFromNow(30) }),
      [],
      settings(),
      NOW
    );
    const rule = rules.find((r) => r.id === 'filing-confirmation-statement-gap');
    expect(rule?.severity).toBe('warning');
    expect(rule?.family).toBe('filing_deadlines');
  });

  it('fires exactly at the window edge and not beyond it', () => {
    expect(ruleIds(client({ nextConfirmationStatementDue: daysFromNow(60) }))).toContain(
      'filing-confirmation-statement-gap'
    );
    expect(ruleIds(client({ nextConfirmationStatementDue: daysFromNow(61) }))).not.toContain(
      'filing-confirmation-statement-gap'
    );
  });

  it('still fires for overdue deadlines', () => {
    expect(ruleIds(client({ nextAccountsDueDate: daysFromNow(-5) }))).toContain(
      'filing-accounts-gap'
    );
  });

  it('is silenced by a covering engaged service (name match)', () => {
    expect(
      ruleIds(client({ nextConfirmationStatementDue: daysFromNow(30) }), [
        { name: 'Company Secretarial Services' },
      ])
    ).not.toContain('filing-confirmation-statement-gap');

    expect(
      ruleIds(client({ nextAccountsDueDate: daysFromNow(30) }), [
        { name: 'Statutory Accounts Preparation' },
      ])
    ).not.toContain('filing-accounts-gap');
  });

  it('fires filing-accounts-gap with action_required severity when uncovered', () => {
    const rules = evaluateClientRules(
      client({ nextAccountsDueDate: daysFromNow(30) }),
      [{ name: 'Bookkeeping' }],
      settings(),
      NOW
    );
    expect(rules.find((r) => r.id === 'filing-accounts-gap')?.severity).toBe('action_required');
  });

  it('fires filing-vat-return-gap only for VAT-registered clients', () => {
    expect(
      ruleIds(client({ vatRegistered: true, nextVatDueDate: daysFromNow(20), turnover: 100_000 }))
    ).toContain('filing-vat-return-gap');
    expect(
      ruleIds(client({ vatRegistered: false, nextVatDueDate: daysFromNow(20) }))
    ).not.toContain('filing-vat-return-gap');
  });

  it('is silenced by a VAT service line', () => {
    expect(
      ruleIds(client({ vatRegistered: true, nextVatDueDate: daysFromNow(20), turnover: 100_000 }), [
        { name: 'Quarterly VAT Returns' },
      ])
    ).not.toContain('filing-vat-return-gap');
  });

  it('respects a shorter deadlineWindowDays override', () => {
    const s = settings({ deadlineWindowDays: 30 });
    expect(ruleIds(client({ nextAccountsDueDate: daysFromNow(45) }), [], s)).not.toContain(
      'filing-accounts-gap'
    );
  });

  it('fires nothing when the filing_deadlines family is disabled', () => {
    const s = settings({ filingDeadlinesEnabled: false });
    expect(
      ruleIds(
        client({
          nextAccountsDueDate: daysFromNow(10),
          nextConfirmationStatementDue: daysFromNow(10),
        }),
        [],
        s
      )
    ).toEqual([]);
  });
});

describe('payroll family', () => {
  it('fires payroll-no-service-gap when staff exist and no payroll service is engaged', () => {
    const rules = evaluateClientRules(client({ employeeCount: 3 }), [], settings(), NOW);
    const rule = rules.find((r) => r.id === 'payroll-no-service-gap');
    expect(rule?.severity).toBe('warning');
    expect(rule?.description).toMatch(/auto-enrolment/i);
  });

  it('does not fire with zero or unknown employee count', () => {
    expect(ruleIds(client({ employeeCount: 0 }))).toEqual([]);
    expect(ruleIds(client({ employeeCount: null }))).toEqual([]);
    expect(ruleIds(client({}))).toEqual([]);
  });

  it('is silenced by an engaged payroll service (category or name)', () => {
    expect(
      ruleIds(client({ employeeCount: 2 }), [{ name: 'Team admin', category: 'PAYROLL' }])
    ).toEqual([]);
    expect(ruleIds(client({ employeeCount: 2 }), [{ name: 'Monthly Payroll' }])).toEqual([]);
    expect(ruleIds(client({ employeeCount: 2 }), [{ name: 'PAYE compliance' }])).toEqual([]);
  });

  it('fires nothing when the payroll family is disabled', () => {
    expect(ruleIds(client({ employeeCount: 5 }), [], settings({ payrollEnabled: false }))).toEqual(
      []
    );
  });
});

describe('coverage matchers', () => {
  it('matches accounts coverage via COMPLIANCE category + accounts name', () => {
    expect(hasAccountsCoverage([{ name: 'Accounts', category: 'COMPLIANCE' }])).toBe(true);
    expect(hasAccountsCoverage([{ name: 'Accounts', category: 'ADVISORY' }])).toBe(false);
    expect(hasAccountsCoverage([{ name: 'Year-end accounts' }])).toBe(true);
  });

  it('does not treat unrelated services as coverage', () => {
    const unrelated = [{ name: 'Business Advisory' }, { name: 'Tax Planning' }];
    expect(hasAccountsCoverage(unrelated)).toBe(false);
    expect(hasConfirmationStatementCoverage(unrelated)).toBe(false);
    expect(hasVatReturnCoverage(unrelated)).toBe(false);
    expect(hasPayrollCoverage(unrelated)).toBe(false);
  });

  it('requires a word-boundary VAT match', () => {
    expect(hasVatReturnCoverage([{ name: 'Elevator maintenance' }])).toBe(false);
    expect(hasVatReturnCoverage([{ name: 'VAT compliance' }])).toBe(true);
  });
});

describe('checkRegulatoryRules (W3.5 backward-compatible contract)', () => {
  it('keeps existing rule ids and summary shape', () => {
    const result = checkRegulatoryRules('client-1', {
      companyType: CompanyType.SOLE_TRADER,
      turnover: 120_000,
      vatRegistered: false,
    });
    expect(result.clientId).toBe('client-1');
    expect(result.incomeUsed).toBe(120_000);
    expect(result.rules.map((r) => r.id)).toEqual([
      'mtd-itsa-2026-mandatory',
      'vat-registration-required',
    ]);
    expect(result.summary).toEqual({ actionRequired: 2, warnings: 0, info: 0 });
    // R5.2 additive field
    expect(result.rules.every((r) => typeof r.family === 'string')).toBe(true);
  });

  it('never fires filing or payroll rules (check input carries no deadline/staff data)', () => {
    const result = checkRegulatoryRules('client-2', {
      companyType: CompanyType.LIMITED_COMPANY,
      turnover: 20_000,
      vatRegistered: false,
    });
    expect(result.rules).toEqual([]);
  });
});

describe('getRegulatorySettings', () => {
  it('returns defaults for empty/invalid settings JSON', () => {
    expect(getRegulatorySettings(null)).toEqual(DEFAULT_REGULATORY_SETTINGS);
    expect(getRegulatorySettings('not json')).toEqual(DEFAULT_REGULATORY_SETTINGS);
    expect(getRegulatorySettings('{}')).toEqual(DEFAULT_REGULATORY_SETTINGS);
  });

  it('reads overrides from the regulatory namespace and ignores junk values', () => {
    const parsed = getRegulatorySettings(
      JSON.stringify({
        regulatory: {
          vatEnabled: false,
          vatThreshold: 100_000,
          deadlineWindowDays: -5,
          mtdItsaThreshold2026: 'high',
        },
      })
    );
    expect(parsed.vatEnabled).toBe(false);
    expect(parsed.vatThreshold).toBe(100_000);
    expect(parsed.deadlineWindowDays).toBe(DEFAULT_REGULATORY_SETTINGS.deadlineWindowDays);
    expect(parsed.mtdItsaThreshold2026).toBe(DEFAULT_REGULATORY_SETTINGS.mtdItsaThreshold2026);
  });
});
