/**
 * Production pressure test + send test proposal email
 */
const BASE = 'https://engage-backend-e1ue.onrender.com';
const EMAIL = 'william@capstonesoftware.co.uk';

async function request(path, options = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
}

function parseSetCookies(headers) {
  const raw = headers.getSetCookie?.() || [];
  const jar = {};
  for (const c of raw) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return jar;
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function pressurePing(n = 20) {
  const results = await Promise.all(
    Array.from({ length: n }, () => request('/ping'))
  );
  const ok = results.filter((r) => r.status === 200).length;
  return { total: n, ok, failed: n - ok };
}

async function main() {
  console.log('=== Pressure test: /ping x20 ===');
  const ping = await pressurePing(20);
  console.log(JSON.stringify(ping));

  console.log('\n=== Health + email status ===');
  const health = await request('/api/health');
  console.log('health', health.status, JSON.stringify(health.body).slice(0, 200));

  console.log('\n=== Tenant signup (should be disabled or rate-limited) ===');
  const signup = await request('/api/tenants', {
    method: 'POST',
    body: JSON.stringify({
      subdomain: 'test-' + Date.now(),
      name: 'Test Co',
      adminEmail: 'test@example.com',
      adminFirstName: 'Test',
      adminLastName: 'User',
      adminPassword: 'TestPass123!',
    }),
  });
  console.log('signup', signup.status, signup.body?.error?.code || signup.body);

  console.log('\n=== Login demo tenant ===');
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'admin@demo.practice',
      password: 'DemoPass123!',
    }),
  });
  console.log('login', login.status, login.body?.success, login.body?.error?.code);

  if (login.status !== 200) {
    console.log('Login failed — skipping proposal send');
    return;
  }

  const cookies = parseSetCookies(login.headers);
  let csrfToken = cookies.csrfToken;
  const authHeaders = { Cookie: cookieHeader(cookies) };

  console.log('\n=== CSRF token ===');
  if (!csrfToken) {
    const csrf = await request('/api/auth/csrf-token', { headers: authHeaders });
    csrfToken = csrf.body?.data?.csrfToken;
    Object.assign(cookies, parseSetCookies(csrf.headers));
    authHeaders.Cookie = cookieHeader(cookies);
    console.log('csrf fetch', csrf.status, csrfToken ? 'ok' : 'missing');
  } else {
    console.log('csrf from login cookie ok');
  }

  console.log('\n=== AI status ===');
  const ai = await request('/api/ai/status', { headers: authHeaders });
  console.log('ai', ai.status, JSON.stringify(ai.body?.data || ai.body?.error).slice(0, 300));

  console.log('\n=== List proposals ===');
  const proposals = await request('/api/proposals?limit=5', { headers: authHeaders });
  const list = proposals.body?.data?.proposals || proposals.body?.data || [];
  const items = Array.isArray(list) ? list : [];
  console.log('proposals', proposals.status, 'count', items.length);
  if (items[0]) console.log('first', items[0].reference, items[0].status, items[0].id);

  const target = items.find((p) => p.status === 'DRAFT' || p.status === 'SENT') || items[0];
  if (!target?.id) {
    console.log('No proposal to send');
    return;
  }

  console.log('\n=== Send proposal', target.reference, '===');
  const send = await request(`/api/proposals/${target.id}/send`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'X-CSRF-Token': csrfToken || cookies.csrfToken || '',
    },
    body: JSON.stringify({ recipientEmail: EMAIL }),
  });
  console.log('send', send.status, JSON.stringify(send.body).slice(0, 400));

  console.log('\n=== Cross-tenant header test ===');
  const mismatch = await request('/api/clients?limit=1', {
    headers: {
      ...authHeaders,
      'X-Tenant-Id': '00000000-0000-0000-0000-000000000001',
    },
  });
  console.log('tenant mismatch', mismatch.status, mismatch.body?.error?.code);

  console.log('\nDone — check', EMAIL, 'for proposal email');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});