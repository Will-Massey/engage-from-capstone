/**
 * Script to migrate existing service templates to new pricing system
 * Copies basePrice -> priceAmount and defaultFrequency -> billingCycle
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateServicePricing() {
  console.log('🚀 Starting service pricing migration...\n');

  try {
    // Get all services that need updating
    const services = await prisma.serviceTemplate.findMany({
      where: {
        OR: [
          { priceAmount: 0 },
          { priceAmount: null },
        ],
      },
    });

    console.log(`Found ${services.length} services to migrate\n`);

    let updated = 0;
    let skipped = 0;

    for (const service of services) {
      try {
        // Skip if basePrice is also 0 (service has no price)
        if (!service.basePrice || service.basePrice === 0) {
          console.log(`⏭️  Skipping ${service.name} - no base price`);
          skipped++;
          continue;
        }

        // Map legacy frequency to billing cycle
        let billingCycle: any = service.defaultFrequency || 'MONTHLY';
        
        // ONE_TIME is not a valid BillingCycle, map to MONTHLY
        if (billingCycle === 'ONE_TIME') {
          billingCycle = 'MONTHLY';
        }
        
        // Update the service
        await prisma.serviceTemplate.update({
          where: { id: service.id },
          data: {
            priceAmount: service.basePrice,
            billingCycle: billingCycle,
            // Map priceDisplayMode based on billingCycle
            priceDisplayMode: (billingCycle === 'ANNUALLY' ? 'PER_YEAR' : 
                             billingCycle === 'QUARTERLY' ? 'PER_QUARTER' :
                             billingCycle === 'ONE_TIME' ? 'ONE_TIME' : 'PER_MONTH') as any,
          },
        });

        console.log(`✅ Updated ${service.name}: £${service.basePrice} ${billingCycle}`);
        updated++;
      } catch (error) {
        console.error(`❌ Failed to update ${service.name}:`, error);
        skipped++;
      }
    }

    console.log(`\n📊 Migration complete:`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Total: ${services.length}`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  migrateServicePricing();
}

export default migrateServicePricing;
