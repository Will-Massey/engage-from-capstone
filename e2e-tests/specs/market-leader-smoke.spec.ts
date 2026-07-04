import { test, expect } from '@playwright/test';
import { expectNoErrorToasts, apiGet, expectOkApi, gotoApp } from '../fixtures/build-helpers';

test.describe('Build smoke — market leader batch (845effcf)', () => {
  test('First proposal wizard opens from dashboard', async ({ page }) => {
    await gotoApp(page, '/proposals/first-wizard');
    await page.waitForLoadState('domcontentloaded');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText(/first proposal wizard/i)).toBeVisible();
    await expect(
      dialog.getByRole('heading', { name: /create your first proposal in five minutes/i })
    ).toBeVisible();

    await expectNoErrorToasts(page);
  });

  test('Bulk renewal wizard page loads', async ({ page }) => {
    await gotoApp(page, '/proposals/renewals');
    await expect(page).toHaveURL(/\/proposals\/renewals/);
    await expect(page.getByRole('heading', { name: /bulk renewal wizard/i })).toBeVisible();
    await expect(page.getByText(/contracts renewing on or before/i)).toBeVisible();
    await expectNoErrorToasts(page);
  });

  test('Manual proposal flow loads without error toasts', async ({ page }) => {
    await gotoApp(page, '/proposals/new?manual=1');
    await page.waitForSelector('[data-testid="client-card"]', { timeout: 30_000 });
    await expectNoErrorToasts(page, 1500);

    await page.locator('[data-testid="client-card"]').first().click();

    // manual=1 skips the build-mode chooser and goes straight to manual path
    await expect(page.getByText(/how would you like to build this proposal/i)).not.toBeVisible();
    await expect(page.getByText(/manual build/i)).toBeVisible();

    await page.locator('[data-testid="client-continue-button"]').click();
    await page.waitForSelector('[data-testid="available-service-row"]', { timeout: 30_000 });
    await expectNoErrorToasts(page);
  });

  test('Win/loss analytics API and page reachable', async ({ request, page }) => {
    const result = await apiGet(request, '/analytics/win-loss');
    await expectOkApi('win-loss analytics', result);

    await gotoApp(page, '/analytics');
    await expect(page).toHaveURL(/\/analytics/);
    await expect(page.getByRole('heading', { name: /^Analytics$/i })).toBeVisible({
      timeout: 30_000,
    });

    const winLossHeading = page.getByRole('heading', { name: /win \/ loss/i });
    const noData = page.getByRole('heading', { name: /no data available/i });
    await expect(winLossHeading.or(noData)).toBeVisible({ timeout: 45_000 });
    await expectNoErrorToasts(page);
  });

  test('MFA settings page loads with 2FA setup UI', async ({ page }) => {
    await gotoApp(page, '/settings?tab=security');
    await expect(page).toHaveURL(/tab=security/);
    await expect(page.getByText(/two-factor authentication/i).first()).toBeVisible();

    const enableBtn = page.getByRole('button', { name: /enable 2fa/i });
    const enabledLabel = page.getByText(/2fa is enabled/i);
    await expect(enableBtn.or(enabledLabel)).toBeVisible();
    await expectNoErrorToasts(page);

    if (await enableBtn.isVisible()) {
      await enableBtn.click();
      await expect(page).toHaveURL(/\/2fa-setup/, { timeout: 15_000 });
      await expect(
        page
          .getByRole('heading', { name: /set up two-factor authentication/i })
          .or(page.getByText(/preparing two-factor authentication/i))
          .or(page.getByText(/scan this qr code/i))
      ).toBeVisible({ timeout: 45_000 });
      await expectNoErrorToasts(page);
    }
  });

  test('Pricing calculator page is accessible', async ({ page }) => {
    await gotoApp(page, '/pricing-calculator');
    await expect(page).toHaveURL(/\/pricing-calculator/);
    await expect(
      page.getByRole('heading', { name: 'Pricing calculator', exact: true }).first()
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Value-based pricing calculator' })
    ).toBeVisible();
    await expect(page.getByText(/client profile/i)).toBeVisible();
    await expectNoErrorToasts(page);
  });
});