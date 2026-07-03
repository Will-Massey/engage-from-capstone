import { test, expect } from '@playwright/test';
import { apiGet, expectOkApi, gotoApp } from '../fixtures/build-helpers';

test.describe('Build smoke — Engage template library (W3.2)', () => {
  test('API reports 100+ library templates with pricing sanity', async ({ request, page }) => {
    const list = await apiGet(request, '/proposal-templates?limit=1');
    await expectOkApi('proposal-templates', list);

    const meta = list.body?.meta ?? {};
    const libraryActive = meta.libraryActive ?? meta.libraryCount ?? 0;
    expect(libraryActive, 'library template count').toBeGreaterThanOrEqual(100);

    const sanity = await apiGet(request, '/proposal-templates/pricing-sanity');
    await expectOkApi('pricing-sanity', sanity);
    expect(sanity.body?.data?.sanity?.passed).toBe(true);
  });

  test('Templates UI shows Engage library filter with 100+ templates', async ({ page }) => {
    await gotoApp(page, '/templates');
    await expect(page.getByRole('heading', { name: /proposal templates/i })).toBeVisible({
      timeout: 20_000,
    });
    const libraryBtn = page.getByRole('button', { name: /Engage library \(\d+\)/i });
    await expect(libraryBtn).toBeVisible({ timeout: 30_000 });
    const label = await libraryBtn.innerText();
    const match = label.match(/\((\d+)\)/);
    expect(match, 'library count in filter label').toBeTruthy();
    const count = parseInt(match![1], 10);
    expect(count).toBeGreaterThanOrEqual(100);
  });
});