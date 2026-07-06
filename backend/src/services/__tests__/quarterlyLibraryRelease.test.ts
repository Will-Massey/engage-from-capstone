import { describe, expect, it } from '@jest/globals';
import {
  getNextQuarterlyReviewDate,
  getQuarterlyVersionLabel,
  isQuarterlyReviewDay,
  VERSION_LABEL_PATTERN,
} from '../engagementLibraryVersionService.js';

describe('quarterlyLibraryRelease helpers', () => {
  it('builds quarterly version labels', () => {
    expect(getQuarterlyVersionLabel(new Date('2026-07-02'))).toBe('2026.Q3');
    expect(getQuarterlyVersionLabel(new Date('2026-01-15'))).toBe('2026.Q1');
  });

  it('detects quarterly review days', () => {
    expect(isQuarterlyReviewDay(new Date('2026-04-01'))).toBe(true);
    expect(isQuarterlyReviewDay(new Date('2026-04-02'))).toBe(false);
  });

  it('computes next quarterly review after mid-quarter', () => {
    const next = getNextQuarterlyReviewDate(new Date('2026-07-02'));
    expect(next.getMonth()).toBe(9); // October
    expect(next.getDate()).toBe(1);
  });

  it('accepts quarterly and point version labels', () => {
    expect(VERSION_LABEL_PATTERN.test('2026.Q3')).toBe(true);
    expect(VERSION_LABEL_PATTERN.test('2026.2')).toBe(true);
    expect(VERSION_LABEL_PATTERN.test('2026-Q3')).toBe(false);
  });
});
