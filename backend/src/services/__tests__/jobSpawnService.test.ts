/**
 * Unit tests for job phase template resolution (no DB).
 */
import {
  inferCategoryFromServiceName,
  resolveCategoryTemplate,
} from '../jobPhaseTemplates.js';

describe('jobPhaseTemplates', () => {
  it('resolves COMPLIANCE template with filing phase', () => {
    const t = resolveCategoryTemplate('COMPLIANCE');
    expect(t.phases.some((p) => p.name.toLowerCase().includes('filing'))).toBe(true);
    expect(t.phases[0].checklist.length).toBeGreaterThan(0);
  });

  it('falls back to GENERIC for unknown category', () => {
    const t = resolveCategoryTemplate('NOT_A_REAL_CATEGORY');
    expect(t.category).toBe('GENERIC');
  });

  it('infers categories from service names', () => {
    expect(inferCategoryFromServiceName('Statutory Annual Accounts')).toBe('COMPLIANCE');
    expect(inferCategoryFromServiceName('Full Bookkeeping Service')).toBe('BOOKKEEPING');
    expect(inferCategoryFromServiceName('MTD ITSA Quarterly')).toBe('MTD_ITSA');
    expect(inferCategoryFromServiceName('New client onboarding')).toBe('ONBOARDING');
  });
});
