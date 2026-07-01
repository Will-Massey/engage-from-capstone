#!/usr/bin/env node
/**
 * Production ops: bulk-import service catalogue → seed templates → pricing sanity.
 * Usage: node scripts/seed-production-catalog-and-templates.mjs
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
    if (jar) for (const [k, v] of newCookies) jar.set(k, v);
    return { status: res.status, json, jar };
  } finally {
    clearTimeout(timer);
  }
}

async function login(jar) {
  await api('GET', '/status', { jar });
  const login = await api('POST', '/auth/login', {
    jar,
    body: { email: EMAIL, password: PASSWORD },
  });
  if (login.status !== 200 || !login.json.success) {
    throw new Error(`Login failed: ${login.status} ${JSON.stringify(login.json)}`);
  }
  const accessToken = jar.get('accessToken');
  const csrfToken = jar.get('csrfToken');
  if (!accessToken || !csrfToken) throw new Error('Missing auth cookies');
  return {
    Authorization: `Bearer ${accessToken}`,
    'X-CSRF-Token': csrfToken,
  };
}

async function main() {
  console.log(`\n🔗 API: ${API}`);
  const jar = new Map();
  const auth = await login(jar);
  console.log('✅ Logged in\n');

  // 1 — catalogue count before
  const before = await api('GET', '/services', { jar, headers: { Authorization: auth.Authorization } });
  const beforeCount = before.json?.data?.length ?? before.json?.data?.services?.length ?? '?';
  console.log(`📋 Services before import: ${beforeCount}`);

  // 1 — bulk import from ukAccountancyServices catalogue
  console.log('📥 Bulk-importing catalogue (POST /services/v2/bulk-import-catalog)…');
  const imp = await api('POST', '/services/v2/bulk-import-catalog', {
    jar,
    headers: auth,
    body: {},
  });
  if (imp.status !== 200 || !imp.json.success) {
    console.error('Import failed:', imp.status, JSON.stringify(imp.json, null, 2));
    process.exit(1);
  }
  const r = imp.json.data;
  console.log(`   Imported: ${r.imported}, skipped: ${r.skipped}, errors: ${r.errors?.length ?? 0}`);
  if (r.errors?.length) {
    for (const e of r.errors.slice(0, 5)) console.log(`   ⚠️  ${e}`);
  }

  const after = await api('GET', '/services', { jar, headers: { Authorization: auth.Authorization } });
  const afterCount = after.json?.data?.length ?? after.json?.data?.services?.length ?? '?';
  console.log(`📋 Services after import: ${afterCount}\n`);

  // 2 — seed templates in chunks
  let offset = 0;
  let totalCreated = 0;
  let totalSkipped = 0;
  let expectedPackages = 0;
  let lastSeed = null;

  while (true) {
    const path = `/proposal-templates/seed-library?offset=${offset}&limit=${CHUNK}`;
    console.log(`📦 Template chunk offset=${offset}…`);
    const seed = await api('POST', path, { jar, headers: auth });
    if (seed.status !== 200 || !seed.json.success) {
      console.error('Seed failed:', seed.status, JSON.stringify(seed.json, null, 2));
      process.exit(1);
    }
    const s = seed.json.data.seed;
    lastSeed = s;
    expectedPackages = seed.json.data.expectedPackages;
    totalCreated += s.created;
    totalSkipped += s.skipped;
    console.log(`   created=${s.created} skipped=${s.skipped} active=${s.totalActive} hasMore=${s.hasMore}`);
    if (!s.hasMore) break;
    offset += s.processed;
  }

  console.log('\n📦 Template seed complete');
  console.log(`   Expected packages: ${expectedPackages}`);
  console.log(`   Created this run: ${totalCreated}`);
  console.log(`   Skipped this run: ${totalSkipped}`);
  console.log(`   Active templates: ${lastSeed?.totalActive}`);

  // 3 — pricing sanity
  const sanityRes = await api('GET', '/proposal-templates/pricing-sanity', {
    jar,
    headers: { Authorization: auth.Authorization },
  });
  if (sanityRes.status !== 200 || !sanityRes.json.success) {
    console.error('Sanity failed:', sanityRes.status, sanityRes.json);
    process.exit(1);
  }
  const sanity = sanityRes.json.data.sanity;
  console.log('\n💷 Pricing sanity');
  console.log(`   Status: ${sanity.passed ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`   Templates: ${sanity.templatesChecked}, line items: ${sanity.servicesChecked}`);
  console.log(`   Mismatches: ${sanity.mismatches.length}`);
  console.log(`   Missing IDs: ${sanity.missingServiceIds.length}`);
  console.log(
    `   Bands: min £${sanity.priceBands.min}, median £${sanity.priceBands.median}, max £${sanity.priceBands.max}`
  );
  if (sanity.mismatches.length) {
    for (const m of sanity.mismatches.slice(0, 5)) {
      console.log(`     - ${m.templateName}: £${m.templatePrice} vs £${m.cataloguePrice}`);
    }
  }

  const list = await api('GET', '/proposal-templates', {
    jar,
    headers: { Authorization: auth.Authorization },
  });
  console.log(`\n📋 GET /proposal-templates: ${list.json?.data?.length ?? 0} templates\n`);

  if (!sanity.passed) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});