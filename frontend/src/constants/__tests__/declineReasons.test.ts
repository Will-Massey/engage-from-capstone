import { describe, it, expect } from 'vitest';
import { DECLINE_REASONS, DECLINE_REASON_LABELS } from '../declineReasons';

describe('public signing decline reasons', () => {
  it('exposes a stable set of decline categories with labels', () => {
    expect(DECLINE_REASONS).toContain('PRICE');
    expect(DECLINE_REASONS).toContain('OTHER');
    for (const reason of DECLINE_REASONS) {
      expect(DECLINE_REASON_LABELS[reason]).toMatch(/\S/);
    }
  });

  it('requires free text when OTHER is selected (UI contract)', () => {
    const needsDetail = (reason: string, text: string) =>
      reason !== 'OTHER' || text.trim().length >= 3;

    expect(needsDetail('PRICE', '')).toBe(true);
    expect(needsDetail('OTHER', 'ab')).toBe(false);
    expect(needsDetail('OTHER', 'Found a cheaper quote')).toBe(true);
  });
});
