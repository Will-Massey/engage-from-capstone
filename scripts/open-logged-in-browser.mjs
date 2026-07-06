#!/usr/bin/env node
/**
 * Verify API login and open Engage in the system browser.
 * Usage: node scripts/open-logged-in-browser.mjs
 */
import { execSync } from 'node:child_process';

const BASE = (process.env.FRONTEND_URL || 'https://capstonesoftware.co.uk/engage').replace(
  /\/$/,
  ''
);
const API = `${BASE}/api`;
const EMAIL = process.env.SMOKE_EMAIL || 'william@capstonesoftware.co.uk';
const PASSWORD = process.env.SMOKE_PASSWORD || 'Engage2026!';

console.log(`Checking login for ${EMAIL}…`);

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 60_000);

let loginRes;
try {
  loginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    signal: controller.signal,
  });
} catch (err) {
  console.error('API login request failed:', err.message || err);
  process.exit(1);
} finally {
  clearTimeout(timer);
}

const body = await loginRes.json().catch(() => ({}));
if (!loginRes.ok || !body?.success) {
  console.error('Login rejected:', loginRes.status, body);
  process.exit(1);
}

console.log(`OK — signed in as ${body.data?.user?.email || EMAIL}`);
console.log(`Opening ${BASE}/ in your browser…`);

try {
  execSync(`start msedge "${BASE}/"`, { shell: 'cmd.exe', stdio: 'ignore' });
} catch {
  execSync(`start "" "${BASE}/"`, { shell: 'cmd.exe', stdio: 'ignore' });
}

console.log('If you see the login page, sign in with:');
console.log(`  Email:    ${EMAIL}`);
console.log(`  Password: ${PASSWORD}`);
