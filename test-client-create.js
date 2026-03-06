const http = require('http');

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

async function test() {
  console.log('Testing client creation...\n');
  
  // Login
  console.log('1. Logging in...');
  const loginResponse = await makeRequest('localhost', 3001, '/api/auth/login', 'POST', {
    email: 'admin@demo.practice',
    password: 'DemoPass123!'
  });
  
  if (!loginResponse.data.success) {
    console.log('Login failed:', loginResponse.data);
    return;
  }
  
  const token = loginResponse.data.data.tokens.accessToken;
  console.log('✅ Logged in\n');
  
  // Test 1: Minimal client creation
  console.log('2. Testing minimal client creation...');
  const testEmail = `test${Date.now()}@example.com`;
  const response1 = await makeRequest('localhost', 3001, '/api/clients', 'POST', {
    name: 'Test Client Ltd',
    companyType: 'LIMITED_COMPANY',
    contactEmail: testEmail
  }, token);
  
  console.log('Status:', response1.status);
  console.log('Response:', JSON.stringify(response1.data, null, 2));
  
  // Test 2: With address
  console.log('\n3. Testing client with address...');
  const testEmail2 = `test${Date.now() + 1}@example.com`;
  const response2 = await makeRequest('localhost', 3001, '/api/clients', 'POST', {
    name: 'Test Client 2 Ltd',
    companyType: 'LIMITED_COMPANY',
    contactEmail: testEmail2,
    address: {
      line1: '123 Test Street',
      city: 'London',
      postcode: 'SW1A 1AA',
      country: 'United Kingdom'
    }
  }, token);
  
  console.log('Status:', response2.status);
  console.log('Response:', JSON.stringify(response2.data, null, 2));
}

test().catch(console.error);
