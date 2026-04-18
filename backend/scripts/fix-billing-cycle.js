/**
 * Fix billingCycle field for existing services
 * Run: node ./scripts/fix-billing-cycle.js
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Fixing billingCycle for existing services...');

  // First check if billingCycle column exists
  try {
    const tableInfo = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'ServiceTemplate' 
      AND column_name = 'billingCycle'
    `;

    if (tableInfo.length === 0) {
      console.log('⚠️  billingCycle column not found in database.');
      console.log('Please run: npx prisma migrate deploy');
      return;
    }
  } catch (e) {
    console.error('❌ Error checking for billingCycle column:', e);
    return;
  }

  // billingCycle is non-null in schema — do not query `billingCycle: null` (Prisma validation error)
  const services = await prisma.serviceTemplate.findMany({
    where: { isActive: true },
  });

  console.log(`Found ${services.length} services to check`);

  let updated = 0;
  for (const service of services) {
    // Map defaultFrequency to billingCycle
    const targetBillingCycle = service.defaultFrequency;

    if (service.billingCycle !== targetBillingCycle) {
      await prisma.serviceTemplate.update({
        where: { id: service.id },
        data: { billingCycle: targetBillingCycle },
      });
      console.log(`✅ Updated: ${service.name} -> ${targetBillingCycle}`);
      updated++;
    }
  }

  console.log(`\n✅ Done! Updated ${updated} services`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
