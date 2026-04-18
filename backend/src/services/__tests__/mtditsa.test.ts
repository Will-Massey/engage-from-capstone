import { mtditsaCalculator, MTDITSAStatus } from '@shared/index';

describe('MTD ITSA Calculator', () => {
  describe('calculateStatus', () => {
    it('returns NOT_REQUIRED for income below all thresholds', () => {
      expect(
        mtditsaCalculator.calculateStatus(15000, [{ type: 'SELF_EMPLOYMENT', amount: 15000 }])
      ).toBe(MTDITSAStatus.NOT_REQUIRED);
    });

    it('returns REQUIRED_2028 for income between 20k and 30k', () => {
      expect(
        mtditsaCalculator.calculateStatus(25000, [{ type: 'SELF_EMPLOYMENT', amount: 25000 }])
      ).toBe(MTDITSAStatus.REQUIRED_2028);
    });

    it('returns REQUIRED_2027 for income between 30k and 50k', () => {
      expect(
        mtditsaCalculator.calculateStatus(40000, [{ type: 'SELF_EMPLOYMENT', amount: 40000 }])
      ).toBe(MTDITSAStatus.REQUIRED_2027);
    });

    it('returns REQUIRED_2026 for income above 50k', () => {
      expect(
        mtditsaCalculator.calculateStatus(75000, [{ type: 'SELF_EMPLOYMENT', amount: 75000 }])
      ).toBe(MTDITSAStatus.REQUIRED_2026);
    });

    it('returns EXEMPT for partnership income below 10k', () => {
      expect(
        mtditsaCalculator.calculateStatus(60000, [
          { type: 'PARTNERSHIP', amount: 5000 },
          { type: 'SELF_EMPLOYMENT', amount: 55000 },
        ])
      ).toBe(MTDITSAStatus.EXEMPT);
    });
  });

  describe('calculateQuarterlyDeadlines', () => {
    it('returns 4 quarters for a tax year', () => {
      const deadlines = mtditsaCalculator.calculateQuarterlyDeadlines(2026);
      expect(deadlines).toHaveLength(4);
      expect(deadlines[0].quarter).toBe(1);
      expect(deadlines[3].quarter).toBe(4);
    });

    it('has correct filing deadlines', () => {
      const deadlines = mtditsaCalculator.calculateQuarterlyDeadlines(2026);
      expect(deadlines[0].filingDeadline).toEqual(new Date('2026-08-05'));
      expect(deadlines[1].filingDeadline).toEqual(new Date('2026-11-05'));
      expect(deadlines[2].filingDeadline).toEqual(new Date('2027-02-05'));
      expect(deadlines[3].filingDeadline).toEqual(new Date('2027-05-05'));
    });
  });

  describe('getEligibilityCriteria', () => {
    it('returns correct thresholds', () => {
      const criteria = mtditsaCalculator.getEligibilityCriteria();
      expect(criteria.threshold2026).toBe(50000);
      expect(criteria.threshold2027).toBe(30000);
      expect(criteria.threshold2028).toBe(20000);
      expect(criteria.exemptCategories).toContain('Partnerships with turnover below £10,000');
    });
  });
});
