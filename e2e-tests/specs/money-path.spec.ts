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

test.describe('Money path — decline and share revocation', () => {
  test.beforeEach(async ({ page }) => {
    await ensurePartnerSession(page);
    await ensureTestService(page, {
      name: 'Comprehensive Bookkeeping',
      basePrice: 85,
      defaultFrequency: 'MONTHLY',
    });
  });

  test('client declines a shared proposal via public link', async ({ page, context }) => {
    const client = await createTestClient(page, {
      name: 'Decline Path Client',
      email: `decline-${Date.now()}@example.com`,
    });
    const uniqueTitle = `Decline Proposal ${Date.now()}`;
    const proposal = await createTestProposal(page, {
      clientName: client.name,
      services: ['Comprehensive Bookkeeping'],
      title: uniqueTitle,
    });

    await apiPost(page.request, `/proposals/${proposal.id}/send`);
    const share = await apiPost(page.request, `/proposals/${proposal.id}/share`);
    await expectOkApi('share proposal', share);
    const shareUrl = share.body.data.shareUrl as string;

    const publicPage = await context.newPage();
    await publicPage.goto(shareUrl);
    await expect(publicPage.locator(`text=${uniqueTitle}`)).toBeVisible({ timeout: 30_000 });

    await publicPage.locator('[data-testid="decline-proposal-button"]').first().click();
    await publicPage.locator('[data-testid="decline-reason-price"]').click();
    await publicPage.click('[data-testid="confirm-decline-button"]');

    await expect(publicPage.getByText(/declined|thank you/i).first()).toBeVisible({
      timeout: 15_000,
    });

    const detail = await apiGet(page.request, `/proposals/${proposal.id}`);
    await expectOkApi('proposal after decline', detail);
    expect(detail.body.data.status).toBe('DECLINED');

    await publicPage.close();
  });

  test('revoked share token returns not found on public view', async ({ page, context }) => {
    const client = await createTestClient(page, {
      name: 'Revoked Share Client',
      email: `revoke-${Date.now()}@example.com`,
    });
    const proposal = await createTestProposal(page, {
      clientName: client.name,
      services: ['Comprehensive Bookkeeping'],
      title: `Revoked Share ${Date.now()}`,
    });

    await apiPost(page.request, `/proposals/${proposal.id}/send`);
    const share = await apiPost(page.request, `/proposals/${proposal.id}/share`);
    await expectOkApi('share proposal', share);
    const shareUrl = share.body.data.shareUrl as string;

    const withdraw = await apiPost(page.request, `/proposals/${proposal.id}/withdraw`);
    await expectOkApi('withdraw proposal', withdraw);

    const publicPage = await context.newPage();
    const viewRes = await publicPage.goto(shareUrl);
    expect(viewRes?.status()).toBeGreaterThanOrEqual(400);

    const token = shareUrl.split('/').pop()!;
    const apiView = await publicPage.request.get(`${API_BASE}/proposals/view/${token}`);
    expect(apiView.status()).toBeGreaterThanOrEqual(400);

    await publicPage.close();
  });
});

test.describe('Money path — approval reject and role denial', () => {
  test.beforeEach(async ({ page }) => {
    await ensurePartnerSession(page);
    await ensureTestService(page, {
      name: 'Comprehensive Bookkeeping',
      basePrice: 85,
      defaultFrequency: 'MONTHLY',
    });
  });

  test('partner rejects a proposal pending approval', async ({ page, request }) => {
    const clients = await apiGet(request, '/clients?limit=1');
    const clientId = clients.body?.data?.[0]?.id as string | undefined;
    test.skip(!clientId, 'No clients in demo tenant');

    const services = await apiGet(request, '/services?limit=1');
    const serviceId = services.body?.data?.[0]?.id as string | undefined;
    test.skip(!serviceId, 'No services in demo tenant');

    const created = await apiPost(request, '/proposals', {
      clientId,
      title: `Reject approval ${Date.now()}`,
      services: [{ serviceId, quantity: 1 }],
    });
    await expectOkApi('create proposal', created);
    const proposalId = created.body.data.id as string;

    const submitted = await apiPost(request, `/proposals/${proposalId}/submit-for-approval`);
    await expectOkApi('submit for approval', submitted);
    expect(submitted.body.data.approvalStatus).toBe('PENDING');

    const rejected = await apiPost(request, `/proposals/${proposalId}/reject`, {
      rejectionReason: 'Pricing needs partner review before send',
    });
    await expectOkApi('reject proposal', rejected);
    expect(rejected.body.data.approvalStatus).toBe('REJECTED');
    expect(rejected.body.data.rejectionReason).toContain('Pricing');
  });

  test('senior cannot reject a proposal awaiting approval', async ({ page, browser }) => {
    const partnerRequest = page.request;

    const clients = await apiGet(partnerRequest, '/clients?limit=1');
    const clientId = clients.body?.data?.[0]?.id as string | undefined;
    test.skip(!clientId, 'No clients in demo tenant');

    const services = await apiGet(partnerRequest, '/services?limit=1');
    const serviceId = services.body?.data?.[0]?.id as string | undefined;
    test.skip(!serviceId, 'No services in demo tenant');

    const created = await apiPost(partnerRequest, '/proposals', {
      clientId,
      title: `Senior reject denial ${Date.now()}`,
      services: [{ serviceId, quantity: 1 }],
    });
    const proposalId = created.body.data.id as string;
    await apiPost(partnerRequest, `/proposals/${proposalId}/submit-for-approval`);

    const seniorPage = await browser.newPage();
    const { loginAsUser } = await import('../fixtures/helpers');
    await loginAsUser(seniorPage, 'senior@demo.practice');
    const seniorRequest = seniorPage.request;

    const denied = await apiPost(seniorRequest, `/proposals/${proposalId}/reject`, {
      rejectionReason: 'Should not be allowed',
    });
    expect(denied.status).toBe(403);
    expect(denied.body?.error?.code).toBe('FORBIDDEN');

    await seniorPage.close();
  });
});
