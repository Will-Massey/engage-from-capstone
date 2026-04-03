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

// Seed UK accountancy services (blocks until complete — safe and idempotent)
console.log('🌱 Checking UK service catalog...');
try {
  execSync('node ./scripts/seed-uk-services.js', {
    stdio: 'inherit',
    timeout: 120000,
  });
  console.log('✅ Seed check complete');
} catch (error) {
  console.warn('⚠️  Seed check warning:', error.message);
}

console.log('🚀 Loading server...');

// Import and start the server
require('./dist/index.js');
