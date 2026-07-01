#!/usr/bin/env node
/**
 * Seed proposal template library on production via authenticated API.
 * Usage: node scripts/seed-templates-via-api.mjs
 *
 * Env: API_URL, TEST_USER_EMAIL, TEST_USER_PASSWORD
 */
const API_BASE = (
  process.env.API_URL || 'https://engage-backend-e1ue.onrender.com'
).replace(/\/$/, '');
const API = API_BASE.endsWith('/api') ? API_BASE : `${API_BASE}/api`;

const EMAIL = process.env.TEST_USER_EMAIL || 'admin@demo.practice';
const PASSWORD = process.env.TEST_USER_PASSWORD || 'DemoPass123!';

function parseCookies(setCookieHeaders) {
  const jar = new Map();
  if (!setCookieHeaders) return jar;
  const lines = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  for (const line of lines) {
    const [pair] = line.split(';');
    const idx = pair.indexOf('=');
    if (idx > 0) jar.set(pair.slice(0, idx), pair.slice(idx + 1));
  }
  return jar;
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function api(method, path, { jar, body, headers = {} } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Test-Mode': 'e2e-build',
      ...(jar?.size ? { Cookie: cookieHeader(jar) } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  const newCookies = parseCookies(res.headers.getSetCookie?.() || res.headers.raw?.()['set-cookie']);
  if (jar) {
    for (const [k, v] of newCookies) jar.set(k, v);
  }

  return { status: res.status, json, jar };
}

async function main() {
  console.log(`\n🔗 API: ${API}`);
  console.log(`👤 User: ${EMAIL}\n`);

  const jar = new Map();

  // Bootstrap CSRF cookie
  await api('GET', '/status', { jar });

  const login = await api('POST', '/auth/login', {
    jar,
    body: { email: EMAIL, password: PASSWORD },
  });

  if (login.status !== 200 || !login.json.success) {
    console.error('Login failed:', login.status, login.json);
    process.exit(1);
  }

  const accessToken = jar.get('accessToken');
  const csrfToken = jar.get('csrfToken');
  if (!accessToken) {
    console.error('No accessToken cookie after login');
    process.exit(1);
  }
  if (!csrfToken) {
    console.error('No csrfToken cookie — fetch /api/status first');
    process.exit(1);
  }

  console.log('✅ Logged in\n');

  const seed = await api('POST', '/proposal-templates/seed-library', {
    jar,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-CSRF-Token': csrfToken,
    },
  });

  if (seed.status !== 200 || !seed.json.success) {
    console.error('Seed failed:', seed.status, JSON.stringify(seed.json, null, 2));
    process.exit(1);
  }

  const { data } = seed.json;
  const s = data.seed;
  const sanity = data.sanity;

  console.log('📦 Seed results');
  console.log(`   Expected packages: ${data.expectedPackages}`);
  console.log(`   Created: ${s.created}`);
  console.log(`   Skipped: ${s.skipped} (${s.skippedNoServices} no matching services)`);
  console.log(`   Active templates: ${s.totalActive}`);
  console.log(`   Catalogue services: ${s.catalogueCount}`);
  if (s.warnings?.length) {
    for (const w of s.warnings) console.log(`   ⚠️  ${w}`);
  }

  console.log('\n💷 Pricing sanity');
  console.log(`   Status: ${sanity.passed ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`   Templates checked: ${sanity.templatesChecked}`);
  console.log(`   Service line items: ${sanity.servicesChecked}`);
  console.log(`   Mismatches: ${sanity.mismatches.length}`);
  console.log(`   Missing service IDs: ${sanity.missingServiceIds.length}`);
  console.log(`   Zero/negative prices: ${sanity.zeroOrNegativePrices.length}`);
  console.log(`   Out-of-band (advisory): ${sanity.outOfBandPrices.length}`);
  console.log(
    `   Price bands: min £${sanity.priceBands.min}, median £${sanity.priceBands.median}, max £${sanity.priceBands.max}`
  );

  if (sanity.mismatches.length) {
    console.log('\n   Sample mismatches:');
    for (const m of sanity.mismatches.slice(0, 5)) {
      console.log(
        `     - ${m.templateName} / ${m.serviceName}: £${m.templatePrice} vs catalogue £${m.cataloguePrice}`
      );
    }
  }

  const list = await api('GET', '/proposal-templates', {
    jar,
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const count = list.json?.data?.length ?? 0;
  console.log(`\n📋 GET /proposal-templates: ${count} templates\n`);

  if (!sanity.passed) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});