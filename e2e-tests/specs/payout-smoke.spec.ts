import { test, expect } from '@playwright/test';
import {
  apiGet,
  expectNoErrorToasts,
  expectOkApi,
  gotoApp,
  gotoAppAuthenticated,
} from '../fixtures/build-helpers';

test.describe('Payout collection UAT — sendit v4.0', () => {
  test('Settings → Billing shows Receive Payments Through Engage', async ({ page }) => {
    await gotoAppAuthenticated(page, '/settings?tab=billing');
    await expect(page.getByRole('heading', { name: /VAT & Billing Settings/i })).toBeVisible({
      timeout: 20_000,
    });

    const section = page.locator('[data-testid="receive-payments-through-engage"]');
    await expect(section).toBeVisible();
    await expect(section.getByText(/Receive Payments Through Engage/i)).toBeVisible();
    await expect(page.locator('[data-testid="payout-enabled"]')).toBeVisible();

    await expectNoErrorToasts(page);
  });

  test('payout settings API returns tenant defaults', async ({ request }) => {
    const result = await apiGet(request, '/payout/settings');
    await expectOkApi('payout settings', result);
    expect(result.body.data).toMatchObject({
      enabled: expect.any(Boolean),
      allowRevolutPay: expect.any(Boolean),
      allowCard: expect.any(Boolean),
      platformFeeBps: expect.any(Number),
    });
  });

  test('payment collection legal pages load', async ({ page }) => {
    await gotoApp(page, '/legal/payment-collection-terms');
    await expect(page.getByText(/Payment Collection Terms/i).first()).toBeVisible({
      timeout: 15_000,
    });

    await gotoApp(page, '/legal/client-payment-authorisation');
    await expect(page.getByText(/Client Payment Authorisation/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});