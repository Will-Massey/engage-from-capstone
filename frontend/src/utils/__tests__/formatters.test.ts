import { describe, it, expect } from 'vitest';
import { formatCurrency, formatDate } from '../formatters';

describe('formatCurrency', () => {
  it('formats GBP correctly', () => {
    expect(formatCurrency(100)).toBe('£100.00');
  });

  it('formats decimals correctly', () => {
    expect(formatCurrency(99.99)).toBe('£99.99');
  });

  it('formats zero correctly', () => {
    expect(formatCurrency(0)).toBe('£0.00');
  });

  it('formats negative amounts correctly', () => {
    expect(formatCurrency(-50)).toBe('-£50.00');
  });

  it('formats USD when specified', () => {
    expect(formatCurrency(100, 'USD')).toBe('US$100.00');
  });
});

describe('formatDate', () => {
  it('formats ISO date string to en-GB', () => {
    expect(formatDate('2026-05-15')).toBe('15 May 2026');
  });

  it('formats datetime string to en-GB', () => {
    expect(formatDate('2026-01-01T00:00:00.000Z')).toBe('1 January 2026');
  });
});
