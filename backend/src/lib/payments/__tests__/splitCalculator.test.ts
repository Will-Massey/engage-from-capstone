import {
  applicationFeePence,
  buildFeePreview,
  calculateSplit,
  collectionFeePercent,
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

  it('uses the same non-negative platform margin on every tier', () => {
    expect(resolvePlatformFeeBps('ENTERPRISE', null)).toBe(25);
    expect(resolvePlatformFeeBps('PROFESSIONAL', null)).toBe(25);
  });

  it('honours explicit fee override', () => {
    expect(resolvePlatformFeeBps('ENTERPRISE', 0)).toBe(0);
  });

  it('builds public fee preview', () => {
    const preview = buildFeePreview(10000, 25);
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
  it('defaults platform fee to 25 bps', () => {
    delete process.env.ENGAGE_PLATFORM_FEE_BPS;
    expect(getPlatformFeeBps()).toBe(25);
  });
});

describe('splitCalculator STRIPE branch', () => {
  it('estimates processor cost for STRIPE', () => {
    expect(estimateProcessorCost('STRIPE', 10000)).toBe(170);
  });
  it('fee preview passes Stripe through plus the platform margin', () => {
    const p = buildFeePreview(10000, 25);
    expect(p.platformFeePence).toBe(25);
    expect(p.processingFeePence).toBe(170);
    expect(p.netToPracticePence).toBe(9805);
  });
  it('application fee never goes below the Stripe estimate', () => {
    const split = calculateSplit({
      grossPence: 10000,
      platformFeeBps: 0,
      processorFeePence: 170,
      processorMarkupPence: 0,
    });
    expect(applicationFeePence(split)).toBe(170);
    expect(applicationFeePence(split)).toBeGreaterThanOrEqual(split.processorFeePence);
  });
  it('covers Stripe plus platform so Capstone is not subsidising the charge', () => {
    const stripePence = estimateProcessorCost('STRIPE', 10000);
    const p = buildFeePreview(10000, 25);
    expect(p.platformFeePence + p.processingFeePence).toBe(195);
    expect(p.platformFeePence + p.processingFeePence).toBeGreaterThan(stripePence);
  });
  it('bakes the full fee into a subscription percent', () => {
    expect(collectionFeePercent(10000, 25)).toBe(1.95);
  });
});
