import { chromium, type FullConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';

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

/** Reuse saved auth when the access token is still valid — avoids rate limits. */
function hasFreshAuth(): boolean {
  if (!fs.existsSync(AUTH_FILE)) return false;
  try {
    const state = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8')) as {
      cookies?: Array<{ name: string; value: string }>;
      origins?: Array<{ localStorage?: Array<{ name: string; value: string }> }>;
    };
    const cookieToken = state.cookies?.find((c) => c.name === 'accessToken')?.value;
    if (cookieToken && isAccessTokenValid(cookieToken)) return true;

    for (const origin of state.origins ?? []) {
      const entry = origin.localStorage?.find((item) => item.name === 'auth-storage');
      if (!entry?.value) continue;
      const parsed = JSON.parse(entry.value) as { state?: { token?: string | null } };
      const token = parsed.state?.token;
      if (token && isAccessTokenValid(token)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Single login before the suite — avoids tripping auth rate limits.
 */
async function globalSetup(config: FullConfig): Promise<void> {
  if (hasFreshAuth()) {
    console.log('[global-setup] Reusing fresh auth session');
    return;
  }

  if (fs.existsSync(AUTH_FILE)) {
    fs.unlinkSync(AUTH_FILE);
  }
  const baseURL = (
    config.projects[0]?.use?.baseURL ||
    process.env.FRONTEND_URL ||
    'http://localhost:5173'
  )
    .toString()
    .replace(/\/$/, '');
  const email = process.env.TEST_USER_EMAIL || 'admin@demo.practice';
  const password = process.env.TEST_USER_PASSWORD || 'DemoPass123!';

  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { 'X-Test-Mode': 'e2e-build' },
  });
  const page = await context.newPage();

  await page.goto(`${baseURL}/login`, { waitUntil: 'load', timeout: 90_000 });
  await page.getByRole('heading', { name: /welcome back/i }).waitFor({ state: 'visible', timeout: 60_000 });
  const emailInput = page.locator('input[type="email"]');
  await emailInput.waitFor({ state: 'visible', timeout: 30_000 });
  await emailInput.fill(email);
  await page.locator('input[type="password"], input[name="password"]').fill(password);

  const submit = page.locator('button[type="submit"]');
  await submit.click();

  try {
    await page.waitForURL(
      (url) => {
        const path = url.pathname.replace(/\/$/, '') || '/';
        return !path.endsWith('/login') && !path.endsWith('/register');
      },
      { timeout: 45_000 }
    );
  } catch {
    const body = await page.locator('body').innerText().catch(() => '');
    throw new Error(`Global login failed at ${page.url()}. Page snippet: ${body.slice(0, 300)}`);
  }

  await context.storageState({ path: AUTH_FILE });
  await browser.close();
  console.log(`[global-setup] Auth saved for ${email}`);
}

export default globalSetup;