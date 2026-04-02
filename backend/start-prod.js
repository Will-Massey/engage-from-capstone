/**
 * Production Startup Script
 * Runs migrations then starts the server
 */

const { execSync } = require('child_process');

console.log('🗄️  Running database migrations...');

try {
  execSync('npx prisma migrate deploy', { 
    stdio: 'inherit',
    timeout: 120000
  });
  console.log('✅ Migrations complete');
} catch (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
}

console.log('🚀 Starting server...');
require('./dist/index.js');
