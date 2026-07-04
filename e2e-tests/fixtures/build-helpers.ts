import { type Page, type APIRequestContext, expect } from '@playwright/test';

export type ProposalBuildMode = 'manual' | 'clara';

/** Step 1: pick a client on /proposals/new */
export async function selectFirstProposalClient(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="client-card"]', { timeout: 30_000 });
  const card = page.locator('[data-testid="client-card"]').first();
  await expect(card).toBeVisible();
  await card.click();
}

/**
 * Step 1b: choose build mode when the chooser is shown.
 * Skips when manual=1/guided=1 already set build mode on load.
 */
export async function chooseProposalBuildMode(
  page: Page,
  mode: ProposalBuildMode = 'manual'
): Promise<void> {
  const chooser = page.getByText(/how would you like to build this proposal/i);
  const visible = await chooser.isVisible({ timeout: 10_000 }).catch(() => false);
  if (!visible) return;

  const testId = mode === 'clara' ? 'build-mode-clara' : 'build-mode-manual';
  const modeButton = page.locator(`[data-testid="${testId}"]`);
  if (await modeButton.isVisible({ timeout: 15_000 }).catch(() => false)) {
    await modeButton.click();
  } else if (mode === 'manual') {
    // AI not configured — fallback "Continue manually" button
    await page.getByRole('button', { name: /continue manually/i }).click();
  } else {
    throw new Error(`Build mode "${mode}" not available (Clara may be unconfigured)`);
  }

  await expect(page.locator('[data-testid="client-continue-button"]')).toBeVisible({
    timeout: 10_000,
  });
}

/** Steps 1 → 2: client, build mode, continue to services catalogue */
export async function advanceToProposalServicesStep(
  page: Page,
  mode: ProposalBuildMode = 'manual'
): Promise<void> {
  await selectFirstProposalClient(page);
  await chooseProposalBuildMode(page, mode);
  await page.locator('[data-testid="client-continue-button"]').click();
  await page.waitForSelector('[data-testid="available-service-row"]', { timeout: 30_000 });
}

export const FRONTEND_ORIGIN = (
  process.env.FRONTEND_URL || 'https://capstonesoftware.co.uk/engage'
).replace(/\/$/, '');

export const API_BASE =
  (process.env.API_URL || 'https://engage.capstonesoftware.co.uk').replace(/\/$/, '') +
  (process.env.API_URL?.endsWith('/api') ? '' : '/api');

/** Navigate under the /engage app base — Playwright baseURL strips path on leading-slash URLs. */
export async function gotoApp(page: Page, path: string): Promise<void> {
  const rel = path.startsWith('/') ? path : `/${path}`;
  await page.goto(`${FRONTEND_ORIGIN}${rel}`);
}

const E2E_HEADERS = { 'X-Test-Mode': 'e2e-build' };

const ERROR_TOAST_PATTERNS = [
  /couldn't complete that request/i,
  /route.*not found/i,
  /no templates found/i,
  /too many authentication attempts/i,
  /refresh token is required/i,
  /too many requests/i,
];

/** Fail if any error-style toast appeared (react-hot-toast). */
export async function expectNoErrorToasts(page: Page, settleMs = 2500): Promise<void> {
  await page.waitForTimeout(settleMs);
  for (const pattern of ERROR_TOAST_PATTERNS) {
    const toast = page.getByText(pattern);
    const count = await toast.count();
    if (count > 0) {
      const texts = await toast.allTextContents();
      throw new Error(`Unexpected error toast: ${texts.join(' | ')}`);
    }
  }
}

function isAccessTokenValid(token: string, bufferMs = 60_000): boolean {
  try {
    const segment = token.split('.')[1];
    if (!segment) return false;
    const payload = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as { exp?: number };
    return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now() + bufferMs;
  } catch {
    return false;
  }
}

async function authHeadersFromState(
  request: APIRequestContext,
): Promise<Record<string, string>> {
  const state = await request.storageState();
  const headers: Record<string, string> = {};

  const accessCookie = state.cookies.find((c) => c.name === 'accessToken')?.value;
  const csrfCookie = state.cookies.find((c) => c.name === 'csrfToken')?.value;

  let bearer =
    accessCookie && isAccessTokenValid(accessCookie) ? accessCookie : undefined;

  if (!bearer) {
    for (const origin of state.origins ?? []) {
      const entry = origin.localStorage?.find((item) => item.name === 'auth-storage');
      if (!entry?.value) continue;
      try {
        const parsed = JSON.parse(entry.value) as { state?: { token?: string | null } };
        const token = parsed.state?.token ?? undefined;
        if (token && isAccessTokenValid(token)) {
          bearer = token;
          break;
        }
      } catch {
        /* ignore malformed storage */
      }
    }
  }

  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  if (csrfCookie) headers['X-CSRF-Token'] = csrfCookie;
  return headers;
}

function apiTimeout(path: string): number {
  return path.includes('/ai/') ? 120_000 : 30_000;
}

export async function apiGet(request: APIRequestContext, path: string): Promise<any> {
  const res = await request.get(`${API_BASE}${path}`, {
    headers: { ...E2E_HEADERS, ...(await authHeadersFromState(request)) },
    timeout: apiTimeout(path),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status(), body };
}

export async function apiPost(request: APIRequestContext, path: string, data?: object): Promise<any> {
  const res = await request.post(`${API_BASE}${path}`, {
    data: data ?? {},
    headers: { ...E2E_HEADERS, ...(await authHeadersFromState(request)) },
    timeout: apiTimeout(path),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status(), body };
}

export async function apiDelete(request: APIRequestContext, path: string): Promise<any> {
  const res = await request.delete(`${API_BASE}${path}`, {
    headers: { ...E2E_HEADERS, ...(await authHeadersFromState(request)) },
    timeout: apiTimeout(path),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status(), body };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isTransientApiFailure(err: unknown, status?: number): boolean {
  if (status !== undefined && status >= 500) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /socket hang up|ECONNRESET|ETIMEDOUT|timeout|502|503|504/i.test(msg);
}

/** Retry AI POSTs — Render can drop long-running inference requests. */
export async function apiPostResilient(
  request: APIRequestContext,
  path: string,
  data?: object,
  attempts = 3
): Promise<{ status: number; body: any }> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const result = await apiPost(request, path, data);
      if (isTransientApiFailure(null, result.status) && i < attempts - 1) {
        await sleep(3000 * (i + 1));
        continue;
      }
      return result;
    } catch (err) {
      lastErr = err;
      if (!isTransientApiFailure(err) || i === attempts - 1) throw err;
      await sleep(3000 * (i + 1));
    }
  }
  throw lastErr ?? new Error(`apiPostResilient failed for ${path}`);
}

export async function expectOkApi(
  label: string,
  result: { status: number; body: any },
  opts?: { allow404?: boolean }
): Promise<void> {
  if (opts?.allow404 && result.status === 404) return;
  expect(result.status, `${label} HTTP status`).toBeLessThan(400);
  expect(result.body?.success, `${label} success flag`).toBeTruthy();
}