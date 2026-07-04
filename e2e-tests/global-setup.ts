import { chromium, type FullConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { e2eExtraHeaders } from './fixtures/e2e-headers';

const AUTH_DIR = path.join(__dirname, '.auth');
const AUTH_FILE = path.join(AUTH_DIR, 'user.json');

function isAccessTokenValid(token: string, bufferMs = 5 * 60 * 1000): boolean {
  try {
    const segment = token.split('.')[1];
    if (!segment) return false;
    const payload = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as { exp?: number };
    return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now() + bufferMs;
  } catch {
    return false;
  }
}

type StorageState = {
  cookies?: Array<{ name: string; value: string }>;
};

async function verifySessionReplay(baseURL: string, headers: Record<string, string>): Promise<void> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL,
    storageState: AUTH_FILE,
    extraHTTPHeaders: headers,
  });
  const page = await context.newPage();
  const mePromise = page.waitForResponse(
    (r) => r.url().includes('/auth/me') && r.status() === 200,
    { timeout: 45_000 },
  );
  await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  const me = await mePromise.catch(() => null);
  await browser.close();
  if (!me) {
    throw new Error('Saved auth state does not restore /auth/me in a fresh browser context');
  }
}

/** Reuse saved auth when token is valid and replay still works. */
async function hasFreshAuth(baseURL: string, headers: Record<string, string>): Promise<boolean> {
  if (!fs.existsSync(AUTH_FILE)) return false;
  try {
    const state = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8')) as StorageState;
    const cookieToken = state.cookies?.find((c) => c.name === 'accessToken')?.value;
    if (!cookieToken || !isAccessTokenValid(cookieToken)) return false;
    await verifySessionReplay(baseURL, headers);
    return true;
  } catch {
    return false;
  }
}

/**
 * Single login before the suite — same-origin API login + verified cookie replay.
 * Production CORS requires Origin on every API request (including browser XHR).
 */
async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = (
    config.projects[0]?.use?.baseURL ||
    process.env.FRONTEND_URL ||
    'https://capstonesoftware.co.uk/engage'
  )
    .toString()
    .replace(/\/$/, '');

  const headers = e2eExtraHeaders('e2e-build');
  const origin = headers.Origin;

  if (await hasFreshAuth(baseURL, headers)) {
    console.log('[global-setup] Reusing fresh auth session');
    return;
  }

  if (fs.existsSync(AUTH_FILE)) {
    fs.unlinkSync(AUTH_FILE);
  }

  const email = process.env.TEST_USER_EMAIL || 'admin@demo.practice';
  const password = process.env.TEST_USER_PASSWORD || 'DemoPass123!';
  const apiLogin = `${baseURL}/api/auth/login`;

  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL,
    extraHTTPHeaders: headers,
  });
  const page = await context.newPage();

  await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded', timeout: 90_000 });

  const loginRes = await page.request.post(apiLogin, {
    data: { email, password },
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    timeout: 90_000,
  });

  if (!loginRes.ok()) {
    const body = await loginRes.text().catch(() => '');
    throw new Error(`Global API login failed (${loginRes.status()}): ${body.slice(0, 300)}`);
  }

  const loginJson = (await loginRes.json()) as { success?: boolean; data?: { csrfToken?: string } };
  if (!loginJson.success) {
    throw new Error(`Global API login rejected: ${JSON.stringify(loginJson).slice(0, 300)}`);
  }

  const meCheck = await page.request.get(`${baseURL}/api/auth/me`, {
    headers: {
      ...headers,
      ...(loginJson.data?.csrfToken ? { 'X-CSRF-Token': loginJson.data.csrfToken } : {}),
    },
    timeout: 30_000,
  });
  if (!meCheck.ok()) {
    throw new Error(`Global /auth/me failed after API login (${meCheck.status()})`);
  }

  await context.storageState({ path: AUTH_FILE });
  await browser.close();

  await verifySessionReplay(baseURL, headers);

  console.log(`[global-setup] Auth saved for ${email} (origin ${origin})`);
}

export default globalSetup;