#!/usr/bin/env node
/** Smoke Revolut Business API /accounts using boardroom/.revolut-business.env */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const jwt = require(path.join(__dirname, '..', 'backend', 'node_modules', 'jsonwebtoken'));

const envFile = process.env.REVOLUT_BUSINESS_ENV_FILE
  || 'C:\\Users\\willi\\boardroom\\deploy\\.revolut-business.env';

if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
}

const base = (process.env.REVOLUT_BUSINESS_API_URL || 'https://b2b.revolut.com').replace(/\/$/, '');
const clientId = process.env.REVOLUT_BUSINESS_CLIENT_ID;
const refresh = process.env.REVOLUT_BUSINESS_REFRESH_TOKEN;
const privateKey = (process.env.REVOLUT_BUSINESS_PRIVATE_KEY || '').replace(/\\n/g, '\n');
let token = process.env.REVOLUT_BUSINESS_API_KEY;

if (refresh && clientId && privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    { iss: clientId, sub: clientId, aud: 'https://revolut.com', iat: now, exp: now + 300 },
    privateKey,
    { algorithm: 'RS256' },
  );
  const tr = await fetch(`${base}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: clientId,
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: assertion,
    }),
  });
  const td = await tr.json().catch(() => ({}));
  if (!tr.ok) {
    console.error('[uat] FAIL token refresh', tr.status, td.message || td);
    process.exit(1);
  }
  token = td.access_token;
}

if (!token) {
  console.error('[uat] FAIL — no Business API credentials (.revolut-business.env missing?)');
  process.exit(1);
}

const res = await fetch(`${base}/accounts`, {
  headers: {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Revolut-Api-Version': '2024-05-01',
  },
});
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error('[uat] FAIL accounts', res.status, body.message || body);
  process.exit(1);
}

const accounts = Array.isArray(body) ? body : body.accounts || [];
console.log('[uat] PASS Business API — accounts:', accounts.length);
for (const a of accounts.slice(0, 5)) {
  console.log(`  - ${a.name || a.id} ${a.currency || ''} id=${a.id}`);
}