import { describe, expect, it } from 'vitest';
import {
  ALL_BILLING_CADENCES,
  BILLING_CADENCE_OPTIONS,
  cadenceSwitchNeedsAmountCheck,
  convertPriceBetweenCadences,
  parseFrequencyOptions,
} from '../billingCadence';

describe('hourly billing cadence', () => {
  it('offers Hourly in the cadence list', () => {
    expect(ALL_BILLING_CADENCES).toContain('HOURLY');
    expect(BILLING_CADENCE_OPTIONS.find((option) => option.value === 'HOURLY')?.label).toBe(
      'Hourly'
    );
  });

  it('keeps the entered price when switching to or from hourly', () => {
    expect(convertPriceBetweenCadences(100, 'MONTHLY', 'HOURLY')).toBe(100);
    expect(convertPriceBetweenCadences(75, 'HOURLY', 'ANNUALLY')).toBe(75);
    expect(convertPriceBetweenCadences(75, 'HOURLY', 'HOURLY')).toBe(75);
    expect(convertPriceBetweenCadences(100, 'MONTHLY', 'ANNUALLY')).toBe(1200);
  });

  it('warns when a switch touches Hourly, because the amount is not converted', () => {
    expect(cadenceSwitchNeedsAmountCheck('MONTHLY', 'HOURLY')).toBe(true);
    expect(cadenceSwitchNeedsAmountCheck('HOURLY', 'ANNUALLY')).toBe(true);
    expect(cadenceSwitchNeedsAmountCheck('HOURLY', 'HOURLY')).toBe(false);
    expect(cadenceSwitchNeedsAmountCheck('MONTHLY', 'ANNUALLY')).toBe(false);
  });

  it('parses HOURLY from catalogue frequency options', () => {
    expect(parseFrequencyOptions('MONTHLY,HOURLY')).toEqual(['MONTHLY', 'HOURLY']);
  });
});
