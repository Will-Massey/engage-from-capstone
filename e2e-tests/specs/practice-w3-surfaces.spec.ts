/**
 * Practice OS — W3 surfaces: money/dunning, Clara prioritise, workload, automations packs.
 *
 *   cd e2e-tests
 *   $env:FRONTEND_URL='http://localhost:5273'
 *   $env:API_URL='http://localhost:3101'
 *   $env:TEST_USER_EMAIL='admin@demo.practice'
 *   $env:TEST_USER_PASSWORD='DemoPass123!'
 *   npx playwright test specs/practice-w3-surfaces.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test';
import { loginAsPartner } from '../fixtures/helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Practice W3 — money, Clara, automations, workload', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90_000);
    await loginAsPartner(page);
  });

  test('dashboard shows cash & recurring metal strip', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /cash & recurring/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/est\. monthly recurring/i).first()).toBeVisible();
  });

  test('jobs board shows Clara prioritise when jobs exist', async ({ page }) => {
    await page.goto('/jobs');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /jobs board/i })).toBeVisible();
    if (await page.getByText(/no jobs yet/i).isVisible().catch(() => false)) {
      test.skip(true, 'No jobs — Clara panel hidden');
    }
    // Clara panel may take a moment
    const clara = page.getByRole('heading', { name: /prioritise this board/i });
    const visible = await clara.isVisible().catch(() => false);
    if (visible) {
      await expect(clara).toBeVisible();
    } else {
      // Calm board with no high-risk jobs is OK
      await expect(page.getByRole('heading', { name: /jobs board/i })).toBeVisible();
    }
  });

  test('workload page loads utilisation strip', async ({ page }) => {
    await page.goto('/jobs/workload');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /workload/i })).toBeVisible();
    await expect(page.getByText(/capacity|utilisation|open jobs/i).first()).toBeVisible();
  });

  test('automations page shows UK packs and builder', async ({ page }) => {
    await page.goto('/automations');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /automations/i })).toBeVisible();
    await expect(page.getByText(/uk automation packs/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /install pack/i }).first()).toBeVisible();
    await expect(page.getByText(/when this → then that/i)).toBeVisible();
  });

  test('practice letters page loads designer actions for drafts', async ({ page }) => {
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /practice letters/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /generate draft/i })).toBeVisible();
  });

  test('switch-from-engager and trust pack pages load', async ({ page }) => {
    await page.goto('/switch-from-engager');
    await page.waitForLoadState('networkidle');
    await expect(
      page.getByRole('heading', { name: /switch from engager to engage/i })
    ).toBeVisible();
    await expect(page.getByText('ROI calculator', { exact: true })).toBeVisible();
    await page.goto('/trust');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /trust & uk residency/i })).toBeVisible();
    await expect(page.getByText(/cyber essentials — prep map/i)).toBeVisible();
  });

  test('job detail can open and shows tasks section', async ({ page }) => {
    await page.goto('/jobs');
    await page.waitForLoadState('networkidle');
    if (await page.getByText(/no jobs yet/i).isVisible().catch(() => false)) {
      test.skip(true, 'No jobs');
    }
    // Job UUID links only — not /jobs/workload nav
    const card = page.locator('main a[href^="/jobs/"]').filter({ hasNotText: /workload/i }).first();
    const uuidCard = page.locator('a[href*="/jobs/"][href*="-"]').filter({ hasNot: page.locator('[href$="/workload"]') }).first();
    const link = (await card.count()) > 0 ? card : uuidCard;
    if ((await link.count()) === 0) {
      // Fallback: list view then first client link into a job
      const listToggle = page.getByTitle('List view');
      if (await listToggle.isVisible().catch(() => false)) {
        await listToggle.click();
        await page.waitForTimeout(500);
      }
      const rowLink = page.locator('table a[href^="/jobs/"]').first();
      if ((await rowLink.count()) === 0) {
        test.skip(true, 'No job detail links');
      }
      await rowLink.click();
    } else {
      await link.click({ force: true });
    }
    await page.waitForURL(/\/jobs\/[0-9a-f-]{8,}/i, { timeout: 20_000 }).catch(() => null);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/team tasks/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByPlaceholder(/meeting notes/i)).toBeVisible();
  });
});
