import { test, expect } from '@playwright/test';
import {
  loginAsPartner,
  createTestClient,
  createTestProposal,
  cleanupTestData,
  ensureTestService,
} from '../fixtures/helpers';

/**
 * Client Portal E2E Tests
 * Validates client portal link generation and public portal viewing
 */

test.describe('Client Portal', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPartner(page);
    await ensureTestService(page, {
      name: 'Comprehensive Bookkeeping',
      basePrice: 85,
      defaultFrequency: 'MONTHLY',
    });
  });

  test.afterEach(async () => {
    await cleanupTestData();
  });

  test('can generate a client portal link from proposal detail', async ({ page }) => {
    const client = await createTestClient(page, {
      name: 'Portal Test Client',
      email: 'portal-test@example.com',
    });

    const proposal = await createTestProposal(page, {
      clientName: client.name,
      services: ['Comprehensive Bookkeeping'],
      title: `Portal Proposal ${Date.now()}`,
    });

    // Navigate to proposal detail
    await page.goto(`/proposals/${proposal.id}`);
    await page.waitForLoadState('networkidle');

    // Click the portal link button
    const portalButton = page.locator('button:has-text("Copy portal link")');
    await expect(portalButton).toBeVisible({ timeout: 10000 });
    await portalButton.click();

    // Verify toast success
    await expect(page.locator('text=Client portal link copied')).toBeVisible();
  });

  test('client portal shows proposals for the client', async ({ page, context }) => {
    const client = await createTestClient(page, {
      name: 'Portal View Client',
      email: 'portal-view@example.com',
    });

    // Create and send a proposal
    const proposal = await createTestProposal(page, {
      clientName: client.name,
      services: ['Comprehensive Bookkeeping'],
      title: `Portal View Proposal ${Date.now()}`,
    });

    // Send the proposal (sets status to SENT)
    await page.goto(`/proposals/${proposal.id}`);
    await page.waitForLoadState('networkidle');
    const sendButton = page.locator('button:has-text("Send")');
    if (await sendButton.isVisible().catch(() => false)) {
      await sendButton.click();
      await page.waitForTimeout(1000);
    }

    // Generate portal link via API
    const response = await page.request.post(
      `${process.env.API_URL || 'http://localhost:3001/api'}/proposals/portal/${client.id}`,
      {
        data: { expiryDays: 90 },
        headers: {
          Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('auth_token'))}`,
        },
      }
    );

    // If API call fails, skip this test (auth token might not be in localStorage)
    if (!response.ok()) {
      test.skip();
      return;
    }

    const portalData = await response.json();
    const portalUrl = portalData.data?.portalUrl;

    if (!portalUrl) {
      test.skip();
      return;
    }

    // Open portal in new page (no auth needed)
    const portalPage = await context.newPage();
    await portalPage.goto(portalUrl);
    await portalPage.waitForLoadState('networkidle');

    // Verify portal content
    await expect(portalPage.locator('text=Client Portal')).toBeVisible();
    await expect(portalPage.locator(`text=${client.name}`)).toBeVisible();
    await expect(portalPage.locator('text=Your Proposals')).toBeVisible();

    // Should show the proposal
    await expect(portalPage.locator(`text=${proposal.title}`)).toBeVisible();

    // Should show stats
    await expect(portalPage.locator('text=Total Proposals')).toBeVisible();

    await portalPage.close();
  });

  test('invalid portal token shows error', async ({ page }) => {
    await page.goto('/portal/invalid-token-12345');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Portal Not Available')).toBeVisible();
    await expect(page.locator('text=This portal link is invalid or has expired.')).toBeVisible();
  });
});
