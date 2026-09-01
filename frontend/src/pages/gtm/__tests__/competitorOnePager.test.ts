import { ENGAGE_TIERS } from '../packagingValue';
import {
  formatCompetitorOnePager,
  formatEngageLadder,
  ONE_PAGER_HEADLINE,
} from '../competitorOnePager';

describe('formatCompetitorOnePager', () => {
  const text = formatCompetitorOnePager();

  it('opens with the leave-behind headline', () => {
    expect(text.startsWith(ONE_PAGER_HEADLINE)).toBe(true);
  });

  it('names the live ladder and refuses a £9 race', () => {
    expect(formatEngageLadder()).toBe(
      ENGAGE_TIERS.map((tier) => `£${tier.monthly} ${tier.name}`).join(' · ')
    );
    expect(text).toContain('£49 Starter');
    expect(text).toContain('£99 Professional');
    expect(text).toContain('£249 Enterprise');
    expect(text).toContain('Do not race to £9/client');
  });

  it('stays honest about Clara, TaxCalc, BACS, and trust', () => {
    expect(text).toMatch(/Clara drafts, never sends/i);
    expect(text).toContain('TaxCalc is not an Engage integration');
    expect(text).toContain('BACS Direct Debit is coming soon');
    expect(text).toContain('do not claim Cyber Essentials certified');
    expect(text).toContain('UK-only hosting');
    expect(text).not.toMatch(/CE certified/i);
    expect(text).not.toMatch(/UK-only hosting we have/i);
  });
});
