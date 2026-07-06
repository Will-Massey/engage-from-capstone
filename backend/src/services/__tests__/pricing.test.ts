import { calculateVAT, calculateMargin, calculatePrice } from '@shared/index';

describe('Shared Pricing Engine', () => {
  describe('calculateVAT', () => {
    it('calculates 20% VAT correctly', () => {
      expect(calculateVAT(100)).toBe(20);
      expect(calculateVAT(85)).toBe(17);
      expect(calculateVAT(850)).toBe(170);
    });

    it('calculates 5% VAT correctly', () => {
      expect(calculateVAT(100, 5)).toBe(5);
      expect(calculateVAT(200, 5)).toBe(10);
    });

    it('calculates 0% VAT correctly', () => {
      expect(calculateVAT(100, 0)).toBe(0);
      expect(calculateVAT(999, 0)).toBe(0);
    });

    it('rounds to 2 decimal places', () => {
      expect(calculateVAT(33.33, 20)).toBe(6.67);
    });
  });

  describe('calculateMargin', () => {
    it('calculates margin correctly', () => {
      expect(calculateMargin(100, 60)).toBe(40);
      expect(calculateMargin(200, 150)).toBe(25);
    });

    it('returns 0 when revenue is 0', () => {
      expect(calculateMargin(0, 0)).toBe(0);
      expect(calculateMargin(0, 100)).toBe(0);
    });
  });

  describe('calculatePrice', () => {
    it('calculates base price without adjustments', () => {
      const result = calculatePrice(100, [], 1, 'EAST_MIDLANDS');
      expect(result.basePrice).toBe(100);
      expect(result.complexityMultiplier).toBe(1);
      expect(result.volumeDiscount).toBe(1);
      expect(result.geographicAdjustment).toBe(0.9);
      expect(result.finalPrice).toBeGreaterThan(0);
    });

    it('applies complexity multiplier', () => {
      const noComplexity = calculatePrice(100, [], 1, 'LONDON');
      const withComplexity = calculatePrice(100, [1.5, 1.2], 1, 'LONDON');
      expect(withComplexity.complexityMultiplier).toBeCloseTo(1.8, 10);
      expect(withComplexity.finalPrice).toBeGreaterThan(noComplexity.finalPrice);
    });

    it('applies volume discount', () => {
      const single = calculatePrice(100, [], 1, 'LONDON');
      const medium = calculatePrice(100, [], 6, 'LONDON');
      const large = calculatePrice(100, [], 11, 'LONDON');
      expect(medium.volumeDiscount).toBe(0.95);
      expect(large.volumeDiscount).toBe(0.9);
      expect(large.finalPrice).toBeLessThan(single.finalPrice);
    });

    it('applies geographic adjustment', () => {
      const london = calculatePrice(100, [], 1, 'LONDON');
      const northEast = calculatePrice(100, [], 1, 'NORTH_EAST');
      expect(london.geographicAdjustment).toBe(1.25);
      expect(northEast.geographicAdjustment).toBe(0.85);
      expect(london.finalPrice).toBeGreaterThan(northEast.finalPrice);
    });

    it('defaults to 1 for unknown regions', () => {
      const result = calculatePrice(100, [], 1, 'MARS');
      expect(result.geographicAdjustment).toBe(1);
    });

    it('calculates breakdown correctly', () => {
      const result = calculatePrice(100, [], 1, 'LONDON', 30);
      expect(result.breakdown.targetMargin).toBe(30);
      // direct (50%) + indirect (30%) + overhead (20%) = 100% of costs
      const totalCosts =
        result.breakdown.directCosts +
        result.breakdown.indirectCosts +
        result.breakdown.overheadAllocation;
      const expectedCosts = 100 * 0.6; // basePrice * 0.6 cost ratio for London (no complexity)
      expect(totalCosts).toBeCloseTo(expectedCosts, 1);
    });
  });
});
