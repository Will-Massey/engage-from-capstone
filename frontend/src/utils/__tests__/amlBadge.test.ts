import { describe, expect, it } from 'vitest';
import {
  AML_STATUS_COLOURS,
  AML_STATUS_LABELS,
  amlStatusColour,
  amlStatusLabel,
  formatAmlCheckPrice,
} from '../amlBadge';

describe('amlStatusLabel', () => {
  it('maps known statuses to readable labels', () => {
    expect(amlStatusLabel('NOT_STARTED')).toBe('Not started');
    expect(amlStatusLabel('PENDING')).toBe('Pending');
    expect(amlStatusLabel('CLEAR')).toBe('Clear');
    expect(amlStatusLabel('REFER')).toBe('Refer');
    expect(amlStatusLabel('FAILED')).toBe('Failed');
  });

  it('echoes unknown statuses unchanged', () => {
    expect(amlStatusLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
  });

  it('covers every status that has a colour', () => {
    expect(Object.keys(AML_STATUS_LABELS).sort()).toEqual(Object.keys(AML_STATUS_COLOURS).sort());
  });
});

describe('amlStatusColour', () => {
  it('returns the mapped colour classes for known statuses', () => {
    expect(amlStatusColour('CLEAR')).toBe(AML_STATUS_COLOURS.CLEAR);
  });

  it('falls back to the NOT_STARTED style for unknown statuses', () => {
    expect(amlStatusColour('SOMETHING_NEW')).toBe(AML_STATUS_COLOURS.NOT_STARTED);
  });
});

describe('formatAmlCheckPrice', () => {
  it('formats pence as GBP', () => {
    expect(formatAmlCheckPrice(150)).toBe('£1.50');
    expect(formatAmlCheckPrice(999)).toBe('£9.99');
  });

  it('returns null when no price is configured', () => {
    expect(formatAmlCheckPrice(0)).toBeNull();
    expect(formatAmlCheckPrice(-5)).toBeNull();
    expect(formatAmlCheckPrice(null)).toBeNull();
    expect(formatAmlCheckPrice(undefined)).toBeNull();
    expect(formatAmlCheckPrice(Number.NaN)).toBeNull();
  });
});
