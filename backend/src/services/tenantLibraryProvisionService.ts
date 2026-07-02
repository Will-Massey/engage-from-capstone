/**
 * Provision Engage UK catalogue + proposal template library for a tenant.
 * Idempotent — safe on signup, first login, and GET /proposal-templates.
 */
import logger from '../config/logger.js';
import { ensureTenantUkServiceCatalogue } from './catalogueSeedService.js';
import {
  backfillLibraryTemplateFlagsForTenant,
  countLibraryTemplatesForTenant,
  ensureProposalTemplateLibraryForTenant,
  getExpectedPackageCount,
  seedProposalTemplatesForTenant,
} from './proposalTemplateSeedService.js';

export interface TenantLibraryProvisionResult {
  catalogueImported: number;
  libraryActive: number;
  expectedLibrary: number;
  libraryComplete: boolean;
}

/** Full provision — used on tenant signup and ops scripts. */
export async function provisionTenantEngageLibrary(
  tenantId: string,
  userId: string
): Promise<TenantLibraryProvisionResult> {
  const expected = getExpectedPackageCount();

  const catalogue = await ensureTenantUkServiceCatalogue(tenantId);
  await backfillLibraryTemplateFlagsForTenant(tenantId);
  await ensureProposalTemplateLibraryForTenant(tenantId, userId);

  const libraryActive = await countLibraryTemplatesForTenant(tenantId);
  return {
    catalogueImported: catalogue.imported,
    libraryActive,
    expectedLibrary: expected,
    libraryComplete: libraryActive >= expected,
  };
}

/** Bounded batches per HTTP request — avoids Render timeouts on large seeds. */
export async function provisionTenantEngageLibraryBatched(
  tenantId: string,
  userId: string,
  options: { maxBatches?: number; batchSize?: number } = {}
): Promise<TenantLibraryProvisionResult> {
  const expected = getExpectedPackageCount();
  const maxBatches = options.maxBatches ?? 4;
  const batchSize = options.batchSize ?? 50;

  const catalogue = await ensureTenantUkServiceCatalogue(tenantId);
  await backfillLibraryTemplateFlagsForTenant(tenantId);

  let offset = 0;
  for (let i = 0; i < maxBatches; i++) {
    const libraryActive = await countLibraryTemplatesForTenant(tenantId);
    if (libraryActive >= expected) break;

    const batch = await seedProposalTemplatesForTenant(tenantId, userId, {
      offset,
      limit: batchSize,
    });
    offset += batch.processed;
    if (!batch.hasMore) break;
  }

  const libraryActive = await countLibraryTemplatesForTenant(tenantId);
  return {
    catalogueImported: catalogue.imported,
    libraryActive,
    expectedLibrary: expected,
    libraryComplete: libraryActive >= expected,
  };
}

export function scheduleTenantLibraryProvision(tenantId: string, userId: string): void {
  void provisionTenantEngageLibrary(tenantId, userId).catch((err) => {
    logger.error('Tenant library provision failed', { tenantId, userId, err });
  });
}