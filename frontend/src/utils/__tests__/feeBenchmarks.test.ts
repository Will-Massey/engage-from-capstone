import { describe, expect, it } from 'vitest';
import {
  getTurnoverBand,
  lineMonthlyEquivalent,
  pickBenchmarkCell,
  vsMedianHint,
} from '../feeBenchmarks';

describe('getTurnoverBand', () => {
  it('mirrors the backend thresholds', () => {
    expect(getTurnoverBand(10_000)).toBe('MICRO');
    expect(getTurnoverBand(49_999)).toBe('MICRO');
    expect(getTurnoverBand(50_000)).toBe('SMALL');
    expect(getTurnoverBand(199_999)).toBe('SMALL');
    expect(getTurnoverBand(200_000)).toBe('MEDIUM');
    expect(getTurnoverBand(999_999)).toBe('MEDIUM');
    expect(getTurnoverBand(1_000_000)).toBe('LARGE');
  });

  it('maps missing or unusable turnover to UNKNOWN', () => {
    expect(getTurnoverBand(null)).toBe('UNKNOWN');
    expect(getTurnoverBand(undefined)).toBe('UNKNOWN');
    expect(getTurnoverBand(0)).toBe('UNKNOWN');
    expect(getTurnoverBand(-5)).toBe('UNKNOWN');
  });
});

describe('lineMonthlyEquivalent', () => {
  it('normalises billing cycles to monthly', () => {
    expect(lineMonthlyEquivalent(100, 'MONTHLY')).toBe(100);
    expect(lineMonthlyEquivalent(300, 'QUARTERLY')).toBe(100);
    expect(lineMonthlyEquivalent(1200, 'ANNUALLY')).toBe(100);
  });

  it('amortises one-off fees over a year', () => {
    expect(lineMonthlyEquivalent(1200, 'ONE_TIME')).toBe(100);
  });
});

describe('pickBenchmarkCell', () => {
  const data = {
    benchmarks: [{ category: 'COMPLIANCE', p50: 100 }],
    bandsByTurnover: [
      { category: 'COMPLIANCE', turnoverBand: 'SMALL' as const, p50: 80 },
      { category: 'COMPLIANCE', turnoverBand: 'LARGE' as const, p50: 150 },
    ],
  };

  it('prefers the matching (category, band) cell', () => {
    expect(pickBenchmarkCell(data, 'COMPLIANCE', 'SMALL')?.p50).toBe(80);
  });

  it('falls back to the category band when the cell is missing', () => {
    expect(pickBenchmarkCell(data, 'COMPLIANCE', 'MEDIUM')?.p50).toBe(100);
    expect(pickBenchmarkCell(data, 'COMPLIANCE')?.p50).toBe(100);
  });

  it('returns null when the category has no band', () => {
    expect(pickBenchmarkCell(data, 'TAX', 'SMALL')).toBeNull();
  });
});

describe('vsMedianHint', () => {
  it('formats above and below median', () => {
    expect(vsMedianHint(112, 100)).toBe('vs market median: +12%');
    expect(vsMedianHint(92, 100)).toBe('vs market median: −8%');
  });

  it('treats within ±2% as at median', () => {
    expect(vsMedianHint(100, 100)).toBe('vs market median: at median');
    expect(vsMedianHint(102, 100)).toBe('vs market median: at median');
    expect(vsMedianHint(98, 100)).toBe('vs market median: at median');
  });

  it('returns null for unusable values', () => {
    expect(vsMedianHint(0, 100)).toBeNull();
    expect(vsMedianHint(100, 0)).toBeNull();
  });
});
