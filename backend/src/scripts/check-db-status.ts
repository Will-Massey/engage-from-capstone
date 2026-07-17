import { prisma } from '../config/database.js';
import logger from '../config/logger.js';

async function checkDatabaseStatus() {
  logger.info('Checking database status...');

  try {
    // Test basic connection
    const result = await prisma.$queryRaw`SELECT NOW()`;
    logger.info('✅ Database connection: OK');
    logger.info(`   Server time: ${result[0].now}`);

    // Check if new pricing fields exist
    try {
      const testProposal = await prisma.proposalService.findFirst({
        select: {
          id: true,
          displayPricePence: true,
          billingFrequency: true,
          vatRate: true,
        },
      });

      if (testProposal) {
        logger.info('✅ New pricing fields exist in database');
        logger.info(
          `   Sample: displayPricePence=${testProposal.displayPricePence}, billingFrequency=${testProposal.billingFrequency}`
        );
      } else {
        logger.info('⚠️  No proposal services found (empty table)');
      }
    } catch (error: any) {
      logger.error('❌ New pricing fields MISSING - migration needed!');
      logger.error(`   Error: ${error.message}`);

      // Check which columns exist
      logger.info('\nChecking existing columns...');
      try {
        const columns = await prisma.$queryRaw`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'ProposalService'
          ORDER BY column_name
        `;
        logger.info('Existing columns in ProposalService:');
        (columns as any[]).forEach((col: any) => {
          logger.info(`   - ${col.column_name}`);
        });
      } catch (e) {
        logger.error('Could not query column information');
      }
    }

    // Check proposals table
    const proposalCount = await prisma.proposal.count();
    logger.info(`\n📊 Statistics:`);
    logger.info(`   Proposals: ${proposalCount}`);
    logger.info(`   Clients: ${await prisma.client.count()}`);
    logger.info(`   Services: ${await prisma.serviceTemplate.count()}`);
    logger.info(`   Users: ${await prisma.user.count()}`);
  } catch (error: any) {
    logger.error('❌ Database connection failed!');
    logger.error(`   Error: ${error.message}`);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabaseStatus();
