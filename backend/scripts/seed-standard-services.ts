/**
 * Upsert standard catalogue services for every tenant (idempotent).
 * Usage: DATABASE_URL=... npx tsx scripts/seed-standard-services.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STANDARD_SERVICES = [
  {
    name: 'DEXT Subscription',
    description:
      'Dext Prepare monthly subscription — automated receipt and invoice capture for your bookkeeping.',
    longDescription:
      'Monthly Dext Prepare licence including automated document capture, supplier matching, and publish to your accounting software.',
    category: 'BOOKKEEPING' as const,
    basePrice: 29,
    priceAmount: 29,
    billingCycle: 'MONTHLY' as const,
    defaultFrequency: 'MONTHLY' as const,
    frequencyOptions: 'MONTHLY',
    tags: 'dext,bookkeeping,subscription',
    isPopular: true,
  },
  {
    name: 'End of Year Accounts',
    description: 'Annual statutory accounts preparation, review, and filing with Companies House.',
    longDescription:
      'Year-end financial statements prepared in accordance with applicable reporting standards, partner review, and submission to Companies House.',
    category: 'COMPLIANCE' as const,
    basePrice: 850,
    priceAmount: 850,
    billingCycle: 'ANNUALLY' as const,
    defaultFrequency: 'ANNUALLY' as const,
    frequencyOptions: 'ANNUALLY',
    tags: 'year-end,accounts,compliance',
    isPopular: true,
  },
];

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  let created = 0;
  let skipped = 0;

  for (const tenant of tenants) {
    for (const svc of STANDARD_SERVICES) {
      const existing = await prisma.serviceTemplate.findFirst({
        where: { tenantId: tenant.id, name: svc.name },
      });
      if (existing) {
        skipped++;
        continue;
      }
      await prisma.serviceTemplate.create({
        data: {
          ...svc,
          tenantId: tenant.id,
          applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,LLP,PARTNERSHIP',
          complexityFactors: '[]',
          requirements: '[]',
          deliverables: '[]',
          pricingModel: 'FIXED',
          isActive: true,
        },
      });
      created++;
      console.log(`Created "${svc.name}" for ${tenant.name}`);
    }
  }

  console.log(`Done — created ${created}, skipped ${skipped} (already existed).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
