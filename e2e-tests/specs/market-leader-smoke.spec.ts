import { test, expect } from '@playwright/test';
import { expectNoErrorToasts, apiGet, expectOkApi } from '../fixtures/build-helpers';

test.describe('Build smoke — market leader batch (845effcf)', () => {
  test('First proposal wizard opens from dashboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Clear dismissal so auto-open can trigger when tenant has no sent proposals yet
    await page.evaluate(() => {
      try {
        const raw = localStorage.getItem('engage-wizard-dismissed');
        if (!raw) return;
        const parsed = JSON.parse(raw) as Record<string, boolean>;
        for (const key of Object.keys(parsed)) delete parsed[key];
        localStorage.setItem('engage-wizard-dismissed', JSON.stringify(parsed));
      } catch {
        localStorage.removeItem('engage-wizard-dismissed');
      }
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    const dialog = page.getByRole('dialog');
    const openBtn = page.getByRole('button', { name: /open first proposal wizard/i });

    const dialogVisible = await dialog
      .isVisible({ timeout: 8_000 })
      .catch(() => false);

    if (dialogVisible) {
      await expect(dialog.getByText(/first proposal wizard/i)).toBeVisible();
      await expect(
        dialog.getByRole('heading', { name: /create your first proposal in five minutes/i })
      ).toBeVisible();
    } else if (await openBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await openBtn.click();
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(/first proposal wizard/i)).toBeVisible();
    } else {
      test.skip(
        true,
        'Demo tenant already has sent proposals — wizard entry hidden on dashboard'
      );
    }

    await expectNoErrorToasts(page);
  });

  test('Bulk renewal wizard page loads', async ({ page }) => {
    await page.goto('/proposals/renewals');
    await expect(page).toHaveURL(/\/proposals\/renewals/);
    await expect(page.getByRole('heading', { name: /bulk renewal wizard/i })).toBeVisible();
    await expect(page.getByText(/contracts renewing on or before/i)).toBeVisible();
    await expectNoErrorToasts(page);
  });

  test('Manual proposal flow loads without error toasts', async ({ page }) => {
    await page.goto('/proposals/new?manual=1');
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

    await page.goto('/analytics');
    await expect(page).toHaveURL(/\/analytics/);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /win \/ loss/i })).toBeVisible({
      timeout: 30_000,
    });
    await expectNoErrorToasts(page);
  });

  test('MFA settings page loads with 2FA setup UI', async ({ page }) => {
    await page.goto('/settings?tab=security');
    await expect(page).toHaveURL(/tab=security/);
    await expect(page.getByText(/two-factor authentication/i).first()).toBeVisible();

    const enableBtn = page.getByRole('button', { name: /enable 2fa/i });
    const enabledLabel = page.getByText(/2fa is enabled/i);
    await expect(enableBtn.or(enabledLabel)).toBeVisible();
    await expectNoErrorToasts(page);

    if (await enableBtn.isVisible()) {
      await page.goto('/2fa-setup');
      await expect(
        page
          .getByRole('heading', { name: /set up two-factor authentication/i })
          .or(page.getByText(/preparing two-factor authentication/i))
      ).toBeVisible({ timeout: 30_000 });
      await expectNoErrorToasts(page);
    }
  });

  test('Pricing calculator page is accessible', async ({ page }) => {
    await page.goto('/pricing-calculator');
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