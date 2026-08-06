const tenantFindMany = jest.fn();
const proposalServiceFindMany = jest.fn();

jest.mock('../../config/database.js', () => ({
  prisma: {
    tenant: { findMany: tenantFindMany },
    proposalService: { findMany: proposalServiceFindMany },
  },
}));

import type { ServiceCategory } from '@prisma/client';
import { getFeeBenchmarks, percentileRankOf, toMonthlyEquivalent } from '../feeBenchmarkService.js';

function optedInTenant(id: string) {
  return { id, settings: JSON.stringify({ proposals: { benchmarksOptIn: true } }) };
}

function optedOutTenant(id: string) {
  return { id, settings: JSON.stringify({ proposals: { benchmarksOptIn: false } }) };
}

function line(
  tenantId: string,
  category: ServiceCategory,
  displayPrice: number,
  billingFrequency = 'MONTHLY',
  turnover: number | null = 100_000
) {
  return {
    displayPricePence: Math.round(displayPrice * 100),
    billingFrequency,
    proposal: { tenantId, client: { turnover } },
    serviceTemplate: { category },
  };
}

describe('feeBenchmarkService', () => {
  beforeEach(() => {
    tenantFindMany.mockReset();
    proposalServiceFindMany.mockReset();
    tenantFindMany.mockResolvedValue(
      ['t1', 't2', 't3', 't4', 't5'].map(optedInTenant).concat(optedOutTenant('t-out'))
    );
    proposalServiceFindMany.mockResolvedValue([]);
  });

  describe('percentileRankOf', () => {
    it('mid-ranks a fee between sample values', () => {
      expect(percentileRankOf([10, 20, 30, 40], 25)).toBe(50);
    });

    it('counts half of ties', () => {
      // below = 1, ties = 2 → (1 + 1) / 4 = 50%
      expect(percentileRankOf([10, 20, 20, 30], 20)).toBe(50);
    });

    it('clamps to 1–99', () => {
      expect(percentileRankOf([10, 20, 30], 1)).toBe(1);
      expect(percentileRankOf([10, 20, 30], 999)).toBe(99);
    });
  });

  describe('toMonthlyEquivalent', () => {
    it('normalises every billing frequency to monthly GBP', () => {
      expect(toMonthlyEquivalent(100, 'MONTHLY')).toBe(100);
      expect(toMonthlyEquivalent(300, 'QUARTERLY')).toBe(100);
      expect(toMonthlyEquivalent(1200, 'ANNUALLY')).toBe(100);
      expect(toMonthlyEquivalent(30, 'WEEKLY')).toBe(130);
    });

    it('amortises one-time fees over a year', () => {
      expect(toMonthlyEquivalent(1200, 'ONE_TIME')).toBe(100);
    });
  });

  describe('opt-in filtering', () => {
    it('queries only opted-in tenants', async () => {
      await getFeeBenchmarks();
      const where = proposalServiceFindMany.mock.calls[0][0].where;
      expect(where.proposal.tenantId.in.sort()).toEqual(['t1', 't2', 't3', 't4', 't5']);
      expect(where.proposal.tenantId.in).not.toContain('t-out');
    });

    it('returns empty result without querying when nobody opted in', async () => {
      tenantFindMany.mockResolvedValue([optedOutTenant('t-out')]);
      const result = await getFeeBenchmarks();
      expect(result.benchmarks).toEqual([]);
      expect(result.bandsByTurnover).toEqual([]);
      expect(proposalServiceFindMany).not.toHaveBeenCalled();
    });
  });

  describe('k-anonymity', () => {
    it('suppresses categories and cells with fewer than 5 tenants', async () => {
      proposalServiceFindMany.mockResolvedValue([
        // COMPLIANCE: 5 tenants, all SMALL turnover → category + cell emitted
        ...['t1', 't2', 't3', 't4', 't5'].map((t) => line(t, 'COMPLIANCE', 100)),
        // TAX: 4 tenants → category and cell suppressed
        ...['t1', 't2', 't3', 't4'].map((t) => line(t, 'TAX', 50)),
      ]);

      const result = await getFeeBenchmarks();

      expect(result.benchmarks.map((b) => b.category)).toEqual(['COMPLIANCE']);
      expect(result.suppressedCategories).toBe(1);
      expect(result.bandsByTurnover).toHaveLength(1);
      expect(result.bandsByTurnover[0]).toMatchObject({
        category: 'COMPLIANCE',
        turnoverBand: 'SMALL',
        tenantCount: 5,
      });
      expect(result.suppressedTurnoverCells).toBe(1);
    });

    it('suppresses per-band cells even when the category passes', async () => {
      proposalServiceFindMany.mockResolvedValue([
        // Category has 5 tenants, but split 3 SMALL / 2 MEDIUM → both cells withheld
        ...['t1', 't2', 't3'].map((t) => line(t, 'COMPLIANCE', 100, 'MONTHLY', 100_000)),
        ...['t4', 't5'].map((t) => line(t, 'COMPLIANCE', 100, 'MONTHLY', 500_000)),
      ]);

      const result = await getFeeBenchmarks();

      expect(result.benchmarks.map((b) => b.category)).toEqual(['COMPLIANCE']);
      expect(result.bandsByTurnover).toEqual([]);
      expect(result.suppressedTurnoverCells).toBe(2);
    });
  });

  describe('turnover banding', () => {
    it('bands lines by client turnover, with null turnover as UNKNOWN', async () => {
      const tenants = ['t1', 't2', 't3', 't4', 't5'];
      const turnovers: Array<[number | null, string]> = [
        [10_000, 'MICRO'],
        [100_000, 'SMALL'],
        [500_000, 'MEDIUM'],
        [2_000_000, 'LARGE'],
        [null, 'UNKNOWN'],
      ];
      proposalServiceFindMany.mockResolvedValue(
        turnovers.flatMap(([turnover]) =>
          tenants.map((t) => line(t, 'BOOKKEEPING', 100, 'MONTHLY', turnover))
        )
      );

      const result = await getFeeBenchmarks();

      const bands = result.bandsByTurnover.map((c) => c.turnoverBand).sort();
      expect(bands).toEqual(['LARGE', 'MEDIUM', 'MICRO', 'SMALL', 'UNKNOWN']);
      expect(result.suppressedTurnoverCells).toBe(0);
    });
  });

  describe('monthly normalisation', () => {
    it('pools mixed billing frequencies as monthly equivalents', async () => {
      proposalServiceFindMany.mockResolvedValue([
        line('t1', 'PAYROLL', 100, 'MONTHLY'),
        line('t2', 'PAYROLL', 300, 'QUARTERLY'),
        line('t3', 'PAYROLL', 1200, 'ANNUALLY'),
        line('t4', 'PAYROLL', 1200, 'ONE_TIME'),
        line('t5', 'PAYROLL', 100, 'MONTHLY'),
      ]);

      const result = await getFeeBenchmarks();

      expect(result.benchmarks).toHaveLength(1);
      expect(result.benchmarks[0]).toMatchObject({ p25: 100, p50: 100, p75: 100 });
    });
  });

  describe('your fee vs market', () => {
    const smallCellFees = [80, 90, 100, 110, 120];

    beforeEach(() => {
      proposalServiceFindMany.mockResolvedValue(
        smallCellFees.map((fee, i) => line(`t${i + 1}`, 'COMPLIANCE', fee, 'MONTHLY', 100_000))
      );
    });

    it('ranks against the (category, band) cell when it passes k-anonymity', async () => {
      const result = await getFeeBenchmarks({
        category: 'COMPLIANCE',
        fee: 112,
        turnoverBand: 'SMALL',
      });

      expect(result.yourFee).toMatchObject({
        fee: 112,
        percentile: 80,
        vsMedianPct: 12,
        scope: 'category_band',
        category: 'COMPLIANCE',
        turnoverBand: 'SMALL',
      });
    });

    it('falls back to the category pool when the cell is suppressed', async () => {
      const result = await getFeeBenchmarks({
        category: 'COMPLIANCE',
        fee: 92,
        turnoverBand: 'MEDIUM', // no MEDIUM cell exists
      });

      expect(result.yourFee).toMatchObject({
        fee: 92,
        percentile: 40,
        vsMedianPct: -8,
        scope: 'category',
      });
      expect(result.yourFee?.turnoverBand).toBeUndefined();
    });

    it('omits yourFee when nothing passes k-anonymity', async () => {
      const result = await getFeeBenchmarks({ category: 'TAX', fee: 100 });
      expect(result.yourFee).toBeUndefined();
    });

    it('omits yourFee when fee or category is missing', async () => {
      const withoutFee = await getFeeBenchmarks({ category: 'COMPLIANCE' });
      expect(withoutFee.yourFee).toBeUndefined();

      const withoutCategory = await getFeeBenchmarks({ fee: 100 });
      expect(withoutCategory.yourFee).toBeUndefined();
    });

    it('half-counts ties at the fee value', async () => {
      const result = await getFeeBenchmarks({ category: 'COMPLIANCE', fee: 100 });
      // below = 2 (80, 90), ties = 1 → (2 + 0.5) / 5 = 50%
      expect(result.yourFee?.percentile).toBe(50);
      expect(result.yourFee?.vsMedianPct).toBe(0);
    });

    it('clamps extreme percentiles to 1 and 99', async () => {
      const low = await getFeeBenchmarks({ category: 'COMPLIANCE', fee: 1 });
      expect(low.yourFee?.percentile).toBe(1);

      const high = await getFeeBenchmarks({ category: 'COMPLIANCE', fee: 999 });
      expect(high.yourFee?.percentile).toBe(99);
    });
  });
});
