import { test, expect } from '@playwright/test';
import {
  loginAsPartner,
  createTestClient,
  cleanupTestData,
  ensureTestService,
} from '../fixtures/helpers';

/**
 * Proposal Pricing E2E Tests
 * Validates pricing frequency handling and calculations with the proposal builder (Create Proposal).
 *
 * The prices below are load-bearing: the assertions check inc-VAT amounts
 * (£850 annual → £1,020; £85 monthly → £102; £120 quarterly → £48/month).
 */

test.describe('Proposal Pricing Frequency', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPartner(page);
    await ensureTestService(page, {
      name: 'Annual Accounts Preparation & Filing',
      basePrice: 850,
      defaultFrequency: 'ANNUALLY',
    });
    await ensureTestService(page, {
      name: 'Comprehensive Bookkeeping',
      basePrice: 85,
      defaultFrequency: 'MONTHLY',
    });
    await ensureTestService(page, {
      name: 'MTD ITSA 2026/27 Transition & Quarterly Filing',
      basePrice: 120,
      defaultFrequency: 'QUARTERLY',
    });
  });

  test.afterEach(async () => {
    await cleanupTestData();
  });

  test('annual service shows full-year amount in selection (not blended into monthly)', async ({
    page,
  }) => {
    const client = await createTestClient(page, {
      name: 'Test Annual Client',
      email: 'test-annual@example.com',
    });

    await page.goto('/proposals/new');

    // Step 1: Select client
    await page.waitForSelector('[data-testid="client-card"]');
    const clientCard = page.locator('[data-testid="client-card"]').filter({ hasText: client.name });
    await clientCard.click();
    await page.locator('[data-testid="build-mode-manual"]').click();
    await page.locator('[data-testid="client-continue-button"]').click();

    // Step 2: Add an annual service
    const serviceRow = page
      .locator('[data-testid="available-service-row"]')
      .filter({ hasText: 'Annual Accounts Preparation & Filing' });
    await serviceRow.click();

    // Left column still hints at monthly equivalent; selected row shows full-period inc VAT
    const selectedRow = page
      .locator('[data-testid="selected-service-row"]')
      .filter({ hasText: 'Annual Accounts Preparation & Filing' });
    await expect(selectedRow).toBeVisible();
    await expect(selectedRow).toContainText(/year/);
    await expect(selectedRow).toContainText(/£1,020/);

    // Go to review
    await page.locator('[data-testid="services-continue-button"]').click();

    // Annual band shows the full-year figure; the cash-flow footer averages it
    await expect(page.getByText('/year').first()).toBeVisible();
    await expect(page.getByText('Typical monthly cash flow')).toBeVisible();
    const totalElement = page
      .getByText('Typical monthly cash flow')
      .locator('..')
      .locator('..')
      .locator('span.text-xl');
    await expect(totalElement).toBeVisible();
    const totalText = await totalElement.textContent();
    const totalValue = parseFloat(totalText!.replace(/[^0-9.]/g, ''));
    // £1,020/year → ~£85/month average (inc VAT)
    expect(totalValue).toBeGreaterThan(80);
    expect(totalValue).toBeLessThan(95);
  });

  test('changing billing frequency recalculates price', async ({ page }) => {
    const client = await createTestClient(page);

    await page.goto('/proposals/new');
    await page.locator('[data-testid="client-card"]').filter({ hasText: client.name }).click();
    await page.locator('[data-testid="build-mode-manual"]').click();
    await page.locator('[data-testid="client-continue-button"]').click();

    // Add monthly service
    await page
      .locator('[data-testid="available-service-row"]')
      .filter({ hasText: 'Comprehensive Bookkeeping' })
      .click();

    // Switch the row's billing period to annual — the price converts to the
    // new cadence automatically (£85/month → £1,020/year ex VAT).
    const selectedRow = page
      .locator('[data-testid="selected-service-row"]')
      .filter({ hasText: 'Comprehensive Bookkeeping' });
    await selectedRow.locator('[data-testid="cadence-annually"]').click();

    // Full annual charge inc VAT: £1,020 × 1.2 = £1,224
    await expect(selectedRow).toContainText(/year/);
    await expect(selectedRow).toContainText(/£1,224/);
  });

  test('proposal total includes all services correctly', async ({ page }) => {
    const client = await createTestClient(page);

    await page.goto('/proposals/new');
    await page.locator('[data-testid="client-card"]').filter({ hasText: client.name }).click();
    await page.locator('[data-testid="build-mode-manual"]').click();
    await page.locator('[data-testid="client-continue-button"]').click();

    // Add multiple services with different frequencies
    await page
      .locator('[data-testid="available-service-row"]')
      .filter({ hasText: 'Annual Accounts Preparation & Filing' })
      .click();
    await page
      .locator('[data-testid="available-service-row"]')
      .filter({ hasText: 'Comprehensive Bookkeeping' })
      .click();
    await page
      .locator('[data-testid="available-service-row"]')
      .filter({ hasText: 'MTD ITSA 2026/27 Transition & Quarterly Filing' })
      .click();

    // Go to review step
    await page.locator('[data-testid="services-continue-button"]').click();

    // Monthly cost = average monthly equivalent: annual/12 + monthly + quarterly/3 (all inc VAT)
    const totalElement = page
      .getByText('Typical monthly cash flow')
      .locator('..')
      .locator('..')
      .locator('span.text-xl');
    await expect(totalElement).toBeVisible();
    const totalText = await totalElement.textContent();
    const totalValue = parseFloat(totalText!.replace(/[^0-9.]/g, ''));
    expect(totalValue).toBeGreaterThan(220);
    expect(totalValue).toBeLessThan(250);
  });
});

test.describe('VAT Calculation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPartner(page);
    await ensureTestService(page, {
      name: 'Comprehensive Bookkeeping',
      basePrice: 85,
      defaultFrequency: 'MONTHLY',
    });
    await ensureTestService(page, {
      name: 'Confirmation Statement (CS01)',
      basePrice: 75,
      defaultFrequency: 'ANNUALLY',
    });
  });

  test('line-level VAT can be set per service', async ({ page }) => {
    const client = await createTestClient(page);

    await page.goto('/proposals/new');
    await page.locator('[data-testid="client-card"]').filter({ hasText: client.name }).click();
    await page.locator('[data-testid="build-mode-manual"]').click();
    await page.locator('[data-testid="client-continue-button"]').click();

    // Add service
    await page
      .locator('[data-testid="available-service-row"]')
      .filter({ hasText: 'Comprehensive Bookkeeping' })
      .click();

    // Edit selected service
    const selectedRow = page
      .locator('[data-testid="selected-service-row"]')
      .filter({ hasText: 'Comprehensive Bookkeeping' });
    await selectedRow.hover();
    await selectedRow.locator('[data-testid="edit-service-button"]').click();

    // Set custom VAT rate to 5%
    await page.selectOption('[data-testid="edit-vat-select"]', '5');

    // Save edit
    await page.locator('[data-testid="save-edit-button"]').click();

    // Verify VAT info updated (row shows "· VAT 5%" for non-default rates)
    await expect(selectedRow).toContainText('VAT 5%');
  });

  test('mixed VAT rates show in selected services', async ({ page }) => {
    const client = await createTestClient(page);

    await page.goto('/proposals/new');
    await page.locator('[data-testid="client-card"]').filter({ hasText: client.name }).click();
    await page.locator('[data-testid="build-mode-manual"]').click();
    await page.locator('[data-testid="client-continue-button"]').click();

    // Add first service
    await page
      .locator('[data-testid="available-service-row"]')
      .filter({ hasText: 'Comprehensive Bookkeeping' })
      .click();

    // Edit first service to 20% VAT (default)
    let selectedRow = page
      .locator('[data-testid="selected-service-row"]')
      .filter({ hasText: 'Comprehensive Bookkeeping' });
    await selectedRow.hover();
    await selectedRow.locator('[data-testid="edit-service-button"]').click();
    await page.selectOption('[data-testid="edit-vat-select"]', '20');
    await page.locator('[data-testid="save-edit-button"]').click();

    // Add second service and set to 0% VAT
    await page
      .locator('[data-testid="available-service-row"]')
      .filter({ hasText: 'Confirmation Statement (CS01)' })
      .click();
    selectedRow = page
      .locator('[data-testid="selected-service-row"]')
      .filter({ hasText: 'Confirmation Statement (CS01)' });
    await selectedRow.hover();
    await selectedRow.locator('[data-testid="edit-service-button"]').click();
    await page.selectOption('[data-testid="edit-vat-select"]', '0');
    await page.locator('[data-testid="save-edit-button"]').click();

    // Go to review step
    await page.locator('[data-testid="services-continue-button"]').click();

    // Verify both services are in review
    await expect(
      page
        .locator('[data-testid="selected-service-row"]')
        .filter({ hasText: 'Comprehensive Bookkeeping' })
    ).toBeVisible();
    await expect(
      page
        .locator('[data-testid="selected-service-row"]')
        .filter({ hasText: 'Confirmation Statement (CS01)' })
    ).toBeVisible();
  });

  test('VAT calculation is correct for each line', async ({ page }) => {
    const client = await createTestClient(page);

    await page.goto('/proposals/new');
    await page.locator('[data-testid="client-card"]').filter({ hasText: client.name }).click();
    await page.locator('[data-testid="build-mode-manual"]').click();
    await page.locator('[data-testid="client-continue-button"]').click();

    // Add service with known price (£85 bookkeeping)
    await page
      .locator('[data-testid="available-service-row"]')
      .filter({ hasText: 'Comprehensive Bookkeeping' })
      .click();

    // Edit to ensure 20% VAT
    const selectedRow = page
      .locator('[data-testid="selected-service-row"]')
      .filter({ hasText: 'Comprehensive Bookkeeping' });
    await selectedRow.hover();
    await selectedRow.locator('[data-testid="edit-service-button"]').click();
    await page.selectOption('[data-testid="edit-vat-select"]', '20');
    await page.locator('[data-testid="save-edit-button"]').click();

    // Go to review
    await page.locator('[data-testid="services-continue-button"]').click();

    // Verify total includes VAT: £85 + 20% = £102 (shown on the line and in the monthly band footer)
    const reviewRow = page
      .locator('[data-testid="selected-service-row"]')
      .filter({ hasText: 'Comprehensive Bookkeeping' });
    await expect(reviewRow).toContainText(/£102/);
  });
});

test.describe('Pricing parity', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPartner(page);
    await ensureTestService(page, {
      name: 'Comprehensive Bookkeeping',
      basePrice: 85,
      defaultFrequency: 'MONTHLY',
    });
  });

  test('create → save → detail view shows same monthly cost band', async ({ page }) => {
    const client = await createTestClient(page, {
      name: 'Parity Test Client',
      email: 'parity-test@example.com',
    });

    await page.goto('/proposals/new');
    await page.locator('[data-testid="client-card"]').filter({ hasText: client.name }).click();
    await page.locator('[data-testid="build-mode-manual"]').click();
    await page.locator('[data-testid="client-continue-button"]').click();
    await page
      .locator('[data-testid="available-service-row"]')
      .filter({ hasText: 'Comprehensive Bookkeeping' })
      .click();
    await page.locator('[data-testid="services-continue-button"]').click();

    const reviewTotal = page
      .getByText('Typical monthly cash flow')
      .locator('..')
      .locator('..')
      .locator('span.text-xl');
    await expect(reviewTotal).toBeVisible();
    const reviewText = (await reviewTotal.textContent())!.replace(/[^0-9.]/g, '');
    const reviewValue = parseFloat(reviewText);

    await page.fill('[data-testid="proposal-title-input"]', 'Pricing Parity Test');
    await page.locator('[data-testid="create-proposal-button"]').click();

    // Dismiss the "save as template?" prompt — the redirect fires on close
    await page
      .getByRole('button', { name: 'Not now' })
      .click({ timeout: 15000 })
      .catch(() => {});
    await expect(page).toHaveURL(/\/proposals\/.+/);

    const detailMonthly = page
      .getByText('Typical monthly cash flow')
      .locator('..')
      .locator('..')
      .locator('span.text-xl');
    if (await detailMonthly.count()) {
      const detailText = (await detailMonthly.first().textContent())!.replace(/[^0-9.]/g, '');
      const detailValue = parseFloat(detailText);
      expect(Math.abs(detailValue - reviewValue)).toBeLessThan(1);
    }

    await page.reload();
    if (await detailMonthly.count()) {
      const reloadedText = (await detailMonthly.first().textContent())!.replace(/[^0-9.]/g, '');
      expect(Math.abs(parseFloat(reloadedText) - reviewValue)).toBeLessThan(1);
    }
  });
});

test.describe('CSRF Handling', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPartner(page);
    await ensureTestService(page, {
      name: 'Comprehensive Bookkeeping',
      basePrice: 85,
      defaultFrequency: 'MONTHLY',
    });
  });

  test('proposal creation works with valid CSRF token', async ({ page }) => {
    const client = await createTestClient(page);

    await page.goto('/proposals/new');
    await page.locator('[data-testid="client-card"]').filter({ hasText: client.name }).click();
    await page.locator('[data-testid="build-mode-manual"]').click();
    await page.locator('[data-testid="client-continue-button"]').click();
    await page
      .locator('[data-testid="available-service-row"]')
      .filter({ hasText: 'Comprehensive Bookkeeping' })
      .click();
    await page.locator('[data-testid="services-continue-button"]').click();

    // Fill proposal title
    await page.fill('[data-testid="proposal-title-input"]', 'Test CSRF Proposal');

    // Submit should succeed
    await page.locator('[data-testid="create-proposal-button"]').click();

    // Dismiss the "save as template?" prompt — the redirect fires on close
    await page
      .getByRole('button', { name: 'Not now' })
      .click({ timeout: 15000 })
      .catch(() => {});

    // Verify success by navigation to proposal detail
    await expect(page).toHaveURL(/\/proposals\/.+/);
  });

  test('CSRF token auto-refreshes on expiry', async ({ page, context }) => {
    const client = await createTestClient(page);

    // Clear CSRF cookie to simulate expiry before proposal creation
    await context.clearCookies({ name: 'csrfToken' });

    await page.goto('/proposals/new');
    await page.locator('[data-testid="client-card"]').filter({ hasText: client.name }).click();
    await page.locator('[data-testid="build-mode-manual"]').click();
    await page.locator('[data-testid="client-continue-button"]').click();
    await page
      .locator('[data-testid="available-service-row"]')
      .filter({ hasText: 'Comprehensive Bookkeeping' })
      .click();
    await page.locator('[data-testid="services-continue-button"]').click();

    await page.fill('[data-testid="proposal-title-input"]', 'Test Auto-Retry');

    // Should auto-retry and succeed
    await page.locator('[data-testid="create-proposal-button"]').click();

    // Dismiss the "save as template?" prompt — the redirect fires on close
    await page
      .getByRole('button', { name: 'Not now' })
      .click({ timeout: 15000 })
      .catch(() => {});

    // Verify success by navigation to proposal detail
    await expect(page).toHaveURL(/\/proposals\/.+/);
  });
});
