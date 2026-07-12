import {
  CLARA_REGULATORY_FAMILIES,
  DEFAULT_CLARA_SETTINGS,
  getClaraSettings,
} from '../tenantClaraSettings.js';

describe('getClaraSettings', () => {
  it('returns safe defaults for missing/empty/garbage settings JSON', () => {
    for (const raw of [undefined, null, '', '{}', 'not-json', '{"clara": 42}']) {
      const settings = getClaraSettings(raw as string | null | undefined);
      expect(settings).toEqual({
        agenticDraftingEnabled: false,
        draftRegulatoryFamilies: ['vat', 'mtd_itsa', 'filing_deadlines', 'payroll'],
        draftRenewals: true,
        renewalUpliftPercent: 0,
        useAiCoverLetter: true,
        draftOwnerUserId: undefined,
        maxDraftsPerRun: 10,
      });
    }
  });

  it('defaults to OFF — agentic drafting is explicit opt-in', () => {
    expect(DEFAULT_CLARA_SETTINGS.agenticDraftingEnabled).toBe(false);
    expect(getClaraSettings('{}').agenticDraftingEnabled).toBe(false);
  });

  it('applies stored overrides', () => {
    const json = JSON.stringify({
      clara: {
        agenticDraftingEnabled: true,
        draftRegulatoryFamilies: ['vat', 'payroll'],
        draftRenewals: false,
        renewalUpliftPercent: 5,
        useAiCoverLetter: false,
        draftOwnerUserId: 'user-1',
        maxDraftsPerRun: 3,
      },
    });

    expect(getClaraSettings(json)).toEqual({
      agenticDraftingEnabled: true,
      draftRegulatoryFamilies: ['vat', 'payroll'],
      draftRenewals: false,
      renewalUpliftPercent: 5,
      useAiCoverLetter: false,
      draftOwnerUserId: 'user-1',
      maxDraftsPerRun: 3,
    });
  });

  it('accepts a zero uplift and preserves negative uplifts', () => {
    expect(
      getClaraSettings(JSON.stringify({ clara: { renewalUpliftPercent: 0 } })).renewalUpliftPercent
    ).toBe(0);
    expect(
      getClaraSettings(JSON.stringify({ clara: { renewalUpliftPercent: -10 } }))
        .renewalUpliftPercent
    ).toBe(-10);
  });

  it('filters unknown families and de-duplicates, keeping an explicit empty list', () => {
    const filtered = getClaraSettings(
      JSON.stringify({ clara: { draftRegulatoryFamilies: ['vat', 'vat', 'bogus'] } })
    );
    expect(filtered.draftRegulatoryFamilies).toEqual(['vat']);

    const empty = getClaraSettings(JSON.stringify({ clara: { draftRegulatoryFamilies: [] } }));
    expect(empty.draftRegulatoryFamilies).toEqual([]);
  });

  it('rejects invalid scalar types back to defaults', () => {
    const settings = getClaraSettings(
      JSON.stringify({
        clara: {
          agenticDraftingEnabled: 'yes',
          renewalUpliftPercent: 'five',
          maxDraftsPerRun: 0,
          draftOwnerUserId: '   ',
        },
      })
    );
    expect(settings.agenticDraftingEnabled).toBe(false);
    expect(settings.renewalUpliftPercent).toBe(0);
    expect(settings.maxDraftsPerRun).toBe(10);
    expect(settings.draftOwnerUserId).toBeUndefined();
  });

  it('never shares the default families array between calls', () => {
    const a = getClaraSettings('{}');
    a.draftRegulatoryFamilies.pop();
    expect(getClaraSettings('{}').draftRegulatoryFamilies).toEqual(CLARA_REGULATORY_FAMILIES);
    expect(DEFAULT_CLARA_SETTINGS.draftRegulatoryFamilies).toHaveLength(4);
  });
});
