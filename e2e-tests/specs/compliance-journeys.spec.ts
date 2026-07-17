import { test, expect } from '@playwright/test';
import { e2eExtraHeaders } from '../fixtures/e2e-headers';
import {
  apiGet,
  apiPost,
  expectNoErrorToasts,
  expectOkApi,
  gotoApp,
} from '../fixtures/build-helpers';
import {
  closeDisposableAccount,
  mintPortalToken,
  signupDisposableTenant,
  submitAmlOnboarding,
} from '../fixtures/compliance-helpers';

test.describe('AML journey — client form, stub check, webhook clear', () => {
  test('portal AML onboarding submits and partner stub check clears client', async ({
    page,
    request,
  }) => {
    test.slow();

    const clients = await apiGet(request, '/clients?limit=1');
    const clientId = clients.body?.data?.[0]?.id as string | undefined;
    test.skip(!clientId, 'No clients in demo tenant');

    const portalToken = await mintPortalToken(request, clientId!);

    await page.goto(`/onboarding/aml/${portalToken}`);
    await expect(page.getByRole('heading', { name: /ID.*AML verification/i })).toBeVisible({
      timeout: 30_000,
    });

    await submitAmlOnboarding(request, portalToken);

    const check = await apiPost(request, '/aml/check', {
      clientId,
      provider: 'stub',
    });
    expect(check.status).toBe(202);
    expect(check.body?.success).toBe(true);
    const providerRef = check.body?.data?.amlProviderRef as string;
    expect(providerRef).toBeTruthy();

    const webhook = await request.post(
      `${process.env.API_URL || 'http://localhost:3001/api'}/aml/webhook`,
      {
        data: {
          providerRef,
          status: 'clear',
          completedAt: new Date().toISOString(),
        },
        headers: { 'Content-Type': 'application/json', 'X-Test-Mode': 'e2e-build' },
      }
    );
    expect(webhook.ok()).toBeTruthy();

    const status = await apiGet(request, `/aml/status/${clientId}`);
    await expectOkApi('aml status after clear', status);
    expect(status.body.data.amlStatus).toBe('CLEAR');
  });
});

test.describe('GDPR export and account close', () => {
  test('export includes user profile and portable fields', async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: e2eExtraHeaders('e2e-build') });
    const request = context.request;

    const tenant = await signupDisposableTenant(request);
    const exportRes = await apiGet(request, '/auth/me/export');
    await expectOkApi('gdpr export', exportRes);
    expect(exportRes.body.data.user.email).toBe(tenant.email);
    expect(exportRes.body.data.user.tenant?.subdomain).toBe(tenant.subdomain);
    expect(exportRes.body.data.exportDate).toBeTruthy();
    expect(Array.isArray(exportRes.body.data.proposals)).toBe(true);

    await context.close();
  });

  test('close account anonymizes user and ends session', async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: e2eExtraHeaders('e2e-build') });
    const request = context.request;

    const tenant = await signupDisposableTenant(request);
    await closeDisposableAccount(request, tenant.password);

    const me = await apiGet(request, '/auth/me');
    expect(me.status).toBeGreaterThanOrEqual(401);

    await context.close();
  });
});

test.describe('Xero mock connect', () => {
  test.afterEach(async ({ request }) => {
    await apiPost(request, '/xero/mock-disconnect').catch(() => undefined);
  });

  test('mock-connect persists stub connection and settings UI reflects it', async ({
    page,
    request,
  }) => {
    const withoutMode = await request.post(
      `${process.env.API_URL || 'http://localhost:3001/api'}/xero/mock-connect`,
      { data: {} }
    );
    expect(withoutMode.status()).toBe(403);

    const connect = await apiPost(request, '/xero/mock-connect');
    await expectOkApi('xero mock-connect', connect);
    expect(connect.body.data.connected).toBe(true);

    const status = await apiGet(request, '/xero/status');
    await expectOkApi('xero status', status);
    expect(status.body.data.connected).toBe(true);
    expect(status.body.data.xeroTenantName).toMatch(/e2e demo organisation/i);

    await gotoApp(page, '/settings?tab=integrations');
    await expect(page.getByText('Connected', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/E2E Demo Organisation/i)).toBeVisible();
    await expectNoErrorToasts(page);
  });
});

test.describe('Tenant signup to first proposal', () => {
  test('registers a new practice and opens the first proposal wizard', async ({ browser }) => {
    test.slow();

    const stamp = Date.now();
    const subdomain = `signup${stamp}`.slice(0, 30);
    const email = `signup-ui-${stamp}@example.com`;

    const context = await browser.newContext({ extraHTTPHeaders: e2eExtraHeaders('e2e-build') });
    const page = await context.newPage();

    await page.goto('/register');
    await page.waitForLoadState('networkidle');

    await page.fill('input[name="name"]', `Signup Practice ${stamp}`);
    await page.fill('input[name="subdomain"]', subdomain);
    await page.locator('input[name="subdomain"]').blur();
    await page
      .waitForResponse((r) => r.url().includes('check-subdomain') && r.ok(), { timeout: 15_000 })
      .catch(() => undefined);
    await page.click('button:has-text("Continue")');

    await page.getByRole('button', { name: /solo practitioner/i }).click();
    await page.getByRole('button', { name: /limited companies/i }).click();
    await page.getByRole('button', { name: /preparing clients for mtd/i }).click();
    await page.click('button:has-text("Continue with")');

    await page.fill('input[name="adminFirstName"]', 'Signup');
    await page.fill('input[name="adminLastName"]', 'Admin');
    await page.fill('input[name="adminEmail"]', email);
    await page.fill('input[name="adminPassword"]', 'DemoPass123!');
    await page.click('button:has-text("Continue")');

    await page.getByRole('checkbox').check();
    // Register skips session bootstrap — prime CSRF cookie before tenant POST
    await page.evaluate(async () => {
      await fetch('/api/auth/me', { credentials: 'include' });
    });
    await page.click('button:has-text("Create Account")');

    // Signup no longer issues a session — verify the email first (token via
    // the X-Test-Mode-gated backdoor), then sign in.
    await expect(page.getByTestId('verify-email-panel')).toBeVisible({ timeout: 45_000 });

    const tokenRes = await page.request.post('/api/auth/e2e/verification-token', {
      data: { email },
    });
    expect(tokenRes.ok()).toBeTruthy();
    const { data: tokenData } = await tokenRes.json();

    await page.goto(`/verify-email?token=${tokenData.token}`);
    await expect(page.getByRole('heading', { name: 'Email verified!' })).toBeVisible({
      timeout: 15_000,
    });

    await page.goto('/login');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', 'DemoPass123!');
    await Promise.all([
      page.waitForURL(/\/(dashboard)?$|\/proposals/, { timeout: 45_000 }),
      page.click('button[type="submit"]'),
    ]);
    await page.locator('nav[aria-label="Main"]:visible').first().waitFor({ timeout: 30_000 });

    await page.goto('/proposals/first-wizard');
    await expect(page.getByText(/first proposal wizard/i)).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole('heading', { name: /create your first proposal in five minutes/i })
    ).toBeVisible();

    await context.close();
  });
});
