#!/usr/bin/env node
/**
 * One-time Revolut Business API OAuth + account discovery.
 *
 * Prereq: In Revolut Business → Settings → APIs → Business API → create certificate
 * (download privatecert.pem, note Client ID).
 *
 * Usage:
 *   node scripts/revolut-business-setup.mjs \
 *     --client-id <id> \
 *     --private-key C:\path\privatecert.pem \
 *     --redirect-uri https://capstonesoftware.co.uk/engage/oauth/revolut-business \
 *     --headed
 *
 * Writes: C:\Users\willi\boardroom\deploy\.revolut-business.env
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const jwt = require(path.join(__dirname, '..', 'backend', 'node_modules', 'jsonwebtoken'));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = process.env.REVOLUT_BUSINESS_ENV_FILE
  || 'C:\\Users\\willi\\boardroom\\deploy\\.revolut-business.env';

function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const clientId = arg('client-id', process.env.REVOLUT_BUSINESS_CLIENT_ID || '');
const privateKeyPath = arg('private-key', process.env.REVOLUT_BUSINESS_PRIVATE_KEY_PATH || '');
const apiUrl = (arg('api-url', process.env.REVOLUT_BUSINESS_API_URL || 'https://b2b.revolut.com')).replace(/\/$/, '');
const redirectUri = arg('redirect-uri', 'https://capstonesoftware.co.uk/engage/oauth/revolut-business');
const headed = process.argv.includes('--headed');
const port = Number(arg('port', '9876'));
const localRedirect = `http://127.0.0.1:${port}/callback`;

if (!clientId || !privateKeyPath) {
  console.error(`Missing --client-id or --private-key.

Create a Business API certificate in Revolut Business → Settings → APIs → Business API.
Then re-run with your Client ID and privatecert.pem path.`);
  process.exit(1);
}

const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

function signAssertion() {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iss: clientId, sub: clientId, aud: 'https://revolut.com', iat: now, exp: now + 300 },
    privateKey,
    { algorithm: 'RS256' },
  );
}

async function exchangeCode(code) {
  const res = await fetch(`${apiUrl}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: signAssertion(),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Token exchange failed (${res.status})`);
  return data;
}

async function refreshToken(refresh) {
  const res = await fetch(`${apiUrl}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: clientId,
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: signAssertion(),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Refresh failed (${res.status})`);
  return data;
}

async function listAccounts(accessToken) {
  const res = await fetch(`${apiUrl}/accounts`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Revolut-Api-Version': '2024-05-01',
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Accounts failed (${res.status})`);
  return data;
}

function waitForCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      const code = url.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Revolut Business connected</h1><p>You can close this tab.</p>');
      server.close();
      if (!code) reject(new Error('No code in callback'));
      else resolve(code);
    });
    server.listen(port, '127.0.0.1', () => {
      console.log(`Local callback listening on ${localRedirect}`);
    });
    server.on('error', reject);
  });
}

async function openConsentUrl() {
  const consent = new URL('https://business.revolut.com/app-confirm');
  consent.searchParams.set('client_id', clientId);
  consent.searchParams.set('redirect_uri', redirectUri);
  consent.searchParams.set('response_type', 'code');
  consent.searchParams.set('scope', 'READ WRITE');
  const url = consent.toString();
  console.log('Open this URL to authorise (add redirect URI in Revolut API settings if needed):');
  console.log(url);

  if (headed) {
    const { chromium } = await import('@playwright/test');
    const browser = await chromium.launch({ headless: false, channel: 'chrome' });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    console.log('Complete consent in the browser window…');
    await page.waitForTimeout(300_000).catch(() => {});
    await browser.close();
  }
}

async function main() {
  const existing = {};
  if (fs.existsSync(ENV_FILE)) {
    for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) existing[m[1].trim()] = m[2].trim();
    }
  }

  let refresh = existing.REVOLUT_BUSINESS_REFRESH_TOKEN;
  let access = existing.REVOLUT_BUSINESS_API_KEY;

  if (!refresh) {
    await openConsentUrl();
    console.log('After Revolut redirects, paste the full callback URL (or just the code):');
    const stdin = await new Promise((r) => {
      process.stdin.setEncoding('utf8');
      let buf = '';
      process.stdin.on('data', (c) => { buf += c; });
      process.stdin.on('end', () => r(buf.trim()));
      if (process.stdin.isTTY) {
        process.stdin.resume();
      } else {
        r('');
      }
    });

    let code = stdin;
    try {
      if (code.includes('code=')) code = new URL(code).searchParams.get('code') || code;
    } catch { /* raw code */ }

    if (!code) throw new Error('Authorization code required');
    const tokens = await exchangeCode(code);
    refresh = tokens.refresh_token;
    access = tokens.access_token;
    console.log('OAuth tokens received.');
  } else {
    const tokens = await refreshToken(refresh);
    access = tokens.access_token;
    if (tokens.refresh_token) refresh = tokens.refresh_token;
    console.log('Refreshed access token from saved refresh token.');
  }

  const accounts = await listAccounts(access);
  const list = Array.isArray(accounts) ? accounts : accounts?.accounts || [];
  const gbp = list.find((a) => (a.currency || '').toUpperCase() === 'GBP') || list[0];
  if (!gbp?.id) throw new Error('No Business account found');

  const pemOneLine = privateKey.replace(/\r?\n/g, '\\n');
  const lines = [
    '# Revolut Business API — Capstone Software Solutions Ltd',
    '# Generated by scripts/revolut-business-setup.mjs',
    `REVOLUT_BUSINESS_API_URL=${apiUrl}`,
    `REVOLUT_BUSINESS_CLIENT_ID=${clientId}`,
    `REVOLUT_BUSINESS_REFRESH_TOKEN=${refresh}`,
    `REVOLUT_BUSINESS_API_KEY=${access}`,
    `REVOLUT_BUSINESS_ACCOUNT_ID=${gbp.id}`,
    `REVOLUT_BUSINESS_PRIVATE_KEY=${pemOneLine}`,
    '# Optional fallback for manual counterparty during rollout',
    '# ENGAGE_DEFAULT_AGENCY_COUNTERPARTY_ID=',
  ];

  fs.mkdirSync(path.dirname(ENV_FILE), { recursive: true });
  fs.writeFileSync(ENV_FILE, lines.join('\n') + '\n');
  console.log(`Saved ${ENV_FILE}`);
  console.log(`Account: ${gbp.name || gbp.id} (${gbp.currency || '?'}) id=${gbp.id}`);
  console.log('Next: .\\scripts\\wire-revolut-business-render.ps1');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});