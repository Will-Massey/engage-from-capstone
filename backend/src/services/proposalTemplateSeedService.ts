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

export interface SeedProposalTemplatesResult {
  packageCount: number;
  catalogueCount: number;
  created: number;
  skipped: number;
  skippedNoServices: number;
  totalActive: number;
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

export async function seedProposalTemplatesForTenant(
  tenantId: string,
  userId: string
): Promise<SeedProposalTemplatesResult> {
  const catalogue = await prisma.serviceTemplate.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true, billingCycle: true, basePrice: true },
  });
  const byName = new Map(catalogue.map((s) => [s.name, s]));

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
  let created = 0;
  let skipped = 0;
  let skippedNoServices = 0;

  for (const pkg of packages) {
    const existing = await prisma.proposalTemplate.findFirst({
      where: { tenantId, name: pkg.name, isActive: true },
    });
    if (existing) {
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

    await prisma.proposalTemplate.create({
      data: {
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
      },
    });
    created++;
  }

  const totalActive = await prisma.proposalTemplate.count({
    where: { tenantId, isActive: true },
  });

  return {
    packageCount: packages.length,
    catalogueCount: catalogue.length,
    created,
    skipped,
    skippedNoServices,
    totalActive,
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