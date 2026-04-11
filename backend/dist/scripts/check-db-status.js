"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_js_1 = require("../config/database.js");
const logger_js_1 = __importDefault(require("../config/logger.js"));
async function checkDatabaseStatus() {
    logger_js_1.default.info('Checking database status...');
    try {
        // Test basic connection
        const result = await database_js_1.prisma.$queryRaw `SELECT NOW()`;
        logger_js_1.default.info('✅ Database connection: OK');
        logger_js_1.default.info(`   Server time: ${result[0].now}`);
        // Check if new pricing fields exist
        try {
            const testProposal = await database_js_1.prisma.proposalService.findFirst({
                select: {
                    id: true,
                    displayPrice: true,
                    billingFrequency: true,
                    vatRate: true,
                },
            });
            if (testProposal) {
                logger_js_1.default.info('✅ New pricing fields exist in database');
                logger_js_1.default.info(`   Sample: displayPrice=${testProposal.displayPrice}, billingFrequency=${testProposal.billingFrequency}`);
            }
            else {
                logger_js_1.default.info('⚠️  No proposal services found (empty table)');
            }
        }
        catch (error) {
            logger_js_1.default.error('❌ New pricing fields MISSING - migration needed!');
            logger_js_1.default.error(`   Error: ${error.message}`);
            // Check which columns exist
            logger_js_1.default.info('\nChecking existing columns...');
            try {
                const columns = await database_js_1.prisma.$queryRaw `
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'ProposalService'
          ORDER BY column_name
        `;
                logger_js_1.default.info('Existing columns in ProposalService:');
                columns.forEach((col) => {
                    logger_js_1.default.info(`   - ${col.column_name}`);
                });
            }
            catch (e) {
                logger_js_1.default.error('Could not query column information');
            }
        }
        // Check proposals table
        const proposalCount = await database_js_1.prisma.proposal.count();
        logger_js_1.default.info(`\n📊 Statistics:`);
        logger_js_1.default.info(`   Proposals: ${proposalCount}`);
        logger_js_1.default.info(`   Clients: ${await database_js_1.prisma.client.count()}`);
        logger_js_1.default.info(`   Services: ${await database_js_1.prisma.serviceTemplate.count()}`);
        logger_js_1.default.info(`   Users: ${await database_js_1.prisma.user.count()}`);
    }
    catch (error) {
        logger_js_1.default.error('❌ Database connection failed!');
        logger_js_1.default.error(`   Error: ${error.message}`);
    }
    finally {
        await database_js_1.prisma.$disconnect();
    }
}
checkDatabaseStatus();
//# sourceMappingURL=check-db-status.js.map