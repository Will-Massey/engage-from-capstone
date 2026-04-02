/**
 * Production Startup Script
 * Runs migrations then starts the server
 */

const { execSync } = require('child_process');
const http = require('http');

console.log('🗄️  Running database migrations...');

try {
  execSync('npx prisma migrate deploy', { 
    stdio: 'inherit',
    timeout: 120000
  });
  console.log('✅ Migrations complete');
} catch (error) {
  // If migrations fail, log but don't exit - they might already be applied
  console.warn('⚠️  Migration warning (may already be applied):', error.message);
  console.log('🚀 Continuing to start server...');
}

console.log('🚀 Starting server...');
try {
  require('./dist/index.js');
} catch (error) {
  console.error('❌ Failed to start server:', error.message);
  console.error(error.stack);
  process.exit(1);
}
