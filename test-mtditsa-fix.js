/**
 * Test MTD ITSA Fix - Verify it only applies to Sole Traders and Partnerships
 */

const http = require('http');

const API_URL = 'localhost';
const API_PORT = 3001;

function makeRequest(hostname, port, path, method = 'GET', data = null, token = null) {
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

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
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

async function login() {
  console.log('🔑 Logging in...');
  const response = await makeRequest(API_URL, API_PORT, '/api/auth/login', 'POST', {
    email: 'admin@demo.practice',
    password: 'DemoPass123!'
  });
  
  if (response.status === 200 && response.data.success) {
    return response.data.data.tokens.accessToken;
  }
  throw new Error('Login failed');
}

async function testMtditsaFix() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     MTD ITSA Fix Test - Company Type Verification         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  let token;
  try {
    token = await login();
    console.log('✅ Logged in successfully\n');
  } catch (err) {
    console.log('❌ Login failed:', err.message);
    return;
  }

  // Test creating clients with different company types
  const testCases = [
    {
      type: 'SOLE_TRADER',
      name: 'Test Sole Trader',
      email: `sole${Date.now()}@test.com`,
      income: 50000,
      expectMtditsa: true,
      description: 'Sole Trader with £50k income should have MTD ITSA REQUIRED'
    },
    {
      type: 'PARTNERSHIP',
      name: 'Test Partnership', 
      email: `partner${Date.now()}@test.com`,
      income: 50000,
      expectMtditsa: true,
      description: 'Partnership with £50k income should have MTD ITSA REQUIRED'
    },
    {
      type: 'LIMITED_COMPANY',
      name: 'Test Limited Company',
      email: `ltd${Date.now()}@test.com`,
      income: 50000,
      expectMtditsa: false,
      description: 'Limited Company with £50k income should NOT have MTD ITSA'
    },
    {
      type: 'LLP',
      name: 'Test LLP',
      email: `llp${Date.now()}@test.com`,
      income: 50000,
      expectMtditsa: false,
      description: 'LLP with £50k income should NOT have MTD ITSA'
    },
    {
      type: 'CHARITY',
      name: 'Test Charity',
      email: `charity${Date.now()}@test.com`,
      income: 50000,
      expectMtditsa: false,
      description: 'Charity with £50k income should NOT have MTD ITSA'
    },
    {
      type: 'NON_PROFIT',
      name: 'Test Non-Profit',
      email: `nonprofit${Date.now()}@test.com`,
      income: 50000,
      expectMtditsa: false,
      description: 'Non-Profit with £50k income should NOT have MTD ITSA'
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    console.log(`\n🧪 Testing: ${testCase.type}`);
    console.log(`   ${testCase.description}`);
    
    try {
      // Create client
      const createResponse = await makeRequest(
        API_URL, 
        API_PORT, 
        '/api/clients',
        'POST',
        {
          name: testCase.name,
          companyType: testCase.type,
          contactEmail: testCase.email,
          mtditsaIncome: testCase.income,
        },
        token
      );

      if (createResponse.status !== 201 && createResponse.status !== 200) {
        console.log(`   ❌ Failed to create client: ${createResponse.data.error?.message || 'Unknown error'}`);
        failed++;
        continue;
      }

      const client = createResponse.data.data;
      const hasMtditsa = client.mtditsaEligible === true;
      const status = client.mtditsaStatus;

      if (hasMtditsa === testCase.expectMtditsa) {
        console.log(`   ✅ PASS - mtditsaEligible: ${hasMtditsa}, status: ${status}`);
        passed++;
      } else {
        console.log(`   ❌ FAIL - Expected mtditsaEligible: ${testCase.expectMtditsa}, got: ${hasMtditsa}, status: ${status}`);
        failed++;
      }

      // Clean up - delete the test client
      await makeRequest(API_URL, API_PORT, `/api/clients/${client.id}`, 'DELETE', null, token);

    } catch (err) {
      console.log(`   ❌ ERROR: ${err.message}`);
      failed++;
    }
  }

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                      TEST SUMMARY                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n   Total tests: ${testCases.length}`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  
  if (failed === 0) {
    console.log('\n   🎉 All tests passed! MTD ITSA correctly applies only to Sole Traders and Partnerships.');
  } else {
    console.log('\n   ⚠️  Some tests failed. Please review the implementation.');
  }
  console.log('');
}

testMtditsaFix().catch(console.error);
