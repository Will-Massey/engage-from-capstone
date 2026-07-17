/**
 * W4.1 — Anonymised fee benchmarks across tenants (k-anonymity min 5 tenants per category).
 */

import { ServiceCategory } from '@prisma/client';
import { monthlyEquivalentFor } from '@uk-proposal-platform/shared';
import { prisma } from '../config/database.js';
import { penceToPounds } from '../utils/proposalPricing.js';
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

type CategoryBucket = {
  category: ServiceCategory;
  tenantIds: Set<string>;
  monthlyFees: number[];
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

export interface FeeBenchmarkResult {
  benchmarks: FeeBenchmarkBand[];
  suppressedCategories: number;
  kAnonymityMinTenants: number;
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
 * Aggregate accepted proposal line fees by service category across all tenants.
 * Categories with fewer than k tenants are suppressed.
 */
export async function getFeeBenchmarks(): Promise<FeeBenchmarkResult> {
  const optedInTenantIds = await getBenchmarkOptInTenantIds();

  if (optedInTenantIds.size === 0) {
    return {
      benchmarks: [],
      suppressedCategories: 0,
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
      displayPricePence: { gt: 0 },
    },
    select: {
      displayPricePence: true,
      billingFrequency: true,
      proposal: {
        select: {
          tenantId: true,
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

  for (const row of rows) {
    const category = row.serviceTemplate?.category;
    if (!category) continue;

    const monthly = toMonthlyEquivalent(penceToPounds(row.displayPricePence), row.billingFrequency);
    if (!Number.isFinite(monthly) || monthly <= 0) continue;

    const bucket = buckets.get(category) || {
      category,
      tenantIds: new Set<string>(),
      monthlyFees: [],
    };
    bucket.tenantIds.add(row.proposal.tenantId);
    bucket.monthlyFees.push(monthly);
    buckets.set(category, bucket);
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

  return {
    benchmarks,
    suppressedCategories,
    kAnonymityMinTenants: K_ANONYMITY_MIN_TENANTS,
    disclaimer:
      'Anonymised percentile bands from accepted and sent proposals across Engage practices that have opted in. No tenant or client identifiers are included. Categories with fewer than five contributing practices are withheld.',
    generatedAt: new Date().toISOString(),
  };
}
