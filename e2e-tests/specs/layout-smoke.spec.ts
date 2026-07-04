import { test, expect } from '@playwright/test';
import { expectNoErrorToasts, gotoApp } from '../fixtures/build-helpers';

async function waitForDashboard(page: import('@playwright/test').Page) {
  await gotoApp(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('body')).toContainText(/proposal|dashboard|welcome|clara/i, {
    timeout: 25_000,
  });
}

test.describe('Layout UAT — sendit v4.0 UI fixes', () => {
  test('sidebar footer shows full user name', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await waitForDashboard(page);

    const sidebarName = page.locator('aside.lg\\:flex').getByText('Admin User', { exact: true });
    await expect(sidebarName).toBeVisible();
    await expectNoErrorToasts(page);
  });

  test('header shows full name and respects safe-area padding', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await waitForDashboard(page);

    await expect(page.locator('span.truncate', { hasText: 'Admin User' })).toBeVisible({
      timeout: 15_000,
    });

    const headerWrap = page.locator('.pr-\\[max\\(1rem\\,env\\(safe-area-inset-right\\)\\)\\]').first();
    await expect(headerWrap).toBeVisible();
  });

  test('AI panel opens and scales within viewport on resize', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await waitForDashboard(page);

    await page
      .getByRole('button', { name: /open clara, your engage proposal co-pilot/i })
      .click();
    const panel = page.locator('.fixed.z-\\[59\\]').first();
    await expect(panel).toBeVisible({ timeout: 10_000 });

    const box1280 = await panel.boundingBox();
    expect(box1280).not.toBeNull();
    expect(box1280!.width).toBeLessThanOrEqual(1280);
    expect(box1280!.height).toBeLessThanOrEqual(800);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    const boxMobile = await panel.boundingBox();
    expect(boxMobile).not.toBeNull();
    expect(boxMobile!.width).toBeLessThanOrEqual(390);
    expect(boxMobile!.height).toBeLessThanOrEqual(844);

    await expectNoErrorToasts(page);
  });
});