import { comparePackaging, formatPackagingPitch, recommendEngageTier } from '../packagingValue';

describe('recommendEngageTier', () => {
  it('keeps a small book on Starter and a growing book on Professional', () => {
    expect(recommendEngageTier({ clients: 40, users: 2 }).tier.id).toBe('STARTER');
    expect(recommendEngageTier({ clients: 80, users: 2 }).tier.id).toBe('PROFESSIONAL');
    expect(recommendEngageTier({ clients: 20, users: 6 }).tier.id).toBe('PROFESSIONAL');
    expect(recommendEngageTier({ clients: 300, users: 4 }).tier.id).toBe('ENTERPRISE');
    expect(recommendEngageTier({ clients: 10, users: 12 }).tier.id).toBe('ENTERPRISE');
  });
});

describe('comparePackaging', () => {
  it('shows Engage cheaper on sticker at 120 clients without matching £9', () => {
    const cmp = comparePackaging({ clients: 120, users: 6 });
    expect(cmp.recommended.id).toBe('PROFESSIONAL');
    expect(cmp.engagerMonthly).toBe(1080);
    expect(cmp.engageMonthly).toBe(99);
    expect(cmp.engageCheaperOnSticker).toBe(true);
    expect(cmp.engagePerClient).toBe(0.83);
  });
});

describe('formatPackagingPitch', () => {
  it('refuses a race to the bottom', () => {
    const comparison = comparePackaging({ clients: 40, users: 2 });
    const pitch = formatPackagingPitch({ clients: 40, users: 2, comparison });
    expect(pitch).toContain('Starter');
    expect(pitch).toContain('do not race to £8/client');
    expect(pitch).not.toMatch(/£8\/client\/mo/);
  });
});
