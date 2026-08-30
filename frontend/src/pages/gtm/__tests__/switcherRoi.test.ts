import { calculateSwitcherRoi, formatSwitcherRoiSummary } from '../switcherRoi';

describe('calculateSwitcherRoi', () => {
  it('values time plus Engager-class seats minus the Engage plan', () => {
    const roi = calculateSwitcherRoi({
      clients: 100,
      hoursPerMonth: 10,
      hourlyRate: 80,
      engagerPerClient: 9,
      engageMonthly: 149,
    });
    expect(roi.timeValue).toBe(800);
    expect(roi.engagerCost).toBe(900);
    expect(roi.netVsEngager).toBe(1551);
    expect(roi.annual).toBe(18612);
    expect(Number(roi.paybackWeeks)).toBeGreaterThan(0);
  });

  it('does not invent a payback when no time is saved', () => {
    expect(
      calculateSwitcherRoi({
        clients: 10,
        hoursPerMonth: 0,
        hourlyRate: 85,
        engagerPerClient: 9,
        engageMonthly: 149,
      }).paybackWeeks
    ).toBe('—');
  });
});

describe('formatSwitcherRoiSummary', () => {
  it('names the client count and net advantage', () => {
    const input = {
      clients: 120,
      hoursPerMonth: 18,
      hourlyRate: 85,
      engagerPerClient: 9,
      engageMonthly: 149,
    };
    const text = formatSwitcherRoiSummary(input, calculateSwitcherRoi(input));
    expect(text).toContain('120 clients');
    expect(text).toContain('Net advantage');
    expect(text).toContain('Not a quote');
  });
});
