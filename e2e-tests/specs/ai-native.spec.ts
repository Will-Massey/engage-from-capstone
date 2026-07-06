import { test, expect } from '@playwright/test';
import {
  advanceToProposalServicesStep,
  apiGet,
  apiPostResilient,
  expectNoErrorToasts,
  gotoApp,
} from '../fixtures/build-helpers';

let aiConfigured = false;

// Clara features need a configured AI provider (XAI_API_KEY) — probe once and
// skip the AI-gated tests on stacks without it (e.g. CI) instead of failing.
test.beforeAll(async ({ request }) => {
  const status = await apiGet(request, '/ai/status');
  aiConfigured = !!status.body?.data?.configured;
});

test.describe('AI-native UI surfaces', () => {
  test('dashboard attention queue renders', async ({ page }) => {
    await gotoApp(page, '/');
    await page.waitForLoadState('networkidle');
    const queue = page.getByText(/need attention|attention queue|proposals need/i);
    await expect(queue.first()).toBeVisible({ timeout: 20_000 });
    await expectNoErrorToasts(page);
  });

  test('Clara panel available from header', async ({ page }) => {
    test.skip(!aiConfigured, 'Clara not configured on this stack');
    await gotoApp(page, '/');
    const claraBtn = page.getByRole('button', { name: /clara|assistant|ai/i }).first();
    if (await claraBtn.isVisible().catch(() => false)) {
      await claraBtn.click();
      await expect(page.getByText(/clara|how can i help/i).first()).toBeVisible({
        timeout: 10_000,
      });
    }
    await expectNoErrorToasts(page);
  });

  test('proposal builder Clara sidebar on step 2+', async ({ page }) => {
    test.skip(!aiConfigured, 'Clara build mode not offered without AI');
    await gotoApp(page, '/proposals/new');
    await page.waitForSelector('[data-testid="client-card"]', { timeout: 30_000 });
    await advanceToProposalServicesStep(page, 'clara');

    await expect(page.getByRole('heading', { name: 'Add Services' })).toBeVisible({
      timeout: 15_000,
    });
    await expectNoErrorToasts(page, 3000);
  });
});

test.describe('AI-native API — proposal email draft', () => {
  test('draft email for existing draft proposal', async ({ request }) => {
    const drafts = await apiGet(request, '/proposals?status=DRAFT&limit=1');
    const proposalId = drafts.body?.data?.[0]?.id;
    test.skip(!proposalId, 'No draft proposals');
    test.skip(!aiConfigured, 'AI email draft needs a configured provider');

    const draft = await apiPostResilient(request, '/ai/proposal-email-draft', { proposalId });
    expect(draft.status).toBe(200);
    expect(draft.body?.success).toBe(true);
    expect(draft.body?.data?.subject?.length).toBeGreaterThan(5);
    expect(draft.body?.data?.textBody?.length).toBeGreaterThan(20);
  });
});
