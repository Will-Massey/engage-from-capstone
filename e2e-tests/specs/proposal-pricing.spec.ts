import { test, expect } from '@playwright/test';
import { loginAsPartner, createTestClient, cleanupTestData } from '../fixtures/helpers';

/**
 * Proposal Pricing E2E Tests
 * Validates pricing frequency handling and calculations with ProposalBuilder_v2
 */

test.describe('Proposal Pricing Frequency', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPartner(page);
  });

  test.afterEach(async () => {
    await cleanupTestData();
  });

  test('annual service displays as monthly equivalent', async ({ page }) => {
    const client = await createTestClient(page, {
      name: 'Test Annual Client',
      email: 'test-annual@example.com',
    });

    await page.goto('/proposals/new');

    // Step 1: Select client
    await page.waitForSelector('[data-testid="client-card"]');
    const clientCard = page.locator('[data-testid="client-card"]').filter({ hasText: client.name });
    await clientCard.click();
    await page.locator('[data-testid="client-continue-button"]').click();

    // Step 2: Add an annual service
    const serviceRow = page.locator('[data-testid="available-service-row"]').filter({ hasText: 'Annual Accounts Preparation & Filing' });
    await serviceRow.click();

    // Verify the service appears in selected services with monthly equivalent
    const selectedRow = page.locator('[data-testid="selected-service-row"]').filter({ hasText: 'Annual Accounts Preparation & Filing' });
    await expect(selectedRow).toBeVisible();
    // £850/year = £70.83/month
    await expect(selectedRow.filter({ hasText: /£70\.83|£70\.8|£70/ })).toBeVisible();
    await expect(selectedRow.filter({ hasText: 'month' })).toBeVisible();

    // Go to review
    await page.locator('[data-testid="services-continue-button"]').click();

    // Verify review page shows monthly equivalent total
    await expect(page.locator('text=Total Investment')).toBeVisible();
    // Total Investment should show monthly equivalent (~£85 inc VAT)
    const totalElement = page.locator('text=Total Investment').locator('..').locator('span.text-2xl');
    await expect(totalElement).toBeVisible();
    const totalText = await totalElement.textContent();
    const totalValue = parseFloat(totalText!.replace(/[^0-9.]/g, ''));
    expect(totalValue).toBeGreaterThan(70);
    expect(totalValue).toBeLessThan(100);
  });

  test('changing billing frequency recalculates price', async ({ page }) => {
    const client = await createTestClient(page);

    await page.goto('/proposals/new');
    await page.locator('[data-testid="client-card"]').filter({ hasText: client.name }).click();
    await page.locator('[data-testid="client-continue-button"]').click();

    // Add monthly service
    await page.locator('[data-testid="available-service-row"]').filter({ hasText: 'Comprehensive Bookkeeping' }).click();

    // Edit selected service
    const selectedRow = page.locator('[data-testid="selected-service-row"]').filter({ hasText: 'Comprehensive Bookkeeping' });
    await selectedRow.hover();
    await selectedRow.locator('[data-testid="edit-service-button"]').click();

    // Change to annual billing and update price to annual equivalent
    await page.fill('[data-testid="edit-price-input"]', '1020');
    await page.selectOption('[data-testid="edit-frequency-select"]', 'ANNUALLY');

    // Save edit
    await page.locator('[data-testid="save-edit-button"]').click();

    // Verify price updated in selected services list (shows monthly equivalent: 1020/12 = 85)
    const updatedRow = page.locator('[data-testid="selected-service-row"]').filter({ hasText: 'Comprehensive Bookkeeping' });
    await expect(updatedRow.filter({ hasText: '£85' })).toBeVisible();
    await expect(updatedRow.filter({ hasText: 'month' })).toBeVisible();
  });

  test('proposal total includes all services correctly', async ({ page }) => {
    const client = await createTestClient(page);

    await page.goto('/proposals/new');
    await page.locator('[data-testid="client-card"]').filter({ hasText: client.name }).click();
    await page.locator('[data-testid="client-continue-button"]').click();

    // Add multiple services with different frequencies
    await page.locator('[data-testid="available-service-row"]').filter({ hasText: 'Annual Accounts Preparation & Filing' }).click();
    await page.locator('[data-testid="available-service-row"]').filter({ hasText: 'Comprehensive Bookkeeping' }).click();
    await page.locator('[data-testid="available-service-row"]').filter({ hasText: 'MTD ITSA 2026/27 Transition & Quarterly Filing' }).click();

    // Go to review step
    await page.locator('[data-testid="services-continue-button"]').click();

    // Verify grand total is shown as monthly equivalent
    // Annual Accounts (£850/12=71) + Bookkeeping (£85) + MTD ITSA (£120/4=30) = ~186 + VAT = ~223
    const totalElement = page.locator('text=Total Investment').locator('..').locator('span.text-2xl');
    await expect(totalElement).toBeVisible();
    const totalText = await totalElement.textContent();
    const totalValue = parseFloat(totalText!.replace(/[^0-9.]/g, ''));
    expect(totalValue).toBeGreaterThan(150);
    expect(totalValue).toBeLessThan(300);
  });
});

test.describe('VAT Calculation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPartner(page);
  });

  test('line-level VAT can be set per service', async ({ page }) => {
    const client = await createTestClient(page);

    await page.goto('/proposals/new');
    await page.locator('[data-testid="client-card"]').filter({ hasText: client.name }).click();
    await page.locator('[data-testid="client-continue-button"]').click();

    // Add service
    await page.locator('[data-testid="available-service-row"]').filter({ hasText: 'Comprehensive Bookkeeping' }).click();

    // Edit selected service
    const selectedRow = page.locator('[data-testid="selected-service-row"]').filter({ hasText: 'Comprehensive Bookkeeping' });
    await selectedRow.hover();
    await selectedRow.locator('[data-testid="edit-service-button"]').click();

    // Set custom VAT rate to 5%
    await page.selectOption('[data-testid="edit-vat-select"]', '5');

    // Save edit
    await page.locator('[data-testid="save-edit-button"]').click();

    // Verify VAT info updated
    await expect(page.locator('text=(5% VAT)')).toBeVisible();
  });

  test('mixed VAT rates show in selected services', async ({ page }) => {
    const client = await createTestClient(page);

    await page.goto('/proposals/new');
    await page.locator('[data-testid="client-card"]').filter({ hasText: client.name }).click();
    await page.locator('[data-testid="client-continue-button"]').click();

    // Add first service
    await page.locator('[data-testid="available-service-row"]').filter({ hasText: 'Comprehensive Bookkeeping' }).click();

    // Edit first service to 20% VAT (default)
    let selectedRow = page.locator('[data-testid="selected-service-row"]').filter({ hasText: 'Comprehensive Bookkeeping' });
    await selectedRow.hover();
    await selectedRow.locator('[data-testid="edit-service-button"]').click();
    await page.selectOption('[data-testid="edit-vat-select"]', '20');
    await page.locator('[data-testid="save-edit-button"]').click();

    // Add second service and set to 0% VAT
    await page.locator('[data-testid="available-service-row"]').filter({ hasText: 'Confirmation Statement (CS01)' }).click();
    selectedRow = page.locator('[data-testid="selected-service-row"]').filter({ hasText: 'Confirmation Statement (CS01)' });
    await selectedRow.hover();
    await selectedRow.locator('[data-testid="edit-service-button"]').click();
    await page.selectOption('[data-testid="edit-vat-select"]', '0');
    await page.locator('[data-testid="save-edit-button"]').click();

    // Go to review step
    await page.locator('[data-testid="services-continue-button"]').click();

    // Verify both services are in review
    await expect(page.locator('[data-testid="selected-service-row"]').filter({ hasText: 'Comprehensive Bookkeeping' })).toBeVisible();
    await expect(page.locator('[data-testid="selected-service-row"]').filter({ hasText: 'Confirmation Statement (CS01)' })).toBeVisible();
  });

  test('VAT calculation is correct for each line', async ({ page }) => {
    const client = await createTestClient(page);

    await page.goto('/proposals/new');
    await page.locator('[data-testid="client-card"]').filter({ hasText: client.name }).click();
    await page.locator('[data-testid="client-continue-button"]').click();

    // Add service with known price (£85 bookkeeping)
    await page.locator('[data-testid="available-service-row"]').filter({ hasText: 'Comprehensive Bookkeeping' }).click();

    // Edit to ensure 20% VAT
    const selectedRow = page.locator('[data-testid="selected-service-row"]').filter({ hasText: 'Comprehensive Bookkeeping' });
    await selectedRow.hover();
    await selectedRow.locator('[data-testid="edit-service-button"]').click();
    await page.selectOption('[data-testid="edit-vat-select"]', '20');
    await page.locator('[data-testid="save-edit-button"]').click();

    // Go to review
    await page.locator('[data-testid="services-continue-button"]').click();

    // Verify total includes VAT: £85 + 20% = £102
    // Look specifically in the monthly total section for the VAT-inclusive total
    await expect(page.locator('text=month Total').locator('..').filter({ hasText: '£102' })).toBeVisible();
  });
});

test.describe('CSRF Handling', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPartner(page);
  });

  test('proposal creation works with valid CSRF token', async ({ page }) => {
    const client = await createTestClient(page);

    await page.goto('/proposals/new');
    await page.locator('[data-testid="client-card"]').filter({ hasText: client.name }).click();
    await page.locator('[data-testid="client-continue-button"]').click();
    await page.locator('[data-testid="available-service-row"]').filter({ hasText: 'Comprehensive Bookkeeping' }).click();
    await page.locator('[data-testid="services-continue-button"]').click();

    // Fill proposal title
    await page.fill('[data-testid="proposal-title-input"]', 'Test CSRF Proposal');

    // Submit should succeed
    await page.locator('[data-testid="create-proposal-button"]').click();

    // Verify success by navigation to proposal detail
    await expect(page).toHaveURL(/\/proposals\/.+/);
  });

  test('CSRF token auto-refreshes on expiry', async ({ page, context }) => {
    const client = await createTestClient(page);

    // Clear CSRF cookie to simulate expiry before proposal creation
    await context.clearCookies({ name: 'csrfToken' });

    await page.goto('/proposals/new');
    await page.locator('[data-testid="client-card"]').filter({ hasText: client.name }).click();
    await page.locator('[data-testid="client-continue-button"]').click();
    await page.locator('[data-testid="available-service-row"]').filter({ hasText: 'Comprehensive Bookkeeping' }).click();
    await page.locator('[data-testid="services-continue-button"]').click();

    await page.fill('[data-testid="proposal-title-input"]', 'Test Auto-Retry');

    // Should auto-retry and succeed
    await page.locator('[data-testid="create-proposal-button"]').click();

    // Verify success by navigation to proposal detail
    await expect(page).toHaveURL(/\/proposals\/.+/);
  });
});
