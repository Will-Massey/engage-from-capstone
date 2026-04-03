/**
 * Production seed guard
 * Only runs prisma db seed if the database has no service templates.
 * Safe to run on every startup — it will never wipe existing data.
 */

const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');

async function main() {
  const prisma = new PrismaClient();
  try {
    const count = await prisma.serviceTemplate.count();
    if (count === 0) {
      console.log('🌱 No services found. Running database seed...');
      execSync('npx prisma db seed', { stdio: 'inherit', timeout: 120000 });
      console.log('✅ Seed complete');
    } else {
      console.log(`✅ Database already has ${count} services. Skipping seed.`);
    }
  } catch (error) {
    console.error('⚠️ Seed check failed:', error.message);
    // Don't crash the app — continue startup
  } finally {
    await prisma.$disconnect();
  }
}

main();
