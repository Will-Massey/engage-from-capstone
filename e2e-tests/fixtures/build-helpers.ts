import { type Page, type APIRequestContext, expect } from '@playwright/test';

export const API_BASE =
  (process.env.API_URL || 'https://engage-backend-e1ue.onrender.com').replace(/\/$/, '') +
  (process.env.API_URL?.endsWith('/api') ? '' : '/api');

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

async function csrfHeader(request: APIRequestContext): Promise<Record<string, string>> {
  const state = await request.storageState();
  const token = state.cookies.find((c) => c.name === 'csrfToken')?.value;
  return token ? { 'X-CSRF-Token': token } : {};
}

function apiTimeout(path: string): number {
  return path.includes('/ai/') ? 120_000 : 30_000;
}

export async function apiGet(request: APIRequestContext, path: string): Promise<any> {
  const res = await request.get(`${API_BASE}${path}`, {
    headers: E2E_HEADERS,
    timeout: apiTimeout(path),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status(), body };
}

export async function apiPost(request: APIRequestContext, path: string, data?: object): Promise<any> {
  const res = await request.post(`${API_BASE}${path}`, {
    data: data ?? {},
    headers: { ...E2E_HEADERS, ...(await csrfHeader(request)) },
    timeout: apiTimeout(path),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status(), body };
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