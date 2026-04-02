/**
 * Production Startup Script
 * Runs migrations then starts the server
 */

const { execSync } = require('child_process');

console.log('========================================');
console.log('🚀 Engage Backend Starting...');
console.log('========================================');
console.log('📁 Current directory:', process.cwd());
console.log('📦 NODE_ENV:', process.env.NODE_ENV);
console.log('🌐 PORT:', process.env.PORT);
console.log('');

console.log('🗄️  Running database migrations...');

try {
  execSync('npx prisma migrate deploy', { 
    stdio: 'inherit',
    timeout: 120000
  });
  console.log('✅ Migrations complete');
} catch (error) {
  console.warn('⚠️  Migration warning (may already be applied):', error.message);
}

console.log('');
console.log('🚀 Starting server...');
console.log('========================================');

try {
  require('./dist/index.js');
  console.log('✅ Server module loaded');
} catch (error) {
  console.error('❌ Failed to start server:', error.message);
  console.error(error.stack);
  process.exit(1);
}
