import { test, expect, type Page } from '@playwright/test';
import {
  loginAsPartner,
  createTestClient,
  createTestProposal,
  ensureTestService,
} from '../fixtures/helpers';
import { API_BASE, apiGet, apiPost, expectOkApi } from '../fixtures/build-helpers';
import {
  enablePayoutCollectionForE2e,
  simulateRevolutOrderCompleted,
  totalToPence,
} from '../fixtures/payment-helpers';

async function ensurePartnerSession(page: Page): Promise<void> {
  const nav = page.locator('nav[aria-label="Main"]:visible').first();
  if (await nav.isVisible({ timeout: 5000 }).catch(() => false)) return;
  await loginAsPartner(page);
}

function formatGbp(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
}

/**
 * Money-path e2e — create → send → public sign → stubbed Revolut checkout →
 * webhook fulfilment → payment split on the ledger.
 */
test.describe('Money path — sign and collect payment', () => {
  test.beforeEach(async ({ page }) => {
    await ensurePartnerSession(page);
    await enablePayoutCollectionForE2e(page.request);
    await ensureTestService(page, {
      name: 'Comprehensive Bookkeeping',
      basePrice: 85,
      defaultFrequency: 'MONTHLY',
    });
  });

  test('client signs, pays via stubbed Revolut, split matches proposal total', async ({
    page,
    context,
  }) => {
    test.slow();

    const me = await apiGet(page.request, '/auth/me');
    await expectOkApi('/auth/me', me);
    const tenantId = me.body.data.user.tenant.id as string;

    const client = await createTestClient(page, {
      name: 'Money Path Client',
      email: `money-path-${Date.now()}@example.com`,
    });
    const uniqueTitle = `Money Path Proposal ${Date.now()}`;
    const proposal = await createTestProposal(page, {
      clientName: client.name,
      services: ['Comprehensive Bookkeeping'],
      title: uniqueTitle,
    });

    const detail = await apiGet(page.request, `/proposals/${proposal.id}`);
    await expectOkApi('proposal detail', detail);
    const storedTotal = detail.body.data.total as number;
    const expectedPence = totalToPence(storedTotal);
    expect(expectedPence).toBeGreaterThan(0);

    await page.goto(`/proposals/${proposal.id}`);
    await page.waitForLoadState('networkidle');

    const send = await apiPost(page.request, `/proposals/${proposal.id}/send`);
    await expectOkApi('send proposal', send);

    const share = await apiPost(page.request, `/proposals/${proposal.id}/share`);
    await expectOkApi('share proposal', share);
    const shareUrl = share.body.data.shareUrl as string;
    const shareToken = shareUrl.split('/').pop()!;

    const publicPage = await context.newPage();
    await publicPage.addInitScript(() => {
      window.__PLAYWRIGHT_MOCK_REVOLUT__ = true;
    });
    await publicPage.goto(shareUrl);
    await publicPage.waitForLoadState('networkidle');
    await expect(publicPage.locator(`text=${uniqueTitle}`)).toBeVisible();

    await publicPage.click('[data-testid="accept-proposal-button"]');
    await publicPage.click('button:has-text("Continue to terms")');
    await publicPage.check('[data-testid="terms-checkbox"]');
    await publicPage.click('button:has-text("Continue")');

    const engagement = publicPage.locator('[data-testid="engagement-letter-checkbox"]');
    if (await engagement.isVisible().catch(() => false)) {
      await engagement.check();
      await publicPage.click('button:has-text("Continue")');
    }

    await publicPage.fill('[data-testid="signer-name-input"]', 'Jane Money');
    await publicPage.fill('[data-testid="signer-role-input"]', 'Director');
    await publicPage.fill('[data-testid="signer-email-input"]', client.email);
    await publicPage.check('[data-testid="authorised-checkbox"]');
    await publicPage.click('button:has-text("Continue to sign")');

    const canvas = publicPage.locator('[data-testid="signature-canvas"]');
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    if (box) {
      await publicPage.mouse.move(box.x + 50, box.y + 50);
      await publicPage.mouse.down();
      await publicPage.mouse.move(box.x + 150, box.y + 100);
      await publicPage.mouse.up();
    }
    await publicPage.waitForTimeout(300);
    await publicPage.click('button:has-text("Confirm Signature")');

    const signResponsePromise = publicPage.waitForResponse(
      (resp) => resp.url().includes('/sign') && resp.request().method() === 'POST'
    );
    await publicPage.click('[data-testid="confirm-signature-button"]');
    const signResponse = await signResponsePromise;
    const signBody = await signResponse.json();
    expect(signBody.success).toBe(true);
    expect(signBody.data.paymentRequired).toBe(true);

    const paymentStep = publicPage.locator('[data-testid="payment-step"]');
    await expect(paymentStep).toBeVisible({ timeout: 15_000 });
    await expect(paymentStep).toContainText(formatGbp(storedTotal));

    const setupResponsePromise = publicPage.waitForResponse(
      (resp) => resp.url().includes('/payment/setup') && resp.request().method() === 'POST'
    );

    await publicPage.check('[data-testid="payment-auth-checkbox"]');
    await publicPage.click('[data-testid="setup-revolut-payment"]');

    const setupResponse = await setupResponsePromise;
    const setupBody = await setupResponse.json();
    expect(setupBody.success).toBe(true);
    const orderId = (setupBody.data.mandateId || setupBody.data.paymentId) as string;
    expect(orderId).toBeTruthy();

    await simulateRevolutOrderCompleted(page.request, {
      orderId,
      proposalId: proposal.id,
      tenantId,
      amountPence: expectedPence,
    });

    const statusRes = await publicPage.request.get(
      `${API_BASE}/proposals/view/${shareToken}/payment-status`
    );
    const statusBody = await statusRes.json();
    expect(statusBody.success).toBe(true);
    expect(statusBody.data.paid).toBe(true);
    expect(statusBody.data.amount).toBe(storedTotal);

    await expect(publicPage.locator('[data-testid="payment-complete-banner"]')).toBeVisible({
      timeout: 15_000,
    });

    const afterDetail = await apiGet(page.request, `/proposals/${proposal.id}`);
    await expectOkApi('proposal after payment', afterDetail);
    expect(afterDetail.body.data.paymentStatus).toBe('COMPLETED');
    expect(afterDetail.body.data.total).toBe(storedTotal);

    const ledger = await apiGet(page.request, '/payout/ledger');
    await expectOkApi('payout ledger', ledger);
    const split = (ledger.body.data as Array<{ title: string; grossPence: number }>).find(
      (row) => row.title === uniqueTitle
    );
    expect(split, 'payment split row for proposal').toBeTruthy();
    expect(split!.grossPence).toBe(expectedPence);

    await page.goto(`/proposals/${proposal.id}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="payment-collection-status"]')).toBeVisible({
      timeout: 15_000,
    });

    await publicPage.close();
  });
});
