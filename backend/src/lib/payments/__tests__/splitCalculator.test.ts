import {
  buildFeePreview,
  calculateSplit,
  estimateProcessorCost,
  estimateProcessorMarkup,
  resolvePlatformFeeBps,
} from '../splitCalculator.js';
import { getPlatformFeeBps, estimateStripeProcessorCost } from '../feeConfig.js';

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
      })
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

  it('estimates processor markup', () => {
    expect(estimateProcessorMarkup(10000)).toBeGreaterThanOrEqual(0);
  });
});

describe('feeConfig', () => {
  it('estimates Stripe processing cost (1.5% + 20p)', () => {
    expect(estimateStripeProcessorCost(10000)).toBe(170); // 150 + 20
  });
  it('defaults platform fee to 250 bps', () => {
    delete process.env.ENGAGE_PLATFORM_FEE_BPS;
    expect(getPlatformFeeBps()).toBe(250);
  });
});

describe('splitCalculator STRIPE branch', () => {
  it('estimates processor cost for STRIPE', () => {
    expect(estimateProcessorCost('STRIPE', 10000)).toBe(170);
  });
  it('fee preview nets practice share after Stripe cost + platform fee', () => {
    const p = buildFeePreview(10000, 250);
    expect(p.platformFeePence).toBe(250);
    expect(p.processingFeePence).toBeGreaterThan(0);
    expect(p.netToPracticePence).toBe(10000 - p.platformFeePence - p.processingFeePence);
  });
});
