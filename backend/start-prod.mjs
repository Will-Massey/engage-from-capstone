/**
 * Production Startup Script (ESM)
 */

import { execSync } from 'child_process';

console.log('========================================');
console.log('🚀 Engage Backend Starting...');
console.log('========================================');

// Run migrations with shorter timeout to fail fast
console.log('🗄️  Running database migrations...');
try {
  execSync('npx prisma migrate deploy', { 
    stdio: 'inherit',
    timeout: 60000 // 60 seconds - fail fast if DB is down
  });
  console.log('✅ Migrations complete');
} catch (error) {
  console.warn('⚠️  Migration failed (DB may be down):', error.message);
  console.log('🚀 Starting server anyway - will retry on requests...');
}

// Seed UK accountancy services (non-blocking)
console.log('🌱 Checking UK service catalog...');
try {
  execSync('node ./scripts/seed-uk-services.js', {
    stdio: 'inherit',
    timeout: 30000, // 30 seconds
  });
  console.log('✅ Seed check complete');
} catch (error) {
  console.warn('⚠️  Seed check warning:', error.message);
}

// Fix billingCycle for existing services
console.log('🔧 Checking billingCycle field...');
try {
  execSync('node ./scripts/fix-billing-cycle.js', {
    stdio: 'inherit',
    timeout: 30000,
  });
  console.log('✅ Billing cycle fix complete');
} catch (error) {
  console.warn('⚠️  Billing cycle fix warning:', error.message);
}

console.log('🚀 Loading server...');

// Import and start the server (ESM)
await import('./dist/index.js');
