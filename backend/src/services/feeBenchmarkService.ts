/**
 * W4.1 — Anonymised fee benchmarks across tenants (k-anonymity min 5 tenants per category).
 * R3.1 — Per (category, turnover band) cells, same k-anonymity floor per cell.
 * R3.2 — "Your fee vs market": exact mid-rank percentile against the raw cell sample.
 */

import { ServiceCategory } from '@prisma/client';
import { monthlyEquivalentFor } from '@uk-proposal-platform/shared';
import { prisma } from '../config/database.js';
import { getTurnoverBand, type TurnoverBand } from './regulatoryFitService.js';
import { getProposalSettings } from '../utils/tenantProposalSettings.js';

const K_ANONYMITY_MIN_TENANTS = 5;

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  COMPLIANCE: 'Compliance',
  ADVISORY: 'Advisory',
  TAX: 'Tax',
  PAYROLL: 'Payroll',
  BOOKKEEPING: 'Bookkeeping',
  AUDIT: 'Audit',
  CONSULTING: 'Consulting',
  TECHNICAL: 'Technical',
  SPECIALIZED: 'Specialised',
};

/** Labels mirror the getTurnoverBand thresholds in regulatoryFitService. */
export const TURNOVER_BAND_LABELS: Record<TurnoverBand, string> = {
  UNKNOWN: 'unknown turnover',
  MICRO: 'under £50k turnover',
  SMALL: '£50k–£200k turnover',
  MEDIUM: '£200k–£1m turnover',
  LARGE: '£1m+ turnover',
};

/**
 * Normalise line fees to a monthly GBP equivalent for comparison.
 * One-offs are amortised over a year — a £600 one-off benchmarks like £50/mo.
 */
export function toMonthlyEquivalent(displayPrice: number, billingFrequency: string): number {
  return monthlyEquivalentFor(displayPrice, billingFrequency, { oneTime: 'amortised' });
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return Math.round(sorted[lower] * 100) / 100;
  const value = sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
  return Math.round(value * 100) / 100;
}

/**
 * Exact percentile rank of `fee` within `values` (mid-rank: strictly-below plus
 * half of ties), rounded to the nearest integer and clamped to 1–99.
 */
export function percentileRankOf(values: number[], fee: number): number {
  if (values.length === 0) return 50;
  let below = 0;
  let ties = 0;
  for (const value of values) {
    if (value < fee) below += 1;
    else if (value === fee) ties += 1;
  }
  const raw = ((below + ties / 2) / values.length) * 100;
  return Math.min(99, Math.max(1, Math.round(raw)));
}

type CategoryBucket = {
  category: ServiceCategory;
  tenantIds: Set<string>;
  monthlyFees: number[];
};

type TurnoverCellBucket = CategoryBucket & {
  turnoverBand: TurnoverBand;
};

export interface FeeBenchmarkBand {
  category: ServiceCategory;
  label: string;
  tenantCount: number;
  sampleSize: number;
  p25: number;
  p50: number;
  p75: number;
  currency: 'GBP';
  unit: 'per_month_gbp';
}

export interface FeeBenchmarkTurnoverCell extends FeeBenchmarkBand {
  turnoverBand: TurnoverBand;
  turnoverBandLabel: string;
}

export interface YourFeeComparison {
  fee: number;
  percentile: number;
  vsMedianPct: number;
  scope: 'category_band' | 'category';
  category: ServiceCategory;
  turnoverBand?: TurnoverBand;
}

export interface FeeBenchmarkQuery {
  category?: ServiceCategory;
  fee?: number;
  turnoverBand?: TurnoverBand;
}

export interface FeeBenchmarkResult {
  benchmarks: FeeBenchmarkBand[];
  bandsByTurnover: FeeBenchmarkTurnoverCell[];
  suppressedCategories: number;
  suppressedTurnoverCells: number;
  kAnonymityMinTenants: number;
  yourFee?: YourFeeComparison;
  disclaimer: string;
  generatedAt: string;
  optedIn?: boolean;
}

/** Tenant IDs that opted in to anonymised fee benchmark sharing */
export async function getBenchmarkOptInTenantIds(): Promise<Set<string>> {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, settings: true },
  });

  const optedIn = new Set<string>();
  for (const tenant of tenants) {
    if (getProposalSettings(tenant.settings).benchmarksOptIn) {
      optedIn.add(tenant.id);
    }
  }
  return optedIn;
}

/**
 * Aggregate accepted proposal line fees by service category across all tenants,
 * plus per (category, turnover band) cells. Categories and cells with fewer
 * than k tenants are suppressed. When `query.category` and `query.fee` are
 * given, an exact percentile rank of that fee is computed against the matching
 * (category, band) cell if it passes k-anonymity, else the category pool.
 */
export async function getFeeBenchmarks(query?: FeeBenchmarkQuery): Promise<FeeBenchmarkResult> {
  const optedInTenantIds = await getBenchmarkOptInTenantIds();

  if (optedInTenantIds.size === 0) {
    return {
      benchmarks: [],
      bandsByTurnover: [],
      suppressedCategories: 0,
      suppressedTurnoverCells: 0,
      kAnonymityMinTenants: K_ANONYMITY_MIN_TENANTS,
      disclaimer:
        'Anonymised percentile bands from accepted and sent proposals across Engage practices that have opted in. No tenant or client identifiers are included. Categories with fewer than five contributing practices are withheld.',
      generatedAt: new Date().toISOString(),
    };
  }

  const rows = await prisma.proposalService.findMany({
    where: {
      proposal: {
        status: { in: ['ACCEPTED', 'SENT', 'VIEWED'] },
        tenantId: { in: [...optedInTenantIds] },
      },
      displayPrice: { gt: 0 },
    },
    select: {
      displayPrice: true,
      billingFrequency: true,
      proposal: {
        select: {
          tenantId: true,
          client: {
            select: {
              turnover: true,
            },
          },
        },
      },
      serviceTemplate: {
        select: {
          category: true,
        },
      },
    },
  });

  const buckets = new Map<ServiceCategory, CategoryBucket>();
  const cellBuckets = new Map<string, TurnoverCellBucket>();

  for (const row of rows) {
    const category = row.serviceTemplate?.category;
    if (!category) continue;

    const monthly = toMonthlyEquivalent(row.displayPrice, row.billingFrequency);
    if (!Number.isFinite(monthly) || monthly <= 0) continue;

    const bucket = buckets.get(category) || {
      category,
      tenantIds: new Set<string>(),
      monthlyFees: [],
    };
    bucket.tenantIds.add(row.proposal.tenantId);
    bucket.monthlyFees.push(monthly);
    buckets.set(category, bucket);

    const turnoverBand = getTurnoverBand(row.proposal.client?.turnover);
    const cellKey = `${category}:${turnoverBand}`;
    const cell = cellBuckets.get(cellKey) || {
      category,
      turnoverBand,
      tenantIds: new Set<string>(),
      monthlyFees: [],
    };
    cell.tenantIds.add(row.proposal.tenantId);
    cell.monthlyFees.push(monthly);
    cellBuckets.set(cellKey, cell);
  }

  const benchmarks: FeeBenchmarkBand[] = [];
  let suppressedCategories = 0;

  for (const bucket of buckets.values()) {
    if (bucket.tenantIds.size < K_ANONYMITY_MIN_TENANTS) {
      suppressedCategories += 1;
      continue;
    }

    const sorted = [...bucket.monthlyFees].sort((a, b) => a - b);
    benchmarks.push({
      category: bucket.category,
      label: CATEGORY_LABELS[bucket.category],
      tenantCount: bucket.tenantIds.size,
      sampleSize: sorted.length,
      p25: percentile(sorted, 0.25),
      p50: percentile(sorted, 0.5),
      p75: percentile(sorted, 0.75),
      currency: 'GBP',
      unit: 'per_month_gbp',
    });
  }

  benchmarks.sort((a, b) => a.label.localeCompare(b.label));

  const bandsByTurnover: FeeBenchmarkTurnoverCell[] = [];
  let suppressedTurnoverCells = 0;

  for (const cell of cellBuckets.values()) {
    if (cell.tenantIds.size < K_ANONYMITY_MIN_TENANTS) {
      suppressedTurnoverCells += 1;
      continue;
    }

    const sorted = [...cell.monthlyFees].sort((a, b) => a - b);
    bandsByTurnover.push({
      category: cell.category,
      label: CATEGORY_LABELS[cell.category],
      turnoverBand: cell.turnoverBand,
      turnoverBandLabel: TURNOVER_BAND_LABELS[cell.turnoverBand],
      tenantCount: cell.tenantIds.size,
      sampleSize: sorted.length,
      p25: percentile(sorted, 0.25),
      p50: percentile(sorted, 0.5),
      p75: percentile(sorted, 0.75),
      currency: 'GBP',
      unit: 'per_month_gbp',
    });
  }

  bandsByTurnover.sort(
    (a, b) =>
      a.label.localeCompare(b.label) || a.turnoverBandLabel.localeCompare(b.turnoverBandLabel)
  );

  let yourFee: YourFeeComparison | undefined;
  if (query?.category && typeof query.fee === 'number' && query.fee > 0) {
    yourFee = compareYourFee(query.category, query.fee, query.turnoverBand, buckets, cellBuckets);
  }

  return {
    benchmarks,
    bandsByTurnover,
    suppressedCategories,
    suppressedTurnoverCells,
    kAnonymityMinTenants: K_ANONYMITY_MIN_TENANTS,
    ...(yourFee ? { yourFee } : {}),
    disclaimer:
      'Anonymised percentile bands from accepted and sent proposals across Engage practices that have opted in. No tenant or client identifiers are included. Categories with fewer than five contributing practices are withheld.',
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Exact percentile rank of `fee` against the (category, band) cell when it
 * passes k-anonymity, falling back to the category-level pool, else undefined.
 */
function compareYourFee(
  category: ServiceCategory,
  fee: number,
  turnoverBand: TurnoverBand | undefined,
  buckets: Map<ServiceCategory, CategoryBucket>,
  cellBuckets: Map<string, TurnoverCellBucket>
): YourFeeComparison | undefined {
  if (turnoverBand) {
    const cell = cellBuckets.get(`${category}:${turnoverBand}`);
    if (cell && cell.tenantIds.size >= K_ANONYMITY_MIN_TENANTS) {
      return buildYourFee(category, fee, cell.monthlyFees, 'category_band', turnoverBand);
    }
  }

  const bucket = buckets.get(category);
  if (bucket && bucket.tenantIds.size >= K_ANONYMITY_MIN_TENANTS) {
    return buildYourFee(category, fee, bucket.monthlyFees, 'category');
  }

  return undefined;
}

function buildYourFee(
  category: ServiceCategory,
  fee: number,
  monthlyFees: number[],
  scope: YourFeeComparison['scope'],
  turnoverBand?: TurnoverBand
): YourFeeComparison | undefined {
  const sorted = [...monthlyFees].sort((a, b) => a - b);
  const p50 = percentile(sorted, 0.5);
  if (p50 <= 0) return undefined;

  return {
    fee,
    percentile: percentileRankOf(sorted, fee),
    vsMedianPct: Math.round(((fee - p50) / p50) * 100),
    scope,
    category,
    ...(turnoverBand ? { turnoverBand } : {}),
  };
}
