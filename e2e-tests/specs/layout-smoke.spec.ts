import { test, expect } from '@playwright/test';
import { expectNoErrorToasts, gotoApp } from '../fixtures/build-helpers';

function sidebarUserName(page: import('@playwright/test').Page) {
  return page
    .locator('[data-testid="sidebar-user-name"]')
    .or(page.locator('aside.lg\\:flex').getByText('Admin User', { exact: true }));
}

function headerUserName(page: import('@playwright/test').Page) {
  return page
    .locator('[data-testid="header-user-name"]')
    .or(page.locator('span.truncate', { hasText: 'Admin User' }));
}

function aiPanel(page: import('@playwright/test').Page) {
  return page
    .locator('[data-testid="ai-assistant-panel"]')
    .or(page.locator('.fixed.z-\\[59\\]').first());
}

async function waitForDashboard(page: import('@playwright/test').Page) {
  await gotoApp(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await expect(sidebarUserName(page)).toBeVisible({ timeout: 30_000 });
}

test.describe('Layout UAT — sendit v4.0 UI fixes', () => {
  test('sidebar footer shows full user name', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await waitForDashboard(page);

    await expect(sidebarUserName(page)).toHaveText('Admin User');
    await expectNoErrorToasts(page);
  });

  test('header shows full name and respects safe-area padding', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await waitForDashboard(page);

    await expect(headerUserName(page)).toHaveText('Admin User');
    await expect(
      page.locator('[data-testid="app-header"]').or(page.locator('.pr-\\[max\\(1rem\\,env\\(safe-area-inset-right\\)\\)\\]').first())
    ).toBeVisible();
  });

  test('AI panel opens and scales within viewport on resize', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await waitForDashboard(page);

    await page
      .getByRole('button', { name: /open clara, your engage proposal co-pilot/i })
      .click();
    const panel = aiPanel(page);
    await expect(panel).toBeVisible({ timeout: 15_000 });

    const box1280 = await panel.boundingBox();
    expect(box1280).not.toBeNull();
    expect(box1280!.width).toBeLessThanOrEqual(1280);
    expect(box1280!.height).toBeLessThanOrEqual(800);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(panel).toBeVisible();
    const boxMobile = await panel.boundingBox();
    expect(boxMobile).not.toBeNull();
    expect(boxMobile!.width).toBeLessThanOrEqual(390);
    expect(boxMobile!.height).toBeLessThanOrEqual(844);

    await expectNoErrorToasts(page);
  });
});