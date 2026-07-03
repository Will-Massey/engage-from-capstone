import { test, expect } from '@playwright/test';
import { expectOkApi, gotoApp, apiGet } from '../fixtures/build-helpers';

test.describe('Partner approval queue (W1.6)', () => {
  test('approval queue page loads for approver (admin)', async ({ page, request }) => {
    await expectOkApi('approval-queue API', await apiGet(request, '/proposals/approval-queue'));

    await gotoApp(page, '/proposals/approval-queue');
    await expect(page.getByRole('heading', { name: /partner approval queue/i })).toBeVisible({
      timeout: 15_000,
    });
  });
});