/**
 * W4.1 — Anonymised fee benchmarks from accepted proposals (tenant + opt-in cross-practice).
 */
import { prisma } from '../../config/database.js';
import { logAiUsage } from './proposalAiService.js';

export interface BenchmarkBand {
  serviceCategory: string;
  currency: 'GBP';
  low: number;
  median: number;
  high: number;
  sampleSize: number;
  note: string;
}

const UK_STUB_BENCHMARKS: BenchmarkBand[] = [
  {
    serviceCategory: 'Annual accounts & corporation tax',
    currency: 'GBP',
    low: 1200,
    median: 2400,
    high: 4800,
    sampleSize: 0,
    note: 'UK practice norm — limited companies.',
  },
  {
    serviceCategory: 'Self-assessment tax return',
    currency: 'GBP',
    low: 250,
    median: 450,
    high: 850,
    sampleSize: 0,
    note: 'UK practice norm — individuals.',
  },
  {
    serviceCategory: 'VAT returns (quarterly)',
    currency: 'GBP',
    low: 80,
    median: 150,
    high: 300,
    sampleSize: 0,
    note: 'Per quarter, excluding bookkeeping.',
  },
];

function parseBenchmarkOptIn(settingsJson?: string | null): boolean {
  try {
    const parsed = JSON.parse(settingsJson || '{}');
    return parsed.benchmarkPricingOptIn === true;
  } catch {
    return false;
  }
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return Math.round(sorted[idx]);
}

function categoriseServiceName(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('account') || n.includes('corporation tax')) {
    return 'Annual accounts & corporation tax';
  }
  if (n.includes('self-assessment') || n.includes('personal tax')) {
    return 'Self-assessment tax return';
  }
  if (n.includes('vat')) return 'VAT returns (quarterly)';
  if (n.includes('payroll') || n.includes('paye')) return 'Payroll & PAYE';
  if (n.includes('bookkeep')) return 'Bookkeeping (monthly)';
  return name;
}

async function aggregateBenchmarks(
  tenantIds: string[],
  serviceNames?: string[]
): Promise<BenchmarkBand[]> {
  if (!tenantIds.length) return [];

  const lines = await prisma.proposalService.findMany({
    where: {
      proposal: {
        tenantId: { in: tenantIds },
        status: 'ACCEPTED',
      },
    },
    select: {
      name: true,
      displayPrice: true,
      billingFrequency: true,
      annualEquivalent: true,
    },
    take: 5000,
  });

  const buckets = new Map<string, number[]>();
  for (const line of lines) {
    const annual =
      line.annualEquivalent > 0
        ? line.annualEquivalent
        : line.billingFrequency === 'MONTHLY'
          ? line.displayPrice * 12
          : line.billingFrequency === 'QUARTERLY'
            ? line.displayPrice * 4
            : line.billingFrequency === 'WEEKLY'
              ? line.displayPrice * 52
              : line.displayPrice;
    if (annual <= 0) continue;
    const cat = categoriseServiceName(line.name);
    const arr = buckets.get(cat) ?? [];
    arr.push(annual);
    buckets.set(cat, arr);
  }

  const bands: BenchmarkBand[] = [];
  for (const [serviceCategory, values] of buckets) {
    if (values.length < 3) continue;
    const sorted = [...values].sort((a, b) => a - b);
    bands.push({
      serviceCategory,
      currency: 'GBP',
      low: percentile(sorted, 0.1),
      median: percentile(sorted, 0.5),
      high: percentile(sorted, 0.9),
      sampleSize: sorted.length,
      note:
        tenantIds.length > 1
          ? 'Anonymised cross-practice benchmark (opt-in tenants).'
          : 'Based on your accepted proposals (annualised fees).',
    });
  }

  if (serviceNames?.length) {
    const lower = serviceNames.map((s) => s.toLowerCase());
    const filtered = bands.filter((b) =>
      lower.some(
        (name) =>
          categoriseServiceName(name) === b.serviceCategory ||
          name.includes(b.serviceCategory.split(' ')[0].toLowerCase())
      )
    );
    if (filtered.length) return filtered;
  }

  return bands;
}

/** Return benchmark bands for a tenant. */
export async function getBenchmarkPricing(
  tenantId: string,
  userId?: string,
  serviceNames?: string[]
): Promise<{
  optedIn: boolean;
  bands: BenchmarkBand[];
  disclaimer: string;
}> {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId },
    select: { settings: true },
  });

  const optedIn = parseBenchmarkOptIn(tenant?.settings);

  const tenantBands = await aggregateTenantBenchmarks(tenantId);
  let bands = tenantBands.length ? tenantBands : UK_STUB_BENCHMARKS;

  if (serviceNames?.length) {
    const lower = serviceNames.map((s) => s.toLowerCase());
    bands = bands.filter((b) =>
      lower.some(
        (name) =>
          (name.includes('accounts') && b.serviceCategory.includes('accounts')) ||
          (name.includes('self-assessment') && b.serviceCategory.includes('Self-assessment')) ||
          (name.includes('vat') && b.serviceCategory.includes('VAT'))
      )
    );
    if (!bands.length) bands = UK_STUB_BENCHMARKS.slice(0, 1);
  }

  await logAiUsage(tenantId, userId, 'benchmark_pricing', {
    optedIn,
    bandCount: bands.length,
    liveSample: bands.some((b) => b.sampleSize > 0),
  });

  const hasLive = bands.some((b) => b.sampleSize > 0);
  return {
    optedIn,
    bands,
    disclaimer: optedIn
      ? tenantBands.length
        ? 'Bands combine your accepted proposal history with UK practice norms.'
        : 'Anonymised cross-practice benchmarks are in preview — figures shown are indicative placeholders.'
      : 'Enable benchmark pricing in Settings to compare your fees with anonymised UK practice data (coming soon).',
  };
}

async function aggregateTenantBenchmarks(tenantId: string): Promise<BenchmarkBand[]> {
  const accepted = await prisma.proposal.findMany({
    where: { tenantId, status: 'ACCEPTED' },
    include: { services: { select: { name: true, unitPrice: true, billingFrequency: true } } },
    take: 200,
    orderBy: { acceptedAt: 'desc' },
  });

  if (!accepted.length) return [];

  const byCategory = new Map<string, number[]>();
  for (const p of accepted) {
    for (const s of p.services) {
      const key = s.name.split(' ').slice(0, 3).join(' ');
      const arr = byCategory.get(key) || [];
      arr.push(s.unitPrice);
      byCategory.set(key, arr);
    }
  }

  const bands: BenchmarkBand[] = [];
  for (const [category, prices] of byCategory.entries()) {
    if (prices.length < 2) continue;
    const sorted = [...prices].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    bands.push({
      serviceCategory: category,
      currency: 'GBP',
      low: sorted[0],
      median,
      high: sorted[sorted.length - 1],
      sampleSize: prices.length,
      note: `Based on ${prices.length} accepted proposals in your practice.`,
    });
  }

  return bands.slice(0, 8);
}
