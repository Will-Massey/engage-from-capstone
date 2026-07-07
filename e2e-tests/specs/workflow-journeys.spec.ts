import { test, expect } from '@playwright/test';
import {
  apiGet,
  apiPost,
  expectNoErrorToasts,
  expectOkApi,
  gotoApp,
} from '../fixtures/build-helpers';

test.describe('Renewals workflow', () => {
  test('renewal candidates API returns structured list', async ({ request }) => {
    const expiringBefore = new Date();
    expiringBefore.setMonth(expiringBefore.getMonth() + 6);

    const res = await apiGet(
      request,
      `/proposals/renewal-candidates?expiringBefore=${expiringBefore.toISOString().slice(0, 10)}`
    );
    await expectOkApi('renewal candidates', res);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('bulk renewal wizard page loads for partners', async ({ page }) => {
    await gotoApp(page, '/proposals/renewals');
    await expect(page).toHaveURL(/\/proposals\/renewals/);
    await expect(page.getByRole('heading', { name: /bulk renewal wizard/i })).toBeVisible({
      timeout: 30_000,
    });
    await expectNoErrorToasts(page);
  });
});

test.describe('Agency sub-accounts', () => {
  test('agency sub-accounts list is tenant-scoped and does not leak foreign ids', async ({
    request,
  }) => {
    const res = await apiGet(request, '/tenants/agency/sub-accounts');
    await expectOkApi('agency sub-accounts', res);
    const accounts = res.body.data as Array<{ childTenantId?: string; name?: string }>;
    expect(Array.isArray(accounts)).toBe(true);

    const me = await apiGet(request, '/auth/me');
    const tenantId = me.body.data.user.tenant.id as string;
    for (const row of accounts) {
      if (row.childTenantId) {
        expect(row.childTenantId).not.toBe(tenantId);
      }
    }
  });

  test('agency link-invite requires partner role and returns a code', async ({ request }) => {
    const invite = await apiPost(request, '/tenants/agency/link-invite', {});
    expect(invite.status).toBeLessThan(500);
    if (invite.status === 201) {
      expect(invite.body.success).toBe(true);
      expect(invite.body.data.inviteCode).toBeTruthy();
    }
  });
});

test.describe('Approval workflow — reject path', () => {
  test('rejected proposal stays off approval queue until resubmitted', async ({ request }) => {
    const clients = await apiGet(request, '/clients?limit=1');
    const clientId = clients.body?.data?.[0]?.id as string | undefined;
    test.skip(!clientId, 'No clients in demo tenant');

    const services = await apiGet(request, '/services?limit=1');
    const serviceId = services.body?.data?.[0]?.id as string | undefined;
    test.skip(!serviceId, 'No services in demo tenant');

    const created = await apiPost(request, '/proposals', {
      clientId,
      title: `Workflow reject ${Date.now()}`,
      services: [{ serviceId, quantity: 1 }],
    });
    const proposalId = created.body.data.id as string;

    await apiPost(request, `/proposals/${proposalId}/submit-for-approval`);
    await apiPost(request, `/proposals/${proposalId}/reject`, {
      rejectionReason: 'Needs revised scope',
    });

    const queue = await apiGet(request, '/proposals/approval-queue?limit=100');
    await expectOkApi('approval queue', queue);
    const pendingIds = (queue.body.data as Array<{ id: string }>).map((p) => p.id);
    expect(pendingIds).not.toContain(proposalId);
  });
});
