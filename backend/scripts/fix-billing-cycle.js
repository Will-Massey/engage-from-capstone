/**
 * Fix billingCycle field for existing services
 * Run: node ./scripts/fix-billing-cycle.js
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Fixing billingCycle for existing services...');
  
  // Find all services where billingCycle doesn't match defaultFrequency
  const services = await prisma.serviceTemplate.findMany({
    where: {
      OR: [
        { billingCycle: null },
        { billingCycle: 'MONTHLY' }
      ]
    }
  });
  
  console.log(`Found ${services.length} services to check`);
  
  let updated = 0;
  for (const service of services) {
    // Map defaultFrequency to billingCycle
    const targetBillingCycle = service.defaultFrequency;
    
    if (service.billingCycle !== targetBillingCycle) {
      await prisma.serviceTemplate.update({
        where: { id: service.id },
        data: { billingCycle: targetBillingCycle }
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
