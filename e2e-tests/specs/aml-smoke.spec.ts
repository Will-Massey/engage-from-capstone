import { test, expect } from '@playwright/test';
import { apiGet, apiPost, expectOkApi, gotoApp } from '../fixtures/build-helpers';

test.describe('AML partner scaffold (W3.3)', () => {
  test('demo AML check auto-completes to CLEAR via stub webhook', async ({ request }) => {
    const clients = await apiGet(request, '/clients?limit=5');
    await expectOkApi('clients', clients);
    const clientId = clients.body?.data?.[0]?.id;
    expect(clientId, 'demo client id').toBeTruthy();

    const initiated = await apiPost(request, '/aml/check', { clientId, provider: 'stub' });
    expect(initiated.status, 'aml check HTTP').toBeLessThan(400);
    expect(initiated.body?.success).toBeTruthy();

    let cleared = false;
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const status = await apiGet(request, `/aml/status/${clientId}`);
      if (status.body?.data?.amlStatus === 'CLEAR') {
        cleared = true;
        break;
      }
    }
    expect(cleared, 'stub AML should auto-complete within ~20s').toBe(true);
  });

  test('client detail shows AML partner panel', async ({ page, request }) => {
    const clients = await apiGet(request, '/clients?limit=1');
    const clientId = clients.body?.data?.[0]?.id;
    test.skip(!clientId, 'no demo client');

    await gotoApp(page, `/clients/${clientId}`);
    await expect(page.getByText(/AML|anti-money laundering/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});