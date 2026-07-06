/**
 * Idempotent UK service catalogue import per tenant.
 * Required before the Engage proposal template library can seed (templates resolve services by name).
 */
import { prisma } from '../config/database.js';
import { allServices } from '../data/ukAccountancyServices.js';

export interface CatalogueSeedResult {
  imported: number;
  skipped: number;
  errors: string[];
  activeCount: number;
}

export async function countActiveServicesForTenant(tenantId: string): Promise<number> {
  return prisma.serviceTemplate.count({
    where: { tenantId, isActive: true },
  });
}

/** Minimum catalogue rows before template packages can resolve (full library needs ~20+ UK services). */
export function getMinimumCatalogueForLibrary(): number {
  return Math.min(20, allServices.length);
}

/**
 * Import missing rows from ukAccountancyServices — never deletes or overwrites custom services.
 */
export async function ensureTenantUkServiceCatalogue(
  tenantId: string,
  options?: { category?: string }
): Promise<CatalogueSeedResult> {
  let servicesToImport = allServices;
  if (options?.category) {
    servicesToImport = servicesToImport.filter((s) => s.category === options.category);
  }

  const results: CatalogueSeedResult = {
    imported: 0,
    skipped: 0,
    errors: [],
    activeCount: 0,
  };

  for (const catalogService of servicesToImport) {
    try {
      const existing = await prisma.serviceTemplate.findFirst({
        where: { tenantId, name: catalogService.name },
      });

      if (existing) {
        results.skipped++;
        continue;
      }

      await prisma.serviceTemplate.create({
        data: {
          tenantId,
          category: catalogService.category as any,
          subcategory: catalogService.subcategory,
          name: catalogService.name,
          description: catalogService.description,
          longDescription: catalogService.longDescription,
          basePrice: catalogService.basePrice,
          baseHours: catalogService.baseHours,
          pricingModel: catalogService.pricingModel,
          billingCycle: catalogService.billingCycle,
          vatRate: catalogService.vatRate,
          isVatApplicable: catalogService.isVatApplicable,
          frequencyOptions: catalogService.frequencyOptions.join(','),
          defaultFrequency: catalogService.defaultFrequency as any,
          applicableEntityTypes: catalogService.applicableEntityTypes.join(','),
          complexityFactors: JSON.stringify(catalogService.complexityFactors),
          requirements: JSON.stringify(catalogService.requirements),
          deliverables: JSON.stringify(catalogService.deliverables),
          regulatoryNotes: catalogService.regulatoryNotes,
          tags: catalogService.tags.join(','),
          isPopular: catalogService.isPopular,
          isActive: true,
        },
      });

      results.imported++;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      results.errors.push(`Failed to import ${catalogService.name}: ${message}`);
    }
  }

  results.activeCount = await countActiveServicesForTenant(tenantId);
  return results;
}
