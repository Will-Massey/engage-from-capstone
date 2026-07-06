import { test, expect } from '@playwright/test';
import { loginAsPartner } from '../fixtures/helpers';

test.describe('Cookie auth session', () => {
  test('login establishes session without localStorage token', async ({ page }) => {
    await loginAsPartner(page);
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeFalsy();

    // The auth store persists nothing (partialize: () => ({})) — httpOnly
    // cookies are the only session state, so nothing sensitive may appear here.
    const authState = await page.evaluate(() => {
      const raw = localStorage.getItem('auth-storage');
      if (!raw) return null;
      return JSON.parse(raw);
    });
    expect(authState?.state?.token).toBeFalsy();
    expect(authState?.state?.user).toBeFalsy();

    // The session itself must still work, carried purely by cookies.
    const me = await page.request.get(
      `${process.env.API_URL || 'http://localhost:3001/api'}/auth/me`
    );
    expect(me.ok()).toBeTruthy();
  });
});
