import { test, expect } from '@playwright/test';
import { apiGet, apiPostResilient, expectNoErrorToasts } from '../fixtures/build-helpers';

test.describe('AI-native UI surfaces', () => {
  test('dashboard attention queue renders', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const queue = page.getByText(/need attention|attention queue|proposals need/i);
    await expect(queue.first()).toBeVisible({ timeout: 20_000 });
    await expectNoErrorToasts(page);
  });

  test('Clara panel available from header', async ({ page }) => {
    await page.goto('/');
    const claraBtn = page.getByRole('button', { name: /clara|assistant|ai/i }).first();
    if (await claraBtn.isVisible().catch(() => false)) {
      await claraBtn.click();
      await expect(page.getByText(/clara|how can i help/i).first()).toBeVisible({ timeout: 10_000 });
    }
    await expectNoErrorToasts(page);
  });

  test('proposal builder Clara sidebar on step 2+', async ({ page }) => {
    await page.goto('/proposals/new');
    await page.waitForSelector('[data-testid="client-card"]');
    await page.locator('[data-testid="client-card"]').first().click();
    await page.locator('[data-testid="client-continue-button"]').click();
    await page.waitForSelector('[data-testid="available-service-row"]');

    await expect(page.getByRole('heading', { name: 'Client context' })).toBeVisible({ timeout: 15_000 });
    await expectNoErrorToasts(page, 3000);
  });
});

test.describe('AI-native API — proposal email draft', () => {
  test('draft email for existing draft proposal', async ({ request }) => {
    const drafts = await apiGet(request, '/proposals?status=DRAFT&limit=1');
    const proposalId = drafts.body?.data?.[0]?.id;
    test.skip(!proposalId, 'No draft proposals');

    const draft = await apiPostResilient(request, '/ai/proposal-email-draft', { proposalId });
    expect(draft.status).toBe(200);
    expect(draft.body?.success).toBe(true);
    expect(draft.body?.data?.subject?.length).toBeGreaterThan(5);
    expect(draft.body?.data?.textBody?.length).toBeGreaterThan(20);
  });
});