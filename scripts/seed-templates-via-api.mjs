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
const CHUNK = Number(process.env.SEED_CHUNK_SIZE || 25);
const FETCH_TIMEOUT_MS = 120_000;

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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${API}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Test-Mode': 'e2e-build',
        ...(process.env.E2E_BYPASS_SECRET
          ? { 'X-Test-Mode-Secret': process.env.E2E_BYPASS_SECRET }
          : {}),
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
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log(`\n🔗 API: ${API}`);
  console.log(`👤 User: ${EMAIL}\n`);

  const jar = new Map();

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
  if (!accessToken || !csrfToken) {
    console.error('Missing auth cookies after login');
    process.exit(1);
  }

  console.log('✅ Logged in\n');

  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
    'X-CSRF-Token': csrfToken,
  };

  let offset = 0;
  let totalCreated = 0;
  let totalSkipped = 0;
  let expectedPackages = 0;
  let lastSeed = null;

  while (true) {
    const path = `/proposal-templates/seed-library?offset=${offset}&limit=${CHUNK}`;
    console.log(`📦 Seeding chunk offset=${offset} limit=${CHUNK}…`);

    const seed = await api('POST', path, { jar, headers: authHeaders });

    if (seed.status !== 200 || !seed.json.success) {
      console.error('Seed failed:', seed.status, JSON.stringify(seed.json, null, 2));
      process.exit(1);
    }

    const { data } = seed.json;
    const s = data.seed;
    lastSeed = s;
    expectedPackages = data.expectedPackages;
    totalCreated += s.created;
    totalSkipped += s.skipped;

    console.log(
      `   created=${s.created} skipped=${s.skipped} active=${s.totalActive} hasMore=${s.hasMore}`
    );

    if (!s.hasMore) break;
    offset += s.processed;
  }

  console.log('\n📦 Seed complete');
  console.log(`   Expected packages: ${expectedPackages}`);
  console.log(`   Total created this run: ${totalCreated}`);
  console.log(`   Total skipped this run: ${totalSkipped}`);
  console.log(`   Active templates: ${lastSeed?.totalActive ?? '?'}`);
  console.log(`   Catalogue services: ${lastSeed?.catalogueCount ?? '?'}`);
  if (lastSeed?.warnings?.length) {
    for (const w of lastSeed.warnings) console.log(`   ⚠️  ${w}`);
  }

  const sanityRes = await api('GET', '/proposal-templates/pricing-sanity', {
    jar,
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (sanityRes.status !== 200 || !sanityRes.json.success) {
    console.error('Sanity check failed:', sanityRes.status, sanityRes.json);
    process.exit(1);
  }

  const sanity = sanityRes.json.data.sanity;

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