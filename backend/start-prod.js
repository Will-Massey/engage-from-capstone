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

// Seed database if empty (safe — only runs when no services exist)
console.log('🌱 Checking if seed is needed...');
try {
  require('./scripts/seed-if-empty.js');
} catch (error) {
  console.warn('⚠️  Seed check warning:', error.message);
}

console.log('🚀 Loading server...');

// Import and start the server
require('./dist/index.js');
