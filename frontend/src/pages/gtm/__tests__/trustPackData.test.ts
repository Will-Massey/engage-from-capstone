import { buildDiligenceSummary, CE_CONTROLS, countCeRemaining } from '../trustPackData';

describe('trust pack CE prep', () => {
  it('covers the five Cyber Essentials technical controls and does not claim a certificate', () => {
    expect(CE_CONTROLS).toHaveLength(5);
    expect(CE_CONTROLS.map((c) => c.title)).toEqual([
      'Firewalls',
      'Secure configuration',
      'Security update management',
      'User access control',
      'Malware protection',
    ]);
    const remaining = countCeRemaining();
    expect(remaining).toBeGreaterThan(0);
    const summary = buildDiligenceSummary();
    expect(summary).toContain('not a certificate');
    expect(summary).toContain('do not claim UK-only');
    expect(summary).toContain(`${remaining} of the five`);
  });
});
