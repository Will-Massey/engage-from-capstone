import { test, expect } from '@playwright/test';
import { loginAsPartner, createTestClient, createTestProposal } from '../fixtures/helpers';

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
  const rowByTitle = page.locator('[data-testid="proposal-row"]').filter({ hasText: proposalTitle });
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
    const rowByTitle = page.locator('[data-testid="proposal-row"]').filter({ hasText: uniqueTitle });
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
    await expect(publicPage.locator('text=Comprehensive Bookkeeping')).toBeVisible();
    await expect(publicPage.locator('text=Terms & Conditions')).toBeVisible();
  });
});

test.describe('Electronic Signature', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPartner(page);
  });

  test('client can accept and sign a shared proposal', async ({ page, context }) => {
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

    // Send the proposal first (required for SENT status)
    await page.goto(`/proposals/${proposal.id}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('button:has-text("Send")')).toBeVisible();
    await page.click('button:has-text("Send")');
    await expect(page.locator('text=Proposal sent successfully')).toBeVisible();

    // Generate share link via UI
    const shareUrl = await createShareLink(page, uniqueTitle);

    // Open public view
    const publicPage = await context.newPage();
    await publicPage.goto(shareUrl);
    await publicPage.waitForLoadState('networkidle');
    await expect(publicPage.locator(`text=${uniqueTitle}`)).toBeVisible();

    // Accept terms and click Accept Proposal
    await publicPage.check('[data-testid="terms-checkbox"]');
    await publicPage.click('[data-testid="accept-proposal-button"]');

    // Fill signature details
    await publicPage.fill('[data-testid="signer-name-input"]', 'John Smith');
    await publicPage.fill('[data-testid="signer-role-input"]', 'Director');

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

    // Submit acceptance
    await publicPage.click('[data-testid="confirm-signature-button"]');

    // Verify success
    await expect(publicPage.locator('text=Proposal accepted successfully')).toBeVisible();
    await expect(publicPage.locator('text=Proposal Accepted').first()).toBeVisible();
  });
});
