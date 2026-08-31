import {
  buildWizardCatchUpPayload,
  collectWizardCatchUpLines,
  isRecurringWizardFrequency,
  previewCatchUpBase,
  previewCatchUpNet,
} from '../wizardCatchUp';

const bookkeeping = {
  serviceId: 'svc-bk',
  name: 'Bookkeeping',
  displayPrice: 85,
  billingFrequency: 'MONTHLY',
};

describe('wizardCatchUp', () => {
  it('treats one-off lines as ineligible', () => {
    expect(isRecurringWizardFrequency('ONE_TIME')).toBe(false);
    expect(isRecurringWizardFrequency('MONTHLY')).toBe(true);
    expect(previewCatchUpBase({ ...bookkeeping, billingFrequency: 'ONE_TIME' }, 3)).toBeNull();
  });

  it('prices months × monthly equivalent, then applies discount', () => {
    expect(previewCatchUpBase(bookkeeping, 6)).toBe(510);
    expect(previewCatchUpNet(bookkeeping, { months: 6, discountPercent: 10 })).toBe(459);
    expect(
      previewCatchUpBase({ ...bookkeeping, billingFrequency: 'QUARTERLY', displayPrice: 300 }, 3)
    ).toBe(300);
  });

  it('builds a ONE_TIME payload only when the draft is enabled', () => {
    expect(
      buildWizardCatchUpPayload(
        bookkeeping,
        { enabled: false, months: 3, discountPercent: 0 },
        '2026-08-30'
      )
    ).toBeNull();
    const line = buildWizardCatchUpPayload(
      bookkeeping,
      { enabled: true, months: 3, discountPercent: 0 },
      '2026-08-30'
    );
    expect(line?.billingFrequency).toBe('ONE_TIME');
    expect(line?.displayPrice).toBe(255);
    expect(line?.name).toContain('3 months');
    expect(line?.oneOffDueDate).toBe('2026-08-30');
  });

  it('collects only enabled catch-ups', () => {
    const lines = collectWizardCatchUpLines(
      [bookkeeping, { ...bookkeeping, serviceId: 'svc-vat', name: 'VAT' }],
      { 'svc-bk': { enabled: true, months: 2, discountPercent: 0 } },
      '2026-08-30'
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].serviceId).toBe('svc-bk');
  });
});
