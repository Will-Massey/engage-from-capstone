#!/usr/bin/env node
/**
 * Production smoke test — ping, login (cookie session), list proposals.
 * Usage: node scripts/production-smoke.mjs [API_URL]
 */
const API = (
  process.argv[2] ||
  process.env.API_URL ||
  'https://engage-backend-e1ue.onrender.com'
).replace(/\/$/, '');
const EMAIL = process.env.SMOKE_EMAIL || 'admin@demo.practice';
const PASSWORD = process.env.SMOKE_PASSWORD || 'DemoPass123!';

const jar = new Map();

function parseSetCookie(headers) {
  const raw = headers.getSetCookie?.() || [];
  for (const line of raw) {
    const [pair] = line.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function request(path, options = {}) {
  const url = `${API}${path.startsWith('/api') ? path : `/api${path}`}`;
  const headers = { ...(options.headers || {}) };
  if (jar.size) headers.Cookie = cookieHeader();
  const res = await fetch(url, { ...options, headers, redirect: 'manual' });
  parseSetCookie(res.headers);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function main() {
  console.log(`Smoke test → ${API}`);

  const ping = await fetch(`${API}/ping`);
  if (!ping.ok) {
    console.error('FAIL ping', ping.status);
    process.exit(1);
  }
  console.log('OK ping');

  const login = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  if (!login.body?.success) {
    console.error('FAIL login', login.status, login.body);
    process.exit(1);
  }
  if (login.body.data?.tokens) {
    console.warn('WARN login still returns tokens in body');
  }
  console.log('OK login (cookie session)');

  const csrfRes = await request('/auth/csrf-token', { method: 'GET' });
  const csrfToken = csrfRes.body?.data?.csrfToken || jar.get('csrfToken');
  if (!csrfToken) {
    console.error('FAIL csrf token after login', csrfRes.status, csrfRes.body);
    process.exit(1);
  }
  console.log('OK csrf');

  const proposals = await request('/proposals?limit=1', {
    headers: { 'X-CSRF-Token': csrfToken },
  });
  if (proposals.status !== 200 || !proposals.body?.success) {
    console.error('FAIL proposals', proposals.status, proposals.body);
    process.exit(1);
  }
  console.log('OK proposals list');

  console.log('All smoke checks passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
