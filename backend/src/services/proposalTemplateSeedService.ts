/**
 * W3.2 — Seed ICAEW/ACCA proposal template library and verify catalogue pricing alignment.
 */
import { prisma } from '../config/database.js';
import { allServices } from '../data/ukAccountancyServices.js';
import {
  getUkProposalTemplatePackages,
  getUkProposalTemplatePackageCount,
} from '../data/ukProposalTemplatePackages.js';
import { getCurrentVersionId } from './engagementLibraryVersionService.js';

export interface TemplateServiceConfigItem {
  serviceId: string;
  name: string;
  billingFrequency: string;
  displayPrice: number;
  quantity: number;
}

export interface SeedProposalTemplatesOptions {
  offset?: number;
  limit?: number;
}

export interface SeedProposalTemplatesResult {
  packageCount: number;
  catalogueCount: number;
  created: number;
  skipped: number;
  skippedNoServices: number;
  totalActive: number;
  offset: number;
  processed: number;
  hasMore: boolean;
  warnings: string[];
}

export interface TemplatePricingMismatch {
  templateId: string;
  templateName: string;
  serviceId: string;
  serviceName: string;
  templatePrice: number;
  cataloguePrice: number;
}

export interface TemplatePricingSanityResult {
  templatesChecked: number;
  servicesChecked: number;
  mismatches: TemplatePricingMismatch[];
  missingServiceIds: Array<{ templateId: string; templateName: string; serviceId: string }>;
  zeroOrNegativePrices: Array<{ templateId: string; templateName: string; serviceName: string; price: number }>;
  outOfBandPrices: Array<{
    templateId: string;
    templateName: string;
    serviceName: string;
    price: number;
    expectedMin: number;
    expectedMax: number;
  }>;
  priceBands: { min: number; max: number; median: number };
  passed: boolean;
}

function parseServiceConfig(raw: string): TemplateServiceConfigItem[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function cataloguePriceBands(): Map<string, { min: number; max: number }> {
  const bands = new Map<string, { min: number; max: number }>();
  for (const svc of allServices) {
    const base = svc.basePrice;
    const min = Math.max(1, Math.floor(base * 0.5));
    const max = Math.ceil(base * 2.5);
    bands.set(svc.name, { min, max });
  }
  return bands;
}

const SEED_BATCH_SIZE = 25;

export async function seedProposalTemplatesForTenant(
  tenantId: string,
  userId: string,
  options: SeedProposalTemplatesOptions = {}
): Promise<SeedProposalTemplatesResult> {
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.min(50, Math.max(1, options.limit ?? SEED_BATCH_SIZE));

  const [catalogue, existingTemplates] = await Promise.all([
    prisma.serviceTemplate.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, billingCycle: true, basePrice: true },
    }),
    prisma.proposalTemplate.findMany({
      where: { tenantId, isActive: true },
      select: { name: true },
    }),
  ]);
  const byName = new Map(catalogue.map((s) => [s.name, s]));
  const existingNames = new Set(existingTemplates.map((t) => t.name));

  const warnings: string[] = [];
  if (catalogue.length < 5) {
    warnings.push(
      `Only ${catalogue.length} services in catalogue — seed services first for best template coverage`
    );
  }

  let libraryVersionId: string | null = null;
  try {
    libraryVersionId = await getCurrentVersionId();
  } catch {
    libraryVersionId = null;
  }

  const packages = getUkProposalTemplatePackages();
  const slice = packages.slice(offset, offset + limit);
  let created = 0;
  let skipped = 0;
  let skippedNoServices = 0;
  const toCreate: Array<{
    tenantId: string;
    createdById: string;
    name: string;
    description: string;
    title: string;
    coverLetter: string | null;
    targetEntityType: string;
    targetIndustry: string | null;
    serviceConfig: string;
    defaultPricing: string;
    usageCount: number;
    isActive: boolean;
    isDefault: boolean;
    engagementLibraryVersionId: string | null;
    needsUpdate: boolean;
  }> = [];

  for (const pkg of slice) {
    if (existingNames.has(pkg.name)) {
      skipped++;
      continue;
    }

    const serviceConfig: TemplateServiceConfigItem[] = [];

    for (const serviceName of pkg.serviceNames) {
      const tmpl = byName.get(serviceName);
      if (!tmpl) continue;
      serviceConfig.push({
        serviceId: tmpl.id,
        name: tmpl.name,
        billingFrequency: tmpl.billingCycle,
        displayPrice: tmpl.basePrice,
        quantity: 1,
      });
    }

    if (!serviceConfig.length) {
      skipped++;
      skippedNoServices++;
      continue;
    }

    toCreate.push({
      tenantId,
      createdById: userId,
      name: pkg.name,
      description: pkg.description,
      title: pkg.title,
      coverLetter: pkg.coverLetterSnippet || null,
      targetEntityType: pkg.targetEntityType,
      targetIndustry: pkg.targetIndustry || null,
      serviceConfig: JSON.stringify(serviceConfig),
      defaultPricing: JSON.stringify({ coverLetterTone: 'PROFESSIONAL' }),
      usageCount: 0,
      isActive: true,
      isDefault: false,
      engagementLibraryVersionId: libraryVersionId,
      needsUpdate: false,
    });
  }

  if (toCreate.length) {
    const result = await prisma.proposalTemplate.createMany({ data: toCreate });
    created = result.count;
    for (const row of toCreate) existingNames.add(row.name);
  }

  const totalActive = await prisma.proposalTemplate.count({
    where: { tenantId, isActive: true },
  });

  const nextOffset = offset + slice.length;
  const hasMore = nextOffset < packages.length;

  return {
    packageCount: packages.length,
    catalogueCount: catalogue.length,
    created,
    skipped,
    skippedNoServices,
    totalActive,
    offset,
    processed: slice.length,
    hasMore,
    warnings,
  };
}

export async function sanityCheckTemplatePricing(
  tenantId: string
): Promise<TemplatePricingSanityResult> {
  const [templates, catalogue] = await Promise.all([
    prisma.proposalTemplate.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, serviceConfig: true },
    }),
    prisma.serviceTemplate.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, basePrice: true },
    }),
  ]);

  const catalogueById = new Map(catalogue.map((s) => [s.id, s]));
  const bands = cataloguePriceBands();

  const mismatches: TemplatePricingMismatch[] = [];
  const missingServiceIds: TemplatePricingSanityResult['missingServiceIds'] = [];
  const zeroOrNegativePrices: TemplatePricingSanityResult['zeroOrNegativePrices'] = [];
  const outOfBandPrices: TemplatePricingSanityResult['outOfBandPrices'] = [];

  const allPrices: number[] = [];
  let servicesChecked = 0;

  for (const template of templates) {
    const items = parseServiceConfig(template.serviceConfig);
    for (const item of items) {
      servicesChecked++;
      const price = Number(item.displayPrice);
      allPrices.push(price);

      if (!Number.isFinite(price) || price <= 0) {
        zeroOrNegativePrices.push({
          templateId: template.id,
          templateName: template.name,
          serviceName: item.name || 'unknown',
          price,
        });
        continue;
      }

      const cat = catalogueById.get(item.serviceId);
      if (!cat) {
        missingServiceIds.push({
          templateId: template.id,
          templateName: template.name,
          serviceId: item.serviceId,
        });
        continue;
      }

      if (Math.abs(price - cat.basePrice) > 0.01) {
        mismatches.push({
          templateId: template.id,
          templateName: template.name,
          serviceId: item.serviceId,
          serviceName: cat.name,
          templatePrice: price,
          cataloguePrice: cat.basePrice,
        });
      }

      const band = bands.get(cat.name);
      if (band && (price < band.min || price > band.max)) {
        outOfBandPrices.push({
          templateId: template.id,
          templateName: template.name,
          serviceName: cat.name,
          price,
          expectedMin: band.min,
          expectedMax: band.max,
        });
      }
    }
  }

  const sorted = [...allPrices].sort((a, b) => a - b);
  const median =
    sorted.length === 0
      ? 0
      : sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];

  const passed =
    mismatches.length === 0 &&
    missingServiceIds.length === 0 &&
    zeroOrNegativePrices.length === 0;

  return {
    templatesChecked: templates.length,
    servicesChecked,
    mismatches,
    missingServiceIds,
    zeroOrNegativePrices,
    outOfBandPrices,
    priceBands: {
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      median,
    },
    passed,
  };
}

export function getExpectedPackageCount(): number {
  return getUkProposalTemplatePackageCount();
}