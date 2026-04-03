/**
 * Production Startup Script
 * Runs migrations then starts the server
 */

const { execSync } = require('child_process');
const express = require('express');

console.log('========================================');
console.log('🚀 Engage Backend Starting...');
console.log('========================================');

// Run migrations
console.log('🗄️  Running database migrations...');
try {
  execSync('npx prisma migrate deploy', { 
    stdio: 'inherit',
    timeout: 120000
  });
  console.log('✅ Migrations complete');
} catch (error) {
  console.warn('⚠️  Migration warning:', error.message);
}

// Seed UK accountancy services (safe — idempotent, only seeds if catalog is missing)
console.log('🌱 Checking UK service catalog...');
try {
  require('./scripts/seed-uk-services.js');
} catch (error) {
  console.warn('⚠️  Seed check warning:', error.message);
}

console.log('🚀 Loading server...');

// Import and start the server
require('./dist/index.js');
