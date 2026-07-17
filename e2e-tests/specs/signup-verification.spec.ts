import { test, expect } from '@playwright/test';
import { randomUUID } from 'crypto';

/**
 * Self-serve signup with email verification.
 *
 * Flow under test: wizard signup → "check your email" panel (no session) →
 * unverified login shows the resend panel → fetch the token via the
 * X-Test-Mode-gated backdoor → /verify-email consumes it → login succeeds.
 *
 * Backend needs EMAIL_DEV_LOG=true locally (no transport → logged send).
 */

const API_BASE =
  (process.env.API_URL || 'http://localhost:3001').replace(/\/$/, '') +
  (process.env.API_URL?.endsWith('/api') ? '' : '/api');

test.describe('Signup email verification', () => {
  test('signup requires verification; unverified login offers resend; verified login succeeds', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const testId = randomUUID().slice(0, 8);
    const email = `e2e-verify-${testId}@example.com`;
    const password = 'E2eVerify123!@#';

    // --- Wizard signup ---
    await page.goto('/register');

    // Step 1: practice details
    await page.fill('input[name="name"]', `E2E Verify Practice ${testId}`);
    await page.fill('input[name="subdomain"]', `e2e-verify-${testId}`);
    await page.click('button:has-text("Continue")');

    // Step 2: Clara profile questions
    await page.click('button:has-text("Solo practitioner")');
    await page.click('button:has-text("Limited companies")');
    await page.click('button:has-text("Preparing clients for MTD")');
    await page.locator('button', { hasText: /^Continue with/ }).click();

    // Step 3: admin account
    await page.fill('input[name="adminFirstName"]', 'E2E');
    await page.fill('input[name="adminLastName"]', 'Verifier');
    await page.fill('input[name="adminEmail"]', email);
    await page.fill('input[name="adminPassword"]', password);
    await page.click('button:has-text("Continue")');

    // Step 4: review + terms
    await page.check('input[type="checkbox"]');
    await page.click('button:has-text("Create Account")');

    // No session — the wizard swaps to the check-your-email panel
    const verifyPanel = page.getByTestId('verify-email-panel');
    await expect(verifyPanel).toBeVisible({ timeout: 20_000 });
    await expect(verifyPanel).toContainText(email);
    await expect(verifyPanel.getByRole('button', { name: /resend verification/i })).toBeVisible();

    // --- Unverified login is gated with the resend panel ---
    await page.goto('/login');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');

    const loginPanel = page.getByTestId('login-verify-panel');
    await expect(loginPanel).toBeVisible({ timeout: 15_000 });
    await expect(loginPanel).toContainText(email);
    await expect(loginPanel.getByRole('button', { name: /resend verification/i })).toBeVisible();

    // Still no session
    const meBefore = await page.request.get(`${API_BASE}/auth/me`);
    expect(meBefore.ok()).toBeFalsy();

    // --- Fetch the verification token via the e2e backdoor ---
    // (X-Test-Mode headers come from playwright.config extraHTTPHeaders)
    const tokenRes = await page.request.post(`${API_BASE}/auth/e2e/verification-token`, {
      data: { email },
    });
    expect(tokenRes.ok()).toBeTruthy();
    const tokenBody = await tokenRes.json();
    const token: string = tokenBody.data.token;
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    // --- Verify via the frontend page ---
    await page.goto(`/verify-email?token=${token}`);
    await expect(page.getByRole('heading', { name: 'Email verified!' })).toBeVisible({
      timeout: 15_000,
    });

    // --- Login now succeeds ---
    await page.goto('/login');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await Promise.all([
      page.waitForURL(/\/$|\/dashboard|\/proposals/, { timeout: 20_000 }),
      page.click('button[type="submit"]'),
    ]);
    await page.locator('nav[aria-label="Main"]:visible').first().waitFor({ timeout: 20_000 });

    const meAfter = await page.request.get(`${API_BASE}/auth/me`);
    expect(meAfter.ok()).toBeTruthy();
  });

  test('verify-email page rejects a garbage token', async ({ page }) => {
    await page.goto('/verify-email?token=obviously-not-a-real-token');
    await expect(page.getByRole('heading', { name: 'Invalid Verification Link' })).toBeVisible({
      timeout: 15_000,
    });
  });
});
