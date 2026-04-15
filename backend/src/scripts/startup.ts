/**
 * Startup Script - Runs migrations before starting server
 * For Render free tier (no shell access)
 */

import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';

const prisma = new PrismaClient();

async function main() {
  try {
    // Test database connection
    logger.info('🔌 Testing database connection...');
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    logger.info('✅ Database connected');

    // Run migrations
    logger.info('🗄️  Running database migrations...');
    try {
      execSync('npx prisma migrate deploy', {
        stdio: 'pipe',
        timeout: 60000,
      });
      logger.info('✅ Migrations completed');
    } catch (error: any) {
      // Migrations might already be applied, that's ok
      if (error.message?.includes('already exists') || error.stderr?.includes('already exists')) {
        logger.info('✅ Migrations already up to date');
      } else {
        logger.warn('⚠️  Migration warning:', error.message);
      }
    }

    // Seed if no users exist
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      logger.info('🌱 No users found, seeding database...');
      try {
        execSync('npx prisma db seed', {
          stdio: 'pipe',
          timeout: 60000,
        });
        logger.info('✅ Database seeded');
      } catch (error: any) {
        logger.warn('⚠️  Seed warning:', error.message);
      }
    }

    logger.info('🚀 Startup complete');
  } catch (error) {
    logger.error('❌ Startup failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
