import { test, expect } from '@playwright/test';
import {
  apiGet,
  apiPost,
  expectNoErrorToasts,
  expectOkApi,
} from '../fixtures/build-helpers';

test.describe('UAT smoke — public legal & status pages', () => {
  test('terms of service page loads', async ({ page }) => {
    await page.goto('/legal/terms');
    await expect(page.getByRole('heading', { name: /terms of service/i }).first()).toBeVisible();
    await expect(page.getByText(/these terms of service/i)).toBeVisible();
    await expectNoErrorToasts(page);
  });

  test('privacy policy page loads', async ({ page }) => {
    await page.goto('/legal/privacy');
    await expect(page.getByRole('heading', { name: /privacy policy/i }).first()).toBeVisible();
    await expect(page.getByText(/data we process/i)).toBeVisible();
    await expectNoErrorToasts(page);
  });

  test('AI disclosure page loads', async ({ page }) => {
    await page.goto('/legal/ai-disclosure');
    await expect(page.getByRole('heading', { name: /ai disclosure/i }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /what clara does/i })).toBeVisible();
    await expectNoErrorToasts(page);
  });

  test('status page loads and shows component health', async ({ page }) => {
    await page.goto('/status');
    await expect(page.getByRole('heading', { name: /engage system status/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/database|api|email/i).first()).toBeVisible();
    await expectNoErrorToasts(page);
  });
});

test.describe('UAT smoke — Caroline checklist (automated)', () => {
  test('Xero integration settings page loads', async ({ page }) => {
    await page.goto('/settings?tab=integrations');
    await expect(page).toHaveURL(/tab=integrations/);
    await expect(page.getByText(/xero/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole('button', { name: /connect xero|reconnect xero|import clients/i }).first()
    ).toBeVisible();
    await expectNoErrorToasts(page);
  });

  test('Xero status API responds', async ({ request }) => {
    const result = await apiGet(request, '/xero/status');
    expect(result.status).toBe(200);
    expect(result.body?.success).toBe(true);
    expect(typeof result.body?.data?.connected).toBe('boolean');
    expect(typeof result.body?.data?.configured).toBe('boolean');
  });

  test('subscription / trial status API responds', async ({ request }) => {
    const result = await apiGet(request, '/payments/subscription');
    expect(result.status).toBe(200);
    expect(result.body?.success).toBe(true);
    expect(result.body?.data?.status).toBeTruthy();
    expect(result.body?.data?.trialEndsAt).toBeTruthy();
  });

  test('approval queue API is reachable for approvers', async ({ request }) => {
    await expectOkApi('approval-queue', await apiGet(request, '/proposals/approval-queue'));
  });

  test('partner approval flow — submit and approve draft proposal', async ({ request }) => {
    const clients = await apiGet(request, '/clients?limit=1');
    expect(clients.body?.success).toBe(true);
    const clientId = clients.body?.data?.[0]?.id as string | undefined;
    test.skip(!clientId, 'No clients in demo tenant');

    const services = await apiGet(request, '/services?limit=1');
    expect(services.body?.success).toBe(true);
    const service = services.body?.data?.[0] as { id: string; name?: string } | undefined;
    test.skip(!service?.id, 'No services in demo tenant');

    const created = await apiPost(request, '/proposals', {
      clientId,
      title: `UAT approval smoke ${Date.now()}`,
      services: [{ serviceId: service!.id, quantity: 1 }],
    });
    expect(created.status).toBe(201);
    expect(created.body?.success).toBe(true);
    const proposalId = created.body?.data?.id as string;
    expect(proposalId).toBeTruthy();

    const submitted = await apiPost(request, `/proposals/${proposalId}/submit-for-approval`);
    expect(submitted.status).toBe(200);
    expect(submitted.body?.success).toBe(true);
    expect(submitted.body?.data?.approvalStatus).toBe('PENDING');

    const queue = await apiGet(request, '/proposals/approval-queue?limit=50');
    expect(queue.body?.success).toBe(true);
    const queuedIds = (queue.body?.data ?? []).map((p: { id: string }) => p.id);
    expect(queuedIds).toContain(proposalId);

    const approved = await apiPost(request, `/proposals/${proposalId}/approve`, {
      approvalNotes: 'Automated UAT approval',
    });
    expect(approved.status).toBe(200);
    expect(approved.body?.success).toBe(true);
    expect(approved.body?.data?.approvalStatus).toBe('APPROVED');
  });

  test('proposal detail shows approval actions for draft', async ({ page, request }) => {
    const clients = await apiGet(request, '/clients?limit=1');
    const clientId = clients.body?.data?.[0]?.id as string | undefined;
    test.skip(!clientId, 'No clients in demo tenant');

    const services = await apiGet(request, '/services?limit=1');
    const service = services.body?.data?.[0] as { id: string } | undefined;
    test.skip(!service?.id, 'No services in demo tenant');

    const created = await apiPost(request, '/proposals', {
      clientId,
      title: `UAT detail smoke ${Date.now()}`,
      services: [{ serviceId: service!.id, quantity: 1 }],
    });
    const proposalId = created.body?.data?.id as string;
    test.skip(!proposalId, 'Could not create proposal');

    await page.goto(`/proposals/${proposalId}`);
    await expect(page.getByRole('button', { name: /submit for partner approval/i })).toBeVisible({
      timeout: 30_000,
    });
    await expectNoErrorToasts(page);
  });
});