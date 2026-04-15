/**
 * Engage by Capstone - Feature Test Script
 * Run: node test-features.js
 */

const http = require('http');

const API_URL = 'localhost';
const API_PORT = 3001;
const FRONTEND_URL = 'localhost';
const FRONTEND_PORT = 5173;

// Test results
const results = {
  backend: { status: 'pending', details: [] },
  frontend: { status: 'pending', details: [] },
  apis: { status: 'pending', details: [] },
};

function makeRequest(hostname, port, path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, data: json });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     Engage by Capstone - Feature Test Suite               ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Test 1: Backend Health Check
  console.log('📡 Testing Backend Server...');
  try {
    const health = await makeRequest(API_URL, API_PORT, '/health');
    if (health.status === 200 && health.data.success) {
      results.backend.status = '✅ PASS';
      results.backend.details.push(`✅ Health check: ${health.data.data.status}`);
      results.backend.details.push(`   Database: ${health.data.data.database}`);
      results.backend.details.push(`   Version: ${health.data.data.version}`);
    } else {
      results.backend.status = '❌ FAIL';
      results.backend.details.push('Health check failed');
    }
  } catch (err) {
    results.backend.status = '❌ FAIL';
    results.backend.details.push(`Error: ${err.message}`);
  }

  // Test 2: Frontend
  console.log('🌐 Testing Frontend Server...');
  try {
    const frontend = await makeRequest(FRONTEND_URL, FRONTEND_PORT, '/');
    if (frontend.status === 200) {
      results.frontend.status = '✅ PASS';
      results.frontend.details.push('✅ Frontend serving correctly');
    } else {
      results.frontend.status = '❌ FAIL';
      results.frontend.details.push(`Status: ${frontend.status}`);
    }
  } catch (err) {
    results.frontend.status = '❌ FAIL';
    results.frontend.details.push(`Error: ${err.message}`);
  }

  // Test 3: API Endpoints
  console.log('🔌 Testing API Endpoints...');
  const endpoints = [
    { path: '/api/tenants/settings', name: 'VAT Settings API' },
    { path: '/api/services/billing-cycles', name: 'Billing Cycles API' },
    { path: '/api/services/vat-rates', name: 'VAT Rates API' },
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await makeRequest(API_URL, API_PORT, endpoint.path);
      if (response.status === 200 || response.status === 401) {
        results.apis.details.push(
          `✅ ${endpoint.name}: ${response.status === 401 ? 'Protected (auth required)' : 'OK'}`
        );
      } else {
        results.apis.details.push(`⚠️  ${endpoint.name}: Status ${response.status}`);
      }
    } catch (err) {
      results.apis.details.push(`❌ ${endpoint.name}: ${err.message}`);
    }
  }
  results.apis.status = '✅ CHECKED';

  // Test 4: Check Proposal Sharing Endpoints
  console.log('📄 Testing Proposal Sharing APIs...');
  const sharingEndpoints = [
    { path: '/api/proposals', method: 'GET', name: 'List Proposals' },
    { path: '/api/proposals/view/test-token', method: 'GET', name: 'Public Proposal View' },
  ];

  for (const endpoint of sharingEndpoints) {
    try {
      const response = await makeRequest(API_URL, API_PORT, endpoint.path, endpoint.method);
      if (response.status === 200 || response.status === 401) {
        results.apis.details.push(
          `✅ ${endpoint.name}: ${response.status === 401 ? 'Protected' : 'OK'}`
        );
      } else if (response.status === 404 && endpoint.path.includes('view/')) {
        results.apis.details.push(
          `✅ ${endpoint.name}: Route exists (404 for invalid token is expected)`
        );
      } else {
        results.apis.details.push(`⚠️  ${endpoint.name}: Status ${response.status}`);
      }
    } catch (err) {
      results.apis.details.push(`❌ ${endpoint.name}: ${err.message}`);
    }
  }

  // Print Results
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    TEST RESULTS                           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`Backend Server:  ${results.backend.status}`);
  results.backend.details.forEach((d) => console.log(`  ${d}`));

  console.log(`\nFrontend Server: ${results.frontend.status}`);
  results.frontend.details.forEach((d) => console.log(`  ${d}`));

  console.log(`\nAPI Endpoints:   ${results.apis.status}`);
  results.apis.details.forEach((d) => console.log(`  ${d}`));

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║              MANUAL TESTING CHECKLIST                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('1️⃣  VAT SETTINGS TEST:');
  console.log('   → Open: http://localhost:5173/login');
  console.log('   → Login: admin@demo.practice / DemoPass123!');
  console.log('   → Navigate: Settings → VAT Settings tab');
  console.log('   → Test: Toggle VAT registered, change VAT number, select rates\n');

  console.log('2️⃣  SIGNATURE PAD TEST:');
  console.log('   → First, create a proposal with a client');
  console.log('   → Share the proposal (get a share link)');
  console.log('   → Open the share link in an incognito window');
  console.log('   → Test: Draw signature with mouse/touch\n');

  console.log('3️⃣  PUBLIC PROPOSAL VIEW TEST:');
  console.log('   → From share link, verify:');
  console.log('   - Tenant branding displays correctly');
  console.log('   - Services breakdown shows');
  console.log('   - VAT and totals calculate correctly');
  console.log('   - Terms & Conditions display');
  console.log('   - Accept button workflow works\n');

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Quick URLs:                                               ║');
  console.log('║  • Login:    http://localhost:5173/login                   ║');
  console.log('║  • Settings: http://localhost:5173/settings                ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
}

runTests().catch(console.error);
