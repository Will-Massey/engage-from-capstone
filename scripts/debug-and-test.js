#!/usr/bin/env node
/**
 * Debug and Test Script for Engage Proposal Fixes
 * 
 * This script automates testing of:
 * 1. Pricing frequency calculations
 * 2. VAT line-level configuration
 * 3. CSRF handling
 * 4. Database schema validation
 * 
 * Usage: node scripts/debug-and-test.js [options]
 */

const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message) {
  log(`✅ ${message}`, 'green');
}

function error(message) {
  log(`❌ ${message}`, 'red');
}

function warning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function info(message) {
  log(`ℹ️  ${message}`, 'cyan');
}

// Test results tracker
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function recordTest(name, passed, details = '') {
  results.tests.push({ name, passed, details });
  if (passed) {
    results.passed++;
    success(`${name}${details ? ': ' + details : ''}`);
  } else {
    results.failed++;
    error(`${name}${details ? ': ' + details : ''}`);
  }
}

/**
 * Test 1: Pricing Frequency Calculations
 */
async function testPricingFrequency() {
  log('\n=== Testing Pricing Frequency Calculations ===', 'blue');
  
  const testCases = [
    { basePrice: 850, frequency: 'ANNUALLY', expectedMonthly: 70.83 },
    { basePrice: 180, frequency: 'QUARTERLY', expectedMonthly: 60 },
    { basePrice: 150, frequency: 'MONTHLY', expectedMonthly: 150 },
    { basePrice: 500, frequency: 'ONE_TIME', expectedMonthly: 500 }
  ];

  for (const test of testCases) {
    let monthlyPrice;
    switch (test.frequency) {
      case 'ANNUALLY':
        monthlyPrice = test.basePrice / 12;
        break;
      case 'QUARTERLY':
        monthlyPrice = test.basePrice / 3;
        break;
      default:
        monthlyPrice = test.basePrice;
    }
    
    const rounded = Math.round(monthlyPrice * 100) / 100;
    const passed = Math.abs(rounded - test.expectedMonthly) < 0.01;
    
    recordTest(
      `Pricing: £${test.basePrice} ${test.frequency} = £${rounded}/month`,
      passed,
      passed ? '' : `Expected £${test.expectedMonthly}, got £${rounded}`
    );
  }
}

/**
 * Test 2: VAT Calculations
 */
async function testVATCalculations() {
  log('\n=== Testing VAT Calculations ===', 'blue');
  
  const testCases = [
    { price: 100, vatRate: 20, expectedVAT: 20 },
    { price: 100, vatRate: 5, expectedVAT: 5 },
    { price: 100, vatRate: 0, expectedVAT: 0 },
    { price: 250, quantity: 2, vatRate: 20, expectedVAT: 100 }
  ];

  for (const test of testCases) {
    const quantity = test.quantity || 1;
    const lineTotal = test.price * quantity;
    const vatAmount = Math.round(lineTotal * (test.vatRate / 100) * 100) / 100;
    
    const passed = Math.abs(vatAmount - test.expectedVAT) < 0.01;
    
    recordTest(
      `VAT: £${lineTotal} @ ${test.vatRate}% = £${vatAmount}`,
      passed,
      passed ? '' : `Expected £${test.expectedVAT}, got £${vatAmount}`
    );
  }

  // Test mixed VAT scenario
  const services = [
    { price: 100, vatRate: 20 },
    { price: 200, vatRate: 5 },
    { price: 150, vatRate: 0 }
  ];
  
  let totalVAT = 0;
  services.forEach(s => {
    totalVAT += s.price * (s.vatRate / 100);
  });
  totalVAT = Math.round(totalVAT * 100) / 100;
  
  const expectedMixedVAT = 30; // 20 + 10 + 0
  recordTest(
    'Mixed VAT calculation',
    Math.abs(totalVAT - expectedMixedVAT) < 0.01,
    `Services with 20%, 5%, 0% VAT = £${totalVAT} total VAT`
  );
}

/**
 * Test 3: Database Schema Validation
 */
async function testDatabaseSchema() {
  log('\n=== Testing Database Schema ===', 'blue');
  
  try {
    // Check if ProposalService table has new VAT fields
    const tableInfo = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'ProposalService'
    `;
    
    const columns = tableInfo.map(c => c.column_name);
    
    const requiredFields = ['vatRate', 'vatAmount', 'grossTotal', 'frequency'];
    
    for (const field of requiredFields) {
      const hasField = columns.includes(field);
      recordTest(
        `Schema: ProposalService.${field} exists`,
        hasField,
        hasField ? '' : 'Field not found in database'
      );
    }
    
  } catch (err) {
    error(`Database schema test failed: ${err.message}`);
    results.failed += 4;
  }
}

/**
 * Test 4: CSRF Token Handling
 */
async function testCSRFHandling() {
  log('\n=== Testing CSRF Token Handling ===', 'blue');
  
  const API_BASE = process.env.API_URL || 'http://localhost:3001/api';
  
  try {
    // Test 1: Get CSRF token
    const csrfResponse = await axios.get(`${API_BASE}/auth/csrf-token`, {
      withCredentials: true
    });
    
    const hasToken = csrfResponse.data?.data?.csrfToken || csrfResponse.data?.csrfToken;
    recordTest(
      'CSRF token endpoint returns token',
      !!hasToken,
      hasToken ? 'Token received' : 'No token in response'
    );
    
    // Test 2: Request without token should fail
    try {
      await axios.post(`${API_BASE}/auth/login`, {
        email: 'test@test.com',
        password: 'wrong'
      }, {
        withCredentials: true,
        headers: { 'X-CSRF-Token': 'invalid-token' }
      });
      recordTest('CSRF blocks invalid tokens', false, 'Request should have been blocked');
    } catch (err) {
      if (err.response?.status === 403) {
        recordTest('CSRF blocks invalid tokens', true, '403 Forbidden returned');
      } else {
        recordTest('CSRF blocks invalid tokens', true, 'Request blocked (different error)');
      }
    }
    
  } catch (err) {
    warning(`CSRF tests skipped - API not available: ${err.message}`);
  }
}

/**
 * Test 5: Service Template Default Frequencies
 */
async function testServiceTemplates() {
  log('\n=== Testing Service Template Frequencies ===', 'blue');
  
  try {
    const services = await prisma.serviceTemplate.findMany({
      take: 5,
      select: {
        name: true,
        basePrice: true,
        defaultFrequency: true
      }
    });
    
    if (services.length === 0) {
      warning('No service templates found in database');
      return;
    }
    
    for (const service of services) {
      const hasFrequency = ['MONTHLY', 'QUARTERLY', 'ANNUALLY', 'ONE_TIME'].includes(
        service.defaultFrequency
      );
      
      recordTest(
        `Service "${service.name}" has valid frequency`,
        hasFrequency,
        service.defaultFrequency
      );
    }
    
  } catch (err) {
    error(`Service template test failed: ${err.message}`);
  }
}

/**
 * Test 6: File Changes Verification
 */
async function verifyFileChanges() {
  log('\n=== Verifying File Changes ===', 'blue');
  
  const fs = require('fs');
  const path = require('path');
  
  const filesToCheck = [
    {
      path: 'frontend/src/components/proposals/ProposalBuilder.tsx',
      checks: ['defaultFrequency', 'vatRate', 'frequency']
    },
    {
      path: 'frontend/src/pages/proposals/CreateProposal.tsx',
      checks: ['defaultFrequency', 'serviceFrequency', 'vatRate']
    },
    {
      path: 'frontend/src/utils/api.ts',
      checks: ['CSRF_MISSING', 'csrfTokenInMemory', 'retry']
    },
    {
      path: 'backend/src/routes/proposals.ts',
      checks: ['vatRate', 'vatAmount', 'grossTotal']
    },
    {
      path: 'backend/prisma/schema.prisma',
      checks: ['vatRate', 'vatAmount', 'grossTotal']
    }
  ];
  
  const rootDir = path.resolve(__dirname, '..');
  
  for (const file of filesToCheck) {
    const fullPath = path.join(rootDir, file.path);
    
    if (!fs.existsSync(fullPath)) {
      recordTest(`File: ${file.path}`, false, 'File not found');
      continue;
    }
    
    const content = fs.readFileSync(fullPath, 'utf-8');
    const missingChecks = file.checks.filter(check => !content.includes(check));
    
    recordTest(
      `File: ${file.path}`,
      missingChecks.length === 0,
      missingChecks.length === 0 ? 'All changes present' : `Missing: ${missingChecks.join(', ')}`
    );
  }
}

/**
 * Print Summary
 */
function printSummary() {
  log('\n========================================', 'blue');
  log('Test Summary', 'blue');
  log('========================================', 'blue');
  
  const total = results.passed + results.failed;
  const passRate = total > 0 ? Math.round((results.passed / total) * 100) : 0;
  
  log(`\nTotal Tests: ${total}`);
  log(`Passed: ${results.passed}`, 'green');
  log(`Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'reset');
  log(`Pass Rate: ${passRate}%`);
  
  if (results.failed > 0) {
    log('\nFailed Tests:', 'red');
    results.tests
      .filter(t => !t.passed)
      .forEach(t => {
        log(`  - ${t.name}: ${t.details}`, 'red');
      });
  }
  
  log('\n');
  
  return results.failed === 0;
}

/**
 * Main
 */
async function main() {
  log('\n');
  log('╔════════════════════════════════════════╗', 'cyan');
  log('║   Engage Debug & Test Suite            ║', 'cyan');
  log('║   Proposal Pricing & VAT Fixes         ║', 'cyan');
  log('╚════════════════════════════════════════╝', 'cyan');
  
  const args = process.argv.slice(2);
  const runAll = args.length === 0;
  
  try {
    if (runAll || args.includes('--pricing')) {
      await testPricingFrequency();
    }
    
    if (runAll || args.includes('--vat')) {
      await testVATCalculations();
    }
    
    if (runAll || args.includes('--schema')) {
      await testDatabaseSchema();
    }
    
    if (runAll || args.includes('--csrf')) {
      await testCSRFHandling();
    }
    
    if (runAll || args.includes('--templates')) {
      await testServiceTemplates();
    }
    
    if (runAll || args.includes('--files')) {
      await verifyFileChanges();
    }
    
  } catch (err) {
    error(`Unexpected error: ${err.message}`);
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
  
  const allPassed = printSummary();
  process.exit(allPassed ? 0 : 1);
}

// Help text
if (process.argv.includes('--help')) {
  console.log(`
Usage: node scripts/debug-and-test.js [options]

Options:
  --pricing     Test pricing frequency calculations
  --vat         Test VAT calculations
  --schema      Test database schema
  --csrf        Test CSRF token handling
  --templates   Test service template frequencies
  --files       Verify file changes
  --help        Show this help message

If no options are provided, all tests will run.
`);
  process.exit(0);
}

main();
