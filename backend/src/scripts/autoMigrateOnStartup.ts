/**
 * Auto-migration on startup
 * Runs data migration silently on server start
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function autoMigrateOnStartup() {
  console.log('[AutoMigrate] Checking if data migration is needed...');
  
  try {
    // Check if any services need migration
    const servicesNeedingMigration = await prisma.serviceTemplate.count({
      where: {
        OR: [
          { priceAmount: 0 },
          { priceAmount: null },
        ],
        basePrice: {
          gt: 0,
        },
      },
    });
    
    if (servicesNeedingMigration === 0) {
      console.log('[AutoMigrate] No services need migration. Skipping.');
      return;
    }
    
    console.log(`[AutoMigrate] Found ${servicesNeedingMigration} services to migrate...`);
    
    // Get services that need updating
    const services = await prisma.serviceTemplate.findMany({
      where: {
        OR: [
          { priceAmount: 0 },
          { priceAmount: null },
        ],
        basePrice: {
          gt: 0,
        },
      },
    });
    
    let updated = 0;
    
    for (const service of services) {
      try {
        // Map legacy frequency to billing cycle
        let billingCycle: any = service.defaultFrequency || 'MONTHLY';
        
        // ONE_TIME is not a valid BillingCycle, map to MONTHLY
        if (billingCycle === 'ONE_TIME') {
          billingCycle = 'MONTHLY';
        }
        
        // Determine price display mode
        let priceDisplayMode: any = 'PER_MONTH';
        switch (billingCycle) {
          case 'ANNUALLY': priceDisplayMode = 'PER_YEAR'; break;
          case 'QUARTERLY': priceDisplayMode = 'PER_QUARTER'; break;
          case 'ONE_TIME': priceDisplayMode = 'ONE_TIME'; break;
        }
        
        // Update the service
        await prisma.serviceTemplate.update({
          where: { id: service.id },
          data: {
            priceAmount: service.basePrice,
            billingCycle: billingCycle,
            priceDisplayMode: priceDisplayMode,
          },
        });
        
        updated++;
      } catch (error) {
        console.error(`[AutoMigrate] Failed to update ${service.name}:`, error);
      }
    }
    
    console.log(`[AutoMigrate] Migration complete: ${updated}/${services.length} services updated`);
    
  } catch (error) {
    console.error('[AutoMigrate] Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  autoMigrateOnStartup();
}

export default autoMigrateOnStartup;
