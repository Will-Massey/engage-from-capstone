import { test, expect } from '@playwright/test';
import { chooseProposalBuildMode, expectNoErrorToasts, selectFirstProposalClient } from '../fixtures/build-helpers';

const stamp = Date.now();
const TEMPLATE_NAME = `Sendit smoke ${stamp}`;
const TEMPLATE_TITLE = `Engagement proposal — smoke ${stamp}`;

test.describe('Build smoke — proposal templates', () => {
  test('Catalogue → Templates → create → Use template → client → pre-fills', async ({ page }) => {
    // Sidebar: Catalogue → Templates
    await page.goto('/templates');
    await expect(page).toHaveURL(/\/templates/);
    await expect(page.getByRole('heading', { name: /proposal templates/i })).toBeVisible();
    await expectNoErrorToasts(page);

    // Create template
    await page.getByRole('button', { name: /new template/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.getByPlaceholder(/standard limited company/i).fill(TEMPLATE_NAME);
    await dialog.getByPlaceholder(/engagement proposal/i).fill(TEMPLATE_TITLE);

    // Add first catalogue service
    const addServiceBtn = dialog
      .locator('button')
      .filter({ hasNotText: /added/i })
      .filter({ hasText: /£/ })
      .first();
    await expect(addServiceBtn).toBeVisible({ timeout: 30_000 });
    const serviceName = (await addServiceBtn.locator('span').first().innerText()).trim();
    await addServiceBtn.click();

    await dialog.getByRole('button', { name: /create template/i }).click();
    await expect(page.getByText(TEMPLATE_NAME)).toBeVisible({ timeout: 15_000 });
    await expectNoErrorToasts(page);

    // Use template → new proposal with ?template=
    const card = page.locator('article').filter({ hasText: TEMPLATE_NAME });
    await card.getByRole('button', { name: /use template/i }).click();
    await expect(page).toHaveURL(/\/proposals\/new\?template=/);

    // Pick client (template URL may still show build-mode chooser until template applies)
    await selectFirstProposalClient(page);
    await chooseProposalBuildMode(page, 'manual');
    const continueBtn = page.locator('[data-testid="client-continue-button"]');
    if (await continueBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await continueBtn.click();
    }

    // Template applies after client selected — services step should show pre-filled line
    await page.waitForSelector('[data-testid="available-service-row"], [data-testid="proposal-title-input"]', {
      timeout: 45_000,
    });
    await expectNoErrorToasts(page, 4000);

    const titleInput = page.locator('[data-testid="proposal-title-input"]');
    if (await titleInput.isVisible()) {
      await expect(titleInput).toHaveValue(TEMPLATE_TITLE);
    } else {
      // Still on services step — selected service from template should appear
      await expect(page.getByText(serviceName).first()).toBeVisible({ timeout: 15_000 });
    }

    // Cleanup: delete smoke template
    await page.goto('/templates');
    const smokeCard = page.locator('article').filter({ hasText: TEMPLATE_NAME });
    page.once('dialog', (d) => d.accept());
    await smokeCard.getByLabel(/delete template/i).click();
    await expect(page.getByText(TEMPLATE_NAME)).not.toBeVisible({ timeout: 10_000 });
  });
});