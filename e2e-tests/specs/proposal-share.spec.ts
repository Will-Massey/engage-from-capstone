import { test, expect } from '@playwright/test';
import {
  loginAsPartner,
  createTestClient,
  createTestProposal,
  ensureTestService,
  getCSRFToken,
} from '../fixtures/helpers';

/**
 * Proposal Sharing & E-Signature E2E Tests
 */

async function createShareLink(page: any, proposalTitle: string): Promise<string> {
  // Navigate to proposals list and intercept the share API response
  await page.goto('/proposals');
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('[data-testid="proposal-row"]');

  // Intercept the share API response
  const responsePromise = page.waitForResponse(
    (resp: any) => resp.url().includes('/share') && resp.status() >= 200 && resp.status() < 300
  );

  // Find the proposal row and click share
  const rowByTitle = page
    .locator('[data-testid="proposal-row"]')
    .filter({ hasText: proposalTitle });
  await expect(rowByTitle).toBeVisible({ timeout: 10000 });
  await rowByTitle.locator('[data-testid="share-proposal-button"]').click();

  const response = await responsePromise;
  const data = await response.json();
  expect(data.success).toBe(true);
  return data.data.shareUrl;
}

test.describe('Proposal Sharing', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPartner(page);
    await ensureTestService(page, {
      name: 'Comprehensive Bookkeeping',
      basePrice: 85,
      defaultFrequency: 'MONTHLY',
    });
  });

  test('can generate a shareable link for a proposal', async ({ page }) => {
    const client = await createTestClient(page);
    const uniqueTitle = `Shareable Proposal ${Date.now()}`;
    const proposal = await createTestProposal(page, {
      clientName: client.name,
      services: ['Comprehensive Bookkeeping'],
      title: uniqueTitle,
    });

    // Navigate to proposals list and wait for load
    await page.goto('/proposals');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[data-testid="proposal-row"]');

    // Find the proposal and click share (use title which is in the first column)
    const rowByTitle = page
      .locator('[data-testid="proposal-row"]')
      .filter({ hasText: uniqueTitle });
    await expect(rowByTitle).toBeVisible({ timeout: 10000 });
    await rowByTitle.locator('[data-testid="share-proposal-button"]').click();

    // Verify toast success
    await expect(page.locator('text=Shareable link copied!')).toBeVisible();
  });

  test('can view a shared proposal via public link', async ({ page, context }) => {
    const client = await createTestClient(page);
    const uniqueTitle = `Public View Proposal ${Date.now()}`;
    const proposal = await createTestProposal(page, {
      clientName: client.name,
      services: ['Comprehensive Bookkeeping'],
      title: uniqueTitle,
    });

    // Generate share link via UI
    const shareUrl = await createShareLink(page, uniqueTitle);
    expect(shareUrl).toContain('/proposals/view/');

    // Open share URL in a new page (no auth needed)
    const publicPage = await context.newPage();
    await publicPage.goto(shareUrl);
    await publicPage.waitForLoadState('networkidle');

    // Verify proposal content is visible
    await expect(publicPage.locator(`text=${uniqueTitle}`)).toBeVisible();
    // .first(): the service name appears in both the letter and the fee table
    await expect(publicPage.locator('text=Comprehensive Bookkeeping').first()).toBeVisible();
    await expect(publicPage.locator('text=Terms & Conditions')).toBeVisible();
  });
});

test.describe('Electronic Signature', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPartner(page);
    await ensureTestService(page, {
      name: 'Comprehensive Bookkeeping',
      basePrice: 85,
      defaultFrequency: 'MONTHLY',
    });
  });

  test('client can accept and sign a shared proposal', async ({ page, context }) => {
    // The /sign endpoint generates the signed PDF + audit evidence — slow
    test.slow();
    const client = await createTestClient(page, {
      name: 'Signature Test Client',
      email: 'signature-test@example.com',
    });
    const uniqueTitle = `Signature Proposal ${Date.now()}`;
    const proposal = await createTestProposal(page, {
      clientName: client.name,
      services: ['Comprehensive Bookkeeping'],
      title: uniqueTitle,
    });

    // Send the proposal first (required for SENT status). The UI send flow
    // needs a configured AI drafter (the email preview dialog closes on AI
    // errors), so hit the send API directly — signing is what this test
    // exercises. Requires EMAIL_DEV_LOG=true when no SMTP is configured.
    await page.goto(`/proposals/${proposal.id}`);
    await page.waitForLoadState('networkidle');
    const csrf = await getCSRFToken(page);
    const sendRes = await page.request.post(
      `${process.env.API_URL || 'http://localhost:3001/api'}/proposals/${proposal.id}/send`,
      { headers: csrf ? { 'X-CSRF-Token': csrf } : {}, data: {} }
    );
    expect(sendRes.ok()).toBeTruthy();

    // Sending already created the share link, so the row's share button just
    // copies it (no /share request for createShareLink to await) — fetch the
    // link via the API instead. The UI share path is covered by the tests above.
    const shareRes = await page.request.post(
      `${process.env.API_URL || 'http://localhost:3001/api'}/proposals/${proposal.id}/share`,
      { headers: csrf ? { 'X-CSRF-Token': csrf } : {}, data: {} }
    );
    expect(shareRes.ok()).toBeTruthy();
    const shareUrl = (await shareRes.json()).data.shareUrl as string;

    // Open public view
    const publicPage = await context.newPage();
    await publicPage.goto(shareUrl);
    await publicPage.waitForLoadState('networkidle');
    await expect(publicPage.locator(`text=${uniqueTitle}`)).toBeVisible();

    // Signing is a wizard: review → terms → (engagement) → identity → sign
    await publicPage.click('[data-testid="accept-proposal-button"]'); // "Review & sign proposal"
    await publicPage.click('button:has-text("Continue to terms")');
    await publicPage.check('[data-testid="terms-checkbox"]');
    await publicPage.click('button:has-text("Continue")');

    // Engagement-letter step only renders when the proposal has one
    const engagement = publicPage.locator('[data-testid="engagement-letter-checkbox"]');
    if (await engagement.isVisible().catch(() => false)) {
      await engagement.check();
      await publicPage.click('button:has-text("Continue")');
    }

    await publicPage.fill('[data-testid="signer-name-input"]', 'John Smith');
    await publicPage.fill('[data-testid="signer-role-input"]', 'Director');
    await publicPage.fill('[data-testid="signer-email-input"]', 'signature-test@example.com');
    await publicPage.check('[data-testid="authorised-checkbox"]');
    await publicPage.click('button:has-text("Continue to sign")');

    const signResponsePromise = publicPage.waitForResponse(
      (resp: any) => resp.url().includes('/sign') && resp.request().method() === 'POST'
    );

    // Draw signature on canvas
    const canvas = publicPage.locator('[data-testid="signature-canvas"]');
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    if (box) {
      await publicPage.mouse.move(box.x + 50, box.y + 50);
      await publicPage.mouse.down();
      await publicPage.mouse.move(box.x + 150, box.y + 100);
      await publicPage.mouse.move(box.x + 250, box.y + 50);
      await publicPage.mouse.up();
    }

    // Wait for React state update and confirm signature in the pad
    await publicPage.waitForTimeout(300);
    await publicPage.click('button:has-text("Confirm Signature")');

    await publicPage.click('[data-testid="confirm-signature-button"]');

    const signResponse = await signResponsePromise;
    const signBody = await signResponse.json();
    expect(signBody.success).toBe(true);
    expect(signBody.data.signatureId).toBeTruthy();

    await expect(publicPage.locator('text=Proposal accepted successfully')).toBeVisible();
    // Post-sign banner: "All done — thank you!" or "Proposal signed — payment still pending"
    await expect(
      publicPage.getByText(/All done — thank you!|Proposal signed/).first()
    ).toBeVisible();

    await page.goto(`/proposals/${proposal.id}`);
    await page.waitForLoadState('networkidle');
    // The audit trail is inside the collapsed "Access & Signature" section
    // .first(): the tab button, not the "Open Access & Signature History" link
    await page
      .getByRole('button', { name: /Access & Signature/ })
      .first()
      .click();
    await expect(page.locator('text=Signature audit')).toBeVisible();
    await expect(page.locator('text=SIMPLE_ELECTRONIC')).toBeVisible();
    await expect(page.locator('text=signature-test@example.com')).toBeVisible();
  });
});
