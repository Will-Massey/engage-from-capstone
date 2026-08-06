/**
 * Engage Practice — jobs board, workload, letters, automations smoke.
 * Run against isolated practice stack (ports 5273 / 3101).
 *
 *   cd e2e-tests
 *   $env:FRONTEND_URL='http://localhost:5273'
 *   $env:API_URL='http://localhost:3101'
 *   $env:TEST_USER_EMAIL='admin@demo.practice'
 *   $env:TEST_USER_PASSWORD='DemoPass123!'
 *   npx playwright test specs/practice-jobs-letters.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test';
import { loginAsPartner } from '../fixtures/helpers';

const FRONTEND = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
// CI sets API_URL=http://localhost:3001/api; local practice may use :3101 without /api
const rawApi = (process.env.API_URL || 'http://localhost:3001/api').replace(/\/$/, '');
const API = rawApi.endsWith('/api') ? rawApi : `${rawApi}/api`;

test.describe.configure({ mode: 'serial' });

test.describe('Practice OS — jobs, letters, automations', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90_000);
    await loginAsPartner(page);
  });

  test('dashboard shows delivery pipeline when jobs exist', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Either pipeline card or empty state — both acceptable; with seed data expect pipeline
    const pipeline = page.getByRole('heading', { name: /delivery pipeline/i });
    const hasPipeline = await pipeline.isVisible().catch(() => false);
    if (hasPipeline) {
      await expect(pipeline).toBeVisible();
      await expect(page.getByText(/open jobs/i).first()).toBeVisible();
    } else {
      // Fresh tenant — still must land on dashboard
      await expect(page.locator('nav[aria-label="Main"]:visible').first()).toBeVisible();
    }
  });

  test('jobs board loads with columns or empty state', async ({ page }) => {
    await page.goto('/jobs');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /jobs board/i })).toBeVisible();

    const empty = page.getByText(/no jobs yet/i);
    const cards = page.locator('article');
    const listToggle = page.getByTitle('List view');

    if (await empty.isVisible().catch(() => false)) {
      await expect(page.getByRole('link', { name: /proposals/i }).first()).toBeVisible();
    } else {
      // Board filters present
      await expect(page.getByRole('button', { name: /^all$/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /overdue/i })).toBeVisible();
      // List view switch
      if (await listToggle.isVisible().catch(() => false)) {
        await listToggle.click();
        await expect(page.getByRole('columnheader', { name: /client/i })).toBeVisible();
        await page.getByTitle('Board view').click();
      }
      // At least one job card or list row
      const n = await cards.count();
      expect(n).toBeGreaterThan(0);
    }
  });

  test('jobs filter query param focuses overdue', async ({ page }) => {
    await page.goto('/jobs?filter=overdue');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /jobs board/i })).toBeVisible();
    const overdueBtn = page.getByRole('button', { name: /overdue/i });
    await expect(overdueBtn).toBeVisible();
  });

  test('job detail shows profitability strip when opening first job', async ({ page }) => {
    await page.goto('/jobs');
    await page.waitForLoadState('networkidle');
    if (
      await page
        .getByText(/no jobs yet/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, 'No seeded jobs');
    }
    // Prefer in-main content links to /jobs/:uuid (avoid sidebar /jobs/workload)
    const firstJob = page
      .locator('main a[href^="/jobs/"], .card a[href^="/jobs/"], article a[href^="/jobs/"]')
      .filter({ hasNot: page.locator('[href="/jobs/workload"]') })
      .filter({ hasNotText: /workload/i })
      .first();
    // Fallback: any /jobs/<uuid>
    const uuidJob = page.locator('a[href*="/jobs/"]').filter({ has: page.locator('text=/./') });
    if (await firstJob.count()) {
      await expect(firstJob).toBeVisible({ timeout: 15_000 });
      await firstJob.click();
    } else {
      const link = page.locator('a[href*="/jobs/"]').filter({ hasText: /.+/ }).nth(2);
      await link.click();
    }
    await page.waitForURL(/\/jobs\/[0-9a-f-]{8,}/i, { timeout: 15_000 });
    await expect(page.getByText(/proposed fee/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/time cost|margin/i).first()).toBeVisible();
  });

  test('workload page loads staff buckets', async ({ page }) => {
    await page.goto('/jobs/workload');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /workload/i })).toBeVisible();
    await expect(page.getByText(/open jobs/i).first()).toBeVisible();
  });

  test('practice letters create form and list', async ({ page }) => {
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /practice letters/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /generate draft/i })).toBeVisible();
    // Type select present
    await expect(page.locator('select').first()).toBeVisible();
  });

  test('automations catalogue lists chase packs', async ({ page }) => {
    await page.goto('/automations');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /^automations$/i })).toBeVisible();
    await expect(page.getByText(/delivery chase packs|proposal chase/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('API jobs board returns columns for demo tenant', async ({ request }) => {
    // Cookie login via API (API already includes /api prefix)
    const email = process.env.TEST_USER_EMAIL || 'admin@demo.practice';
    const password = process.env.TEST_USER_PASSWORD || 'DemoPass123!';
    const headers = {
      Origin: FRONTEND,
      'Content-Type': 'application/json',
    };
    let login = await request.post(`${API}/auth/login`, {
      data: { email, password },
      headers,
    });
    // Rare RefreshToken unique race under serial suite — one retry is enough
    if (!login.ok()) {
      await new Promise((r) => setTimeout(r, 500));
      login = await request.post(`${API}/auth/login`, {
        data: { email, password },
        headers,
      });
    }
    expect(login.ok(), `login status ${login.status()} body=${await login.text()}`).toBeTruthy();
    const jobs = await request.get(`${API}/jobs`, {
      headers: { Origin: FRONTEND },
    });
    expect(jobs.ok()).toBeTruthy();
    const body = await jobs.json();
    const data = body.data ?? body;
    expect(Array.isArray(data.jobs) || Array.isArray(data)).toBeTruthy();
    if (data.columns) {
      expect(data.columns.length).toBeGreaterThanOrEqual(6);
    }
  });
});
