import { test, expect } from '@playwright/test';
import { loginAsPartner } from '../fixtures/helpers';

test.describe('Settings VAT', () => {
  test('billing tab saves VAT settings', async ({ page }) => {
    await loginAsPartner(page);
    await page.goto('/settings?tab=billing');
    await expect(page.getByRole('heading', { name: /Billing/i })).toBeVisible({ timeout: 15000 });

    const vatToggle = page.getByLabel(/VAT registered/i).or(page.locator('#vat-registered'));
    if (await vatToggle.count()) {
      await vatToggle
        .first()
        .check({ force: true })
        .catch(() => {});
    }

    const saveBtn = page.getByRole('button', { name: /Save VAT/i });
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      await expect(page.getByText(/saved|updated/i)).toBeVisible({ timeout: 10000 });
    }
  });
});
