import { test, expect } from '@playwright/test';
import {
  API_BASE,
  advanceToProposalServicesStep,
  expectNoErrorToasts,
  apiGet,
  apiPostResilient,
  expectOkApi,
} from '../fixtures/build-helpers';

test.describe('Build smoke — infrastructure', () => {
  test('backend ping responds', async ({ request }) => {
    const base = API_BASE.replace(/\/api$/, '');
    const res = await request.get(`${base}/ping`);
    expect(res.ok()).toBeTruthy();
  });

  test('frontend serves login page', async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: process.env.FRONTEND_URL || 'https://engage-frontend-0g6u.onrender.com',
    });
    const page = await context.newPage();
    await page.goto('/login');
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    await context.close();
  });
});

test.describe('Build smoke — API contracts', () => {
  test('AI status endpoint', async ({ request }) => {
    const { status, body } = await apiGet(request, '/ai/status');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data?.assistant?.name).toBeTruthy();
    expect(body.data?.features).toContain('proposal_email_draft');
    expect(body.data?.features).toContain('client_brief');
  });

  test('cover letter default template (auto-seed)', async ({ request }) => {
    const { status, body } = await apiGet(request, '/cover-letter-templates/default');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data?.content?.length).toBeGreaterThan(20);
  });

  test('attention queue', async ({ request }) => {
    const { status, body } = await apiGet(request, '/ai/attention-queue');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  test('client brief for first client', async ({ request }) => {
    const clients = await apiGet(request, '/clients?limit=1');
    expect(clients.body?.success).toBe(true);
    const clientId = clients.body?.data?.[0]?.id;
    test.skip(!clientId, 'No clients in tenant');

    const brief = await apiPostResilient(request, `/ai/client-brief/${clientId}`, {});
    expect(brief.status).toBe(200);
    expect(brief.body?.success).toBe(true);
    expect(brief.body?.data?.brief?.length).toBeGreaterThan(10);
  });

  test('regulatory alerts stub', async ({ request }) => {
    await expectOkApi('regulatory-alerts', await apiGet(request, '/ai/regulatory-alerts'));
  });

  test('benchmark pricing stub', async ({ request }) => {
    await expectOkApi('benchmark-pricing', await apiGet(request, '/ai/benchmark-pricing'));
  });
});

test.describe('Build smoke — authenticated app', () => {
  test('dashboard loads', async ({ page }) => {
    await page.goto('/');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('body')).toContainText(/dashboard|proposal|welcome|engage/i);
    await expectNoErrorToasts(page);
  });

  test('proposals list loads', async ({ page }) => {
    await page.goto('/proposals');
    await expect(page).toHaveURL(/\/proposals/);
    await page.waitForLoadState('networkidle');
    await expectNoErrorToasts(page);
  });

  test('clients list loads', async ({ page }) => {
    await page.goto('/clients');
    await expect(page).toHaveURL(/\/clients/);
    await page.waitForLoadState('networkidle');
    await expectNoErrorToasts(page);
  });

  test('services catalog loads', async ({ page }) => {
    await page.goto('/services');
    await expect(page).toHaveURL(/\/services/);
    await page.waitForLoadState('networkidle');
    await expectNoErrorToasts(page);
  });

  test('settings page loads', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/settings/);
    await page.waitForLoadState('domcontentloaded');
    await expectNoErrorToasts(page);
  });
});

test.describe('Build smoke — new proposal (no error popups)', () => {
  test('select client and advance without AI/template errors', async ({ page }) => {
    await page.goto('/proposals/new');
    await advanceToProposalServicesStep(page, 'manual');

    await expectNoErrorToasts(page, 3000);

    await expect(page.getByRole('heading', { name: 'Client context' })).toBeVisible({ timeout: 15_000 });
  });

  test('can add a service and reach review step', async ({ page }) => {
    await page.goto('/proposals/new');
    await advanceToProposalServicesStep(page, 'manual');

    await page.locator('[data-testid="available-service-row"]').first().click();
    await page.locator('[data-testid="services-continue-button"]').click();

    await expect(page.locator('[data-testid="proposal-title-input"]')).toBeVisible();
    await expectNoErrorToasts(page);
  });

  test('regulatory check banner and client preview pane on builder', async ({ page }) => {
    await page.goto('/proposals/new');
    await advanceToProposalServicesStep(page, 'manual');

    await expect(page.getByTestId('regulatory-check-banner').or(page.getByTestId('regulatory-check-clear'))).toBeVisible({
      timeout: 30_000,
    });

    const preview = page.getByTestId('proposal-client-preview');
    const toggle = page.getByTestId('toggle-client-preview-pane');
    if (!(await preview.isVisible({ timeout: 3_000 }).catch(() => false))) {
      await toggle.click();
    }
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expectNoErrorToasts(page);
  });
});