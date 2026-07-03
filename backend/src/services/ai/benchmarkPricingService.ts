/**
 * Phase 5 stub — anonymised benchmark pricing (opt-in placeholder).
 * Returns indicative fee bands until cross-tenant aggregation is live.
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
    note: 'Placeholder band for limited companies — opt-in benchmark network coming soon.',
  },
  {
    serviceCategory: 'Self-assessment tax return',
    currency: 'GBP',
    low: 250,
    median: 450,
    high: 850,
    sampleSize: 0,
    note: 'Placeholder band for individuals — based on UK practice norms, not live data.',
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

/** Return benchmark bands for a tenant (stub data until anonymised aggregation ships). */
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
  });

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