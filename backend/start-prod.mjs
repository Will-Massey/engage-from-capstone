/**
 * Production Startup Script (ESM)
 */

import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

console.log('========================================');
console.log('🚀 Engage Backend Starting...');
console.log('========================================');

// First, ensure database columns exist before running migrations
console.log('🔧 Checking database schema...');
const prisma = new PrismaClient();

try {
  // Check if billingCycle column exists
  const result = await prisma.$queryRaw`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'ServiceTemplate' 
    AND column_name = 'billingCycle'
  `;
  
  if (result.length === 0) {
    console.log('⚠️  billingCycle column missing. Adding...');
    await prisma.$executeRaw`ALTER TABLE "ServiceTemplate" ADD COLUMN "billingCycle" TEXT DEFAULT 'MONTHLY'`;
    console.log('✅ Added billingCycle column');
  } else {
    console.log('✅ billingCycle column exists');
  }

  // Check if priceDisplayMode column exists
  const result2 = await prisma.$queryRaw`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'ServiceTemplate' 
    AND column_name = 'priceDisplayMode'
  `;
  
  if (result2.length === 0) {
    console.log('⚠️  priceDisplayMode column missing. Adding...');
    await prisma.$executeRaw`ALTER TABLE "ServiceTemplate" ADD COLUMN "priceDisplayMode" TEXT DEFAULT 'PER_MONTH'`;
    console.log('✅ Added priceDisplayMode column');
  } else {
    console.log('✅ priceDisplayMode column exists');
  }
  
  await prisma.$disconnect();
} catch (e) {
  console.error('❌ Schema fix error:', e.message);
  await prisma.$disconnect();
}

// Check and resolve any failed migrations first
console.log('🗄️  Checking for failed migrations...');
try {
  // Try to mark the known failed migration as rolled back (ignore errors)
  try {
    execSync('npx prisma migrate resolve --rolled-back "20260410_data_migration_v2_pricing"', {
      stdio: 'pipe',
      timeout: 30000
    });
    console.log('✅ Marked failed migration as rolled back');
  } catch (resolveError) {
    // Migration might already be resolved or not exist - continue
    console.log('ℹ️  Migration resolve: already resolved or not needed');
  }
  
  // Now run the actual migration deploy
  console.log('🗄️  Running database migrations...');
  execSync('npx prisma migrate deploy', { 
    stdio: 'pipe',
    timeout: 60000
  });
  console.log('✅ Migrations complete');
} catch (error) {
  console.warn('⚠️  Migration issue (continuing anyway):', error.message);
  console.log('🚀 Starting server despite migration warnings...');
}

// Seed UK accountancy services (non-blocking)
console.log('🌱 Checking UK service catalog...');
try {
  execSync('node ./scripts/seed-uk-services.js', {
    stdio: 'pipe',
    timeout: 30000,
  });
  console.log('✅ Seed check complete');
} catch (error) {
  console.warn('⚠️  Seed check warning:', error.message);
}

// Fix billingCycle for existing services (skip if column doesn't exist yet)
console.log('🔧 Checking billingCycle field...');
try {
  execSync('node ./scripts/fix-billing-cycle.js', {
    stdio: 'pipe',
    timeout: 30000,
  });
  console.log('✅ Billing cycle fix complete');
} catch (error) {
  console.warn('⚠️  Billing cycle fix warning:', error.message);
}

console.log('🚀 Loading server...');

// Import and start the server (ESM)
await import('./dist/index.js');
