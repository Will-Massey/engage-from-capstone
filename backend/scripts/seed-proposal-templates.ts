/**
 * W3.2 — Seed 100+ ICAEW/ACCA-aligned proposal templates per tenant.
 * Run: npm run db:seed:templates
 */
import { PrismaClient } from '@prisma/client';
import {
  seedProposalTemplatesForTenant,
  sanityCheckTemplatePricing,
  getExpectedPackageCount,
} from '../src/services/proposalTemplateSeedService.js';

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!tenant) {
    console.error('No tenant found');
    process.exit(1);
  }

  const admin = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: { in: ['ADMIN', 'PARTNER'] } },
    orderBy: { createdAt: 'asc' },
  });
  if (!admin) {
    console.error('No admin/partner user for tenant');
    process.exit(1);
  }

  console.log(`📦 Seeding up to ${getExpectedPackageCount()} proposal templates for ${tenant.name}…\n`);

  const seed = await seedProposalTemplatesForTenant(tenant.id, admin.id);
  const sanity = await sanityCheckTemplatePricing(tenant.id);

  for (const w of seed.warnings) {
    console.warn(`⚠️  ${w}`);
  }

  console.log(`✅ Created: ${seed.created}`);
  console.log(`⏭️  Skipped: ${seed.skipped} (${seed.skippedNoServices} with no matching services)`);
  console.log(`📊 Active templates for tenant: ${seed.totalActive}`);
  console.log(`📋 Catalogue services: ${seed.catalogueCount}`);
  console.log(
    `💷 Pricing sanity: ${sanity.passed ? 'PASS' : 'FAIL'} — ${sanity.servicesChecked} line items, ` +
      `${sanity.mismatches.length} mismatches, ${sanity.missingServiceIds.length} missing IDs`
  );

  if (sanity.mismatches.length) {
    console.log('\nSample mismatches:');
    for (const m of sanity.mismatches.slice(0, 5)) {
      console.log(`  - ${m.templateName} / ${m.serviceName}: template £${m.templatePrice} vs catalogue £${m.cataloguePrice}`);
    }
  }

  console.log(
    `\nPrice bands: min £${sanity.priceBands.min}, median £${sanity.priceBands.median}, max £${sanity.priceBands.max}`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());