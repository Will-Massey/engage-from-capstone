import { test, expect } from '@playwright/test';
import { expectNoErrorToasts, gotoApp } from '../fixtures/build-helpers';

const STAGE_LABELS = [
  'Proposal accepted — welcome',
  'AML verification pending',
  'AML complete — thank you',
  'Engagement letter sent',
  'Engagement letter signed',
  'Information requested',
  'Information received',
  'Onboarding setup',
  'Kick-off welcome',
  'Milestone check-in',
  'Satisfaction check',
  'Ongoing relationship',
  'Annual review',
] as const;

const DEFAULT_PROPOSAL_ACCEPTED_SUBJECT =
  'Welcome to {{practice_name}} — we are delighted to work with you';

test.describe('Automation UAT — lifecycle touchpoints', () => {
  test('Settings → Automation shows 13 populated stage subjects', async ({ page }) => {
    await gotoApp(page, '/settings?tab=automation');
    await expect(page.getByRole('heading', { name: /Automated Client Touchpoints/i })).toBeVisible({
      timeout: 20_000,
    });

    for (const label of STAGE_LABELS) {
      const card = page.locator('div.rounded-2xl.border').filter({ hasText: label });
      await expect(card).toBeVisible();
      await expect(card.getByText(/Engage default — loading/i)).toHaveCount(0);
      await expect(card.locator('.line-clamp-2')).not.toBeEmpty();
    }

    await expectNoErrorToasts(page);
  });

  test('restore Engage default wording for a single stage', async ({ page }) => {
    await gotoApp(page, '/settings?tab=automation');
    await expect(page.getByRole('heading', { name: /Automated Client Touchpoints/i })).toBeVisible({
      timeout: 20_000,
    });

    const card = page.locator('div.rounded-2xl.border').filter({ hasText: 'Proposal accepted — welcome' });
    await card.getByRole('button', { name: /edit template/i }).click();

    const dialog = page.locator('.glass-tile').filter({ hasText: /Edit template — Proposal accepted/i });
    await expect(dialog).toBeVisible();

    const subjectInput = dialog.locator('input[placeholder="Subject"]');
    await expect(subjectInput).toHaveValue(DEFAULT_PROPOSAL_ACCEPTED_SUBJECT);

    const customisedSubject = `UAT custom subject ${Date.now()}`;
    await subjectInput.fill(customisedSubject);
    await dialog.getByRole('button', { name: /save template/i }).click();
    await expect(page.getByText(/template saved/i)).toBeVisible({ timeout: 10_000 });

    await card.getByRole('button', { name: /edit template/i }).click();
    await expect(subjectInput).toHaveValue(customisedSubject);

    page.once('dialog', (dialog) => dialog.accept());
    await dialog.getByRole('button', { name: /restore engage default wording/i }).click();
    await expect(page.getByText(/restored engage default wording/i)).toBeVisible({ timeout: 10_000 });
    await expect(subjectInput).toHaveValue(DEFAULT_PROPOSAL_ACCEPTED_SUBJECT);

    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expectNoErrorToasts(page);
  });
});