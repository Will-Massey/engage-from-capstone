import { test, expect } from '@playwright/test';
import { loginAsPartner } from '../fixtures/helpers';

test.describe('Cookie auth session', () => {
  test('login establishes session without localStorage token', async ({ page }) => {
    await loginAsPartner(page);
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeFalsy();

    const authState = await page.evaluate(() => {
      const raw = localStorage.getItem('auth-storage');
      if (!raw) return null;
      return JSON.parse(raw);
    });
    expect(authState?.state?.user?.email).toBeTruthy();
    expect(authState?.state?.token).toBeFalsy();
  });
});
