/**
 * R3 fee benchmark helpers — pick the right (category, turnover band) cell and
 * format "vs market median" hints for proposal builder service lines.
 */
import { monthlyEquivalentFor } from '@shared/pricingEngine';
import type { TurnoverBand } from '../types/analytics';

/** Mirrors backend getTurnoverBand (regulatoryFitService) — keep thresholds in sync. */
export function getTurnoverBand(turnover?: number | null): TurnoverBand {
  if (turnover == null || !Number.isFinite(turnover) || turnover <= 0) return 'UNKNOWN';
  if (turnover < 50_000) return 'MICRO';
  if (turnover < 200_000) return 'SMALL';
  if (turnover < 1_000_000) return 'MEDIUM';
  return 'LARGE';
}

/** Mirrors backend TURNOVER_BAND_LABELS in feeBenchmarkService. */
export const TURNOVER_BAND_LABELS: Record<TurnoverBand, string> = {
  UNKNOWN: 'unknown turnover',
  MICRO: 'under £50k turnover',
  SMALL: '£50k–£200k turnover',
  MEDIUM: '£200k–£1m turnover',
  LARGE: '£1m+ turnover',
};

/** Monthly-equivalent of a service line price; one-offs amortised over a year. */
export function lineMonthlyEquivalent(displayPrice: number, billingCycle: string): number {
  return monthlyEquivalentFor(displayPrice, billingCycle, { oneTime: 'amortised' });
}

/**
 * Pick the benchmark cell for a category: the (category, band) cell when the
 * client's band passed k-anonymity, else the category-level band, else null.
 */
export function pickBenchmarkCell<
  B extends { category: string },
  C extends { category: string; turnoverBand: TurnoverBand },
>(
  data: { benchmarks: B[]; bandsByTurnover?: C[] },
  category: string,
  turnoverBand?: TurnoverBand
): B | C | null {
  if (turnoverBand) {
    const cell = (data.bandsByTurnover ?? []).find(
      (c) => c.category === category && c.turnoverBand === turnoverBand
    );
    if (cell) return cell;
  }
  return data.benchmarks.find((b) => b.category === category) ?? null;
}

/**
 * "vs market median: +12%" / "vs market median: −8%" / "vs market median: at median".
 * Within ±2% of the median counts as at-median. Null when either value is unusable.
 */
export function vsMedianHint(monthlyFee: number, p50: number): string | null {
  if (!Number.isFinite(monthlyFee) || monthlyFee <= 0) return null;
  if (!Number.isFinite(p50) || p50 <= 0) return null;
  const pct = Math.round(((monthlyFee - p50) / p50) * 100);
  if (Math.abs(pct) <= 2) return 'vs market median: at median';
  return `vs market median: ${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`;
}
