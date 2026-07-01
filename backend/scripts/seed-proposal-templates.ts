/**
 * W3.2 — Seed 100+ ICAEW/ACCA-aligned proposal templates per tenant.
 * Run: npx tsx scripts/seed-proposal-templates.ts
 */
import { PrismaClient } from '@prisma/client';
import { getUkProposalTemplatePackages } from '../src/data/ukProposalTemplatePackages.js';
import { getCurrentVersionId } from '../src/services/engagementLibraryVersionService.js';

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

  const catalogue = await prisma.serviceTemplate.findMany({
    where: { tenantId: tenant.id, isActive: true },
    select: { id: true, name: true, billingCycle: true, basePrice: true },
  });
  const byName = new Map(catalogue.map((s) => [s.name, s]));

  if (catalogue.length < 5) {
    console.warn('⚠️  Few services in catalogue — run seedServices.ts first for best template coverage');
  }

  let libraryVersionId: string | null = null;
  try {
    libraryVersionId = await getCurrentVersionId();
  } catch {
    libraryVersionId = null;
  }

  const packages = getUkProposalTemplatePackages();
  console.log(`📦 Seeding up to ${packages.length} proposal templates for ${tenant.name}…\n`);

  let created = 0;
  let skipped = 0;

  for (const pkg of packages) {
    const existing = await prisma.proposalTemplate.findFirst({
      where: { tenantId: tenant.id, name: pkg.name, isActive: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const serviceConfig: Array<{
      serviceId: string;
      name: string;
      billingFrequency: string;
      displayPrice: number;
      quantity: number;
    }> = [];

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
      continue;
    }

    await prisma.proposalTemplate.create({
      data: {
        tenantId: tenant.id,
        createdById: admin.id,
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

  const total = await prisma.proposalTemplate.count({
    where: { tenantId: tenant.id, isActive: true },
  });

  console.log(`✅ Created: ${created}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`📊 Active templates for tenant: ${total}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());