/**
 * Seed sensible default TouchpointTemplates for a tenant.
 * Run with: tsx src/scripts/seed-touchpoint-templates.ts <tenantId>
 */
import { prisma } from '../config/database.js';
import { ensureTouchpointTemplatesForTenant } from '../services/touchpointTemplateSeedService.js';

async function main() {
  const tenantId = process.argv[2];
  if (!tenantId) {
    console.error('Usage: tsx src/scripts/seed-touchpoint-templates.ts <tenantId>');
    process.exit(1);
  }

  const result = await ensureTouchpointTemplatesForTenant(tenantId, {
    fillMissingOnly: false,
    upgradePlaceholders: true,
  });

  console.log(
    `Touchpoint templates for tenant ${tenantId}: created=${result.created} updated=${result.updated} skipped=${result.skipped} total=${result.total}`
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
