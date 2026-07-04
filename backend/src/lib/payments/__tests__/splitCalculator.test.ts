import {
  buildFeePreview,
  calculateSplit,
  estimateProcessorCost,
  estimateProcessorMarkup,
  resolvePlatformFeeBps,
} from '../splitCalculator.js';

describe('splitCalculator', () => {
  it('calculates platform fee and net payout', () => {
    const result = calculateSplit({
      grossPence: 10000,
      platformFeeBps: 250,
      processorFeePence: 150,
      processorMarkupPence: 50,
    });

    expect(result.platformFeePence).toBe(250);
    expect(result.agencySharePence).toBe(9550);
    expect(result.engageRevenuePence).toBe(300);
  });

  it('throws when net payout is negative', () => {
    expect(() =>
      calculateSplit({
        grossPence: 100,
        platformFeeBps: 9000,
        processorFeePence: 50,
        processorMarkupPence: 50,
      }),
    ).toThrow(/negative/);
  });

  it('applies Enterprise tier default fee', () => {
    expect(resolvePlatformFeeBps('ENTERPRISE', null)).toBe(100);
    expect(resolvePlatformFeeBps('PROFESSIONAL', null)).toBe(250);
  });

  it('honours explicit fee override', () => {
    expect(resolvePlatformFeeBps('ENTERPRISE', 0)).toBe(0);
  });

  it('builds public fee preview', () => {
    const preview = buildFeePreview(10000, 250);
    expect(preview.grossPence).toBe(10000);
    expect(preview.netToPracticePence).toBeLessThan(10000);
    expect(preview.processingFeePence).toBeGreaterThan(0);
  });

  it('estimates Revolut processor cost', () => {
    expect(estimateProcessorCost('REVOLUT', 10000)).toBeGreaterThan(0);
    expect(estimateProcessorMarkup(10000)).toBeGreaterThanOrEqual(0);
  });
});