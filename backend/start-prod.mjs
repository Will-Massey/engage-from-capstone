/**
 * Production Startup Script (ESM)
 * Optimized for Render free-tier deployment
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve prisma CLI path without npx overhead
const prismaPath = [
  join(__dirname, 'node_modules', '.bin', 'prisma'),
  join(__dirname, '..', 'node_modules', '.bin', 'prisma'),
  join(__dirname, 'node_modules', 'prisma', 'build', 'index.js'),
  join(__dirname, '..', 'node_modules', 'prisma', 'build', 'index.js'),
].find((p) => existsSync(p));

const prismaCmd = prismaPath || 'npx prisma';

function run(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  return execSync(cmd, {
    stdio: 'inherit',
    timeout: 30000,
    killSignal: 'SIGTERM',
    cwd: __dirname,
    env: { ...process.env, PRISMA_GENERATE_SKIP_AUTOINSTALL: 'true' },
    ...opts,
  });
}

console.log('========================================');
console.log('🚀 Engage Backend Starting...');
console.log('========================================');

// Resolve any failed migrations first (fast timeout)
console.log('🗄️  Checking for failed migrations...');
try {
  run(`${prismaCmd} migrate resolve --rolled-back "20260410_data_migration_v2_pricing"`, {
    timeout: 15000,
    stdio: 'pipe',
  });
  console.log('✅ Marked failed migration as rolled back');
} catch (resolveError) {
  console.log('ℹ️  Migration resolve: already resolved or not needed');
}

// Run database migrations
console.log('🗄️  Running database migrations...');
try {
  run(`${prismaCmd} migrate deploy`, { timeout: 60000 });
  console.log('✅ Migrations complete');
} catch (error) {
  console.warn('⚠️  Migration issue (continuing anyway):', error.message);
  console.log('🚀 Starting server despite migration warnings...');
}

// Seed UK accountancy services (non-blocking, ignore failures)
console.log('🌱 Checking UK service catalog...');
try {
  run('node ./scripts/seed-uk-services.js', { timeout: 30000, stdio: 'pipe' });
  console.log('✅ Seed check complete');
} catch (error) {
  console.warn('⚠️  Seed check warning:', error.message || error);
}

// Fix billingCycle for existing services (ignore failures)
console.log('🔧 Checking billingCycle field...');
try {
  run('node ./scripts/fix-billing-cycle.js', { timeout: 30000, stdio: 'pipe' });
  console.log('✅ Billing cycle fix complete');
} catch (error) {
  console.warn('⚠️  Billing cycle fix warning:', error.message || error);
}

console.log('🚀 Loading server...');

// Import and start the server (ESM)
try {
  await import('./dist/index.js');
} catch (err) {
  console.error('❌ Server failed to start:', err.message);
  process.exit(1);
}
