import { test, expect } from '@playwright/test';
import { loginAsPartner } from '../fixtures/helpers';

test.describe('Settings deep links', () => {
  test('automation tab loads from query param', async ({ page }) => {
    await loginAsPartner(page);
    await page.goto('/settings?tab=automation');
    await expect(page.getByRole('heading', { name: /Automated Client Touchpoints/i })).toBeVisible({
      timeout: 15000,
    });
  });
});
