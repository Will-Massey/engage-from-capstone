"use strict";
/**
 * Startup Script - Runs migrations before starting server
 * For Render free tier (no shell access)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const client_1 = require("@prisma/client");
const logger_1 = __importDefault(require("../utils/logger"));
const prisma = new client_1.PrismaClient();
async function main() {
    try {
        // Test database connection
        logger_1.default.info('🔌 Testing database connection...');
        await prisma.$connect();
        await prisma.$queryRaw `SELECT 1`;
        logger_1.default.info('✅ Database connected');
        // Run migrations
        logger_1.default.info('🗄️  Running database migrations...');
        try {
            (0, child_process_1.execSync)('npx prisma migrate deploy', {
                stdio: 'pipe',
                timeout: 60000
            });
            logger_1.default.info('✅ Migrations completed');
        }
        catch (error) {
            // Migrations might already be applied, that's ok
            if (error.message?.includes('already exists') || error.stderr?.includes('already exists')) {
                logger_1.default.info('✅ Migrations already up to date');
            }
            else {
                logger_1.default.warn('⚠️  Migration warning:', error.message);
            }
        }
        // Seed if no users exist
        const userCount = await prisma.user.count();
        if (userCount === 0) {
            logger_1.default.info('🌱 No users found, seeding database...');
            try {
                (0, child_process_1.execSync)('npx prisma db seed', {
                    stdio: 'pipe',
                    timeout: 60000
                });
                logger_1.default.info('✅ Database seeded');
            }
            catch (error) {
                logger_1.default.warn('⚠️  Seed warning:', error.message);
            }
        }
        logger_1.default.info('🚀 Startup complete');
    }
    catch (error) {
        logger_1.default.error('❌ Startup failed:', error);
        process.exit(1);
    }
    finally {
        await prisma.$disconnect();
    }
}
main();
//# sourceMappingURL=startup.js.map