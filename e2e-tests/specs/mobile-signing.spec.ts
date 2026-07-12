import { test, expect } from '@playwright/test';
import {
  loginAsPartner,
  createTestClient,
  createTestProposal,
  ensureTestService,
  getCSRFToken,
} from '../fixtures/helpers';

/**
 * Mobile-viewport signing journey
 *
 * Same journey as proposal-share.spec.ts's signing test, but the public sign
 * page runs in a mobile-emulated context (iPhone-ish viewport, touch, HiDPI).
 * Admin setup (login, client, proposal) stays on the default desktop context
 * because the fixture helpers drive desktop layouts.
 */

const API_URL = process.env.API_URL || 'http://localhost:3001/api';

test.describe('Mobile signing', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPartner(page);
    await ensureTestService(page, {
      name: 'Comprehensive Bookkeeping',
      basePrice: 85,
      defaultFrequency: 'MONTHLY',
    });
  });

  test('client can sign a shared proposal on a mobile viewport', async ({ page, browser }) => {
    // The /sign endpoint generates the signed PDF + audit evidence — slow
    test.slow();
    const client = await createTestClient(page, {
      name: 'Mobile Signature Client',
      email: 'mobile-signature-test@example.com',
    });
    const uniqueTitle = `Mobile Signature Proposal ${Date.now()}`;
    const proposal = await createTestProposal(page, {
      clientName: client.name,
      services: ['Comprehensive Bookkeeping'],
      title: uniqueTitle,
    });

    // Send + share via the API (same rationale as proposal-share.spec.ts:
    // the UI send flow needs a configured AI drafter).
    await page.goto(`/proposals/${proposal.id}`);
    await page.waitForLoadState('networkidle');
    const csrf = await getCSRFToken(page);
    const sendRes = await page.request.post(`${API_URL}/proposals/${proposal.id}/send`, {
      headers: csrf ? { 'X-CSRF-Token': csrf } : {},
      data: {},
    });
    expect(sendRes.ok()).toBeTruthy();
    const shareRes = await page.request.post(`${API_URL}/proposals/${proposal.id}/share`, {
      headers: csrf ? { 'X-CSRF-Token': csrf } : {},
      data: {},
    });
    expect(shareRes.ok()).toBeTruthy();
    const shareUrl = (await shareRes.json()).data.shareUrl as string;

    // Open the public page in a mobile-emulated context. deviceScaleFactor 3
    // exercises the SignaturePad HiDPI path (backing store capped at 2x).
    const mobileContext = await browser.newContext({
      baseURL: process.env.FRONTEND_URL || 'http://localhost:5173',
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      deviceScaleFactor: 3,
      extraHTTPHeaders: {
        'X-Test-Mode': 'e2e',
        ...(process.env.E2E_BYPASS_SECRET
          ? { 'X-Test-Mode-Secret': process.env.E2E_BYPASS_SECRET }
          : {}),
      },
    });
    try {
      const publicPage = await mobileContext.newPage();
      await publicPage.goto(shareUrl);
      await publicPage.waitForLoadState('networkidle');
      await expect(publicPage.locator(`text=${uniqueTitle}`)).toBeVisible();

      // The mobile sticky accept bar is visible (hidden on sm+ screens)
      const stickyBar = publicPage.getByTestId('mobile-accept-bar');
      await expect(stickyBar).toBeVisible();

      // Start the signing wizard from the sticky bar
      await stickyBar.getByRole('button', { name: /review & sign proposal/i }).click();
      await expect(stickyBar).toBeHidden();

      await publicPage.click('button:has-text("Continue to terms")');
      await publicPage.check('[data-testid="terms-checkbox"]');
      await publicPage.click('button:has-text("Continue")');

      // Engagement-letter step only renders when the proposal has one
      const engagement = publicPage.locator('[data-testid="engagement-letter-checkbox"]');
      if (await engagement.isVisible().catch(() => false)) {
        await engagement.check();
        await publicPage.click('button:has-text("Continue")');
      }

      await publicPage.fill('[data-testid="signer-name-input"]', 'Mo Bile');
      await publicPage.fill('[data-testid="signer-role-input"]', 'Director');
      await publicPage.fill(
        '[data-testid="signer-email-input"]',
        'mobile-signature-test@example.com'
      );
      await publicPage.check('[data-testid="authorised-checkbox"]');
      await publicPage.click('button:has-text("Continue to sign")');

      // Draw on the signature canvas. The pad handles both touch and mouse;
      // Playwright's touchscreen API only taps (no drag), so drive the drag
      // with the mouse — mouse events still fire under touch emulation.
      const canvas = publicPage.locator('[data-testid="signature-canvas"]');
      await canvas.scrollIntoViewIfNeeded();

      // HiDPI: the backing store is devicePixelRatio-scaled (capped at 2x —
      // this context emulates dpr 3) while the CSS size stays unchanged.
      const canvasMetrics = await canvas.evaluate((el) => {
        const c = el as HTMLCanvasElement;
        return { attrWidth: c.width, cssWidth: c.getBoundingClientRect().width };
      });
      expect(Math.abs(canvasMetrics.attrWidth - canvasMetrics.cssWidth * 2)).toBeLessThanOrEqual(2);

      const box = await canvas.boundingBox();
      expect(box).toBeTruthy();
      if (box) {
        await publicPage.mouse.move(box.x + 40, box.y + 60);
        await publicPage.mouse.down();
        await publicPage.mouse.move(box.x + 120, box.y + 100);
        await publicPage.mouse.move(box.x + 200, box.y + 60);
        await publicPage.mouse.up();
      }

      // Exactly ONE visible confirm control: the page's own confirm button.
      // The pad's internal "Confirm Signature" button is hidden on this page.
      const confirmButton = publicPage.getByTestId('confirm-signature-button');
      await expect(confirmButton).toBeVisible();
      await expect(publicPage.locator('button:has-text("Confirm Signature")')).toHaveCount(0);
      await expect(publicPage.getByRole('button', { name: /^confirm/i })).toHaveCount(1);

      const signResponsePromise = publicPage.waitForResponse(
        (resp) => resp.url().includes('/sign') && resp.request().method() === 'POST'
      );
      await confirmButton.click();

      const signResponse = await signResponsePromise;
      const signBody = await signResponse.json();
      expect(signBody.success).toBe(true);
      expect(signBody.data.signatureId).toBeTruthy();

      // Post-sign path depends on whether tenant payment collection is on
      // (the money-path suite enables it persistently) — accept both.
      await expect(publicPage.getByText(/Proposal accepted/).first()).toBeVisible();
      if (signBody.data.paymentRequired) {
        await expect(publicPage.getByTestId('payment-step')).toBeVisible({ timeout: 15_000 });
      } else {
        await expect(
          publicPage.getByText(/All done — thank you!|Proposal signed/).first()
        ).toBeVisible();
      }
    } finally {
      await mobileContext.close();
    }
  });
});
