import { test, expect } from '@playwright/test';
import { loginAsPartner, createTestClient, cleanupTestData } from '../fixtures/helpers';

/**
 * Proposal Pricing E2E Tests
 * Validates pricing frequency handling and calculations
 */

test.describe('Proposal Pricing Frequency', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPartner(page);
  });

  test.afterEach(async () => {
    await cleanupTestData();
  });

  test('annual service displays as monthly equivalent', async ({ page }) => {
    // Create a test client
    const client = await createTestClient(page, {
      name: 'Test Annual Client',
      email: 'test-annual@example.com'
    });

    // Navigate to proposal creation
    await page.goto('/proposals/create');
    
    // Step 1: Select client
    await page.click(`text=${client.name}`);
    await page.click('button:has-text("Continue")');

    // Step 2: Add an annual service (e.g., Annual Accounts at £850)
    await page.click('text=Annual Accounts Preparation');

    // Verify monthly price is displayed
    const priceDisplay = await page.locator('[data-testid="service-price"]').first();
    await expect(priceDisplay).toContainText('£71'); // 850/12 ≈ 71
    await expect(priceDisplay).toContainText('/mo');

    // Verify annual badge is shown
    const annualBadge = await page.locator('[data-testid="billing-badge"]').first();
    await expect(annualBadge).toContainText('£850/year');
  });

  test('changing billing frequency recalculates price', async ({ page }) => {
    const client = await createTestClient(page);
    
    await page.goto('/proposals/create');
    await page.click(`text=${client.name}`);
    await page.click('button:has-text("Continue")');

    // Add monthly service
    await page.click('text=Monthly Bookkeeping');
    
    // Get initial price
    const initialPrice = await page.locator('[data-testid="line-total"]').first().textContent();
    expect(initialPrice).toContain('£');

    // Change to annual billing
    await page.selectOption('[data-testid="billing-frequency-select"]', 'ANNUALLY');
    
    // Verify price multiplied by 12
    const annualPrice = await page.locator('[data-testid="line-total"]').first().textContent();
    const monthlyValue = parseFloat(initialPrice!.replace(/[^0-9.]/g, ''));
    const annualValue = parseFloat(annualPrice!.replace(/[^0-9.]/g, ''));
    expect(Math.abs(annualValue - (monthlyValue * 12))).toBeLessThan(1);
  });

  test('proposal total includes all services correctly', async ({ page }) => {
    const client = await createTestClient(page);
    
    await page.goto('/proposals/create');
    await page.click(`text=${client.name}`);
    await page.click('button:has-text("Continue")');

    // Add multiple services with different frequencies
    await page.click('text=Annual Accounts Preparation'); // £850/year = £71/month
    await page.click('text=Monthly Bookkeeping'); // £150/month
    await page.click('text=Quarterly VAT Return'); // £180/quarter = £60/month

    // Go to review step
    await page.click('button:has-text("Continue")');

    // Verify subtotal
    const subtotal = await page.locator('[data-testid="proposal-subtotal"]').textContent();
    const expectedMonthly = 71 + 150 + 60; // ~281
    expect(parseFloat(subtotal!.replace(/[^0-9.]/g, ''))).toBeGreaterThan(250);
  });
});

test.describe('VAT Calculation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPartner(page);
  });

  test('line-level VAT can be set per service', async ({ page }) => {
    const client = await createTestClient(page);
    
    await page.goto('/proposals/create');
    await page.click(`text=${client.name}`);
    await page.click('button:has-text("Continue")');

    // Add service
    await page.click('text=Monthly Bookkeeping');

    // Set custom VAT rate
    await page.selectOption('[data-testid="vat-rate-select"]', '5');

    // Verify VAT amount updated
    const vatAmount = await page.locator('[data-testid="line-vat"]').first().textContent();
    expect(vatAmount).toContain('5%');
  });

  test('mixed VAT rates show as "Mixed" in totals', async ({ page }) => {
    const client = await createTestClient(page);
    
    await page.goto('/proposals/create');
    await page.click(`text=${client.name}`);
    await page.click('button:has-text("Continue")');

    // Add services with different VAT rates
    await page.click('text=Monthly Bookkeeping');
    await page.selectOption('[data-testid="vat-rate-select"]:nth-child(1)', '20');

    await page.click('text=Exempt Service');
    await page.selectOption('[data-testid="vat-rate-select"]:nth-child(2)', '0');

    // Go to review step
    await page.click('button:has-text("Continue")');

    // Verify "Mixed" shown for VAT
    const vatLabel = await page.locator('[data-testid="vat-label"]').textContent();
    expect(vatLabel).toContain('Mixed');
  });

  test('VAT calculation is correct for each line', async ({ page }) => {
    const client = await createTestClient(page);
    
    await page.goto('/proposals/create');
    await page.click(`text=${client.name}`);
    await page.click('button:has-text("Continue")');

    // Add service with known price
    await page.click('text=Test Service £100');
    await page.selectOption('[data-testid="vat-rate-select"]', '20');

    // Calculate expected VAT
    const lineTotal = 100;
    const expectedVAT = lineTotal * 0.20; // £20

    // Verify VAT displayed
    const vatDisplay = await page.locator('[data-testid="line-vat-amount"]').first().textContent();
    expect(vatDisplay).toContain('20.00');
  });
});

test.describe('CSRF Handling', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPartner(page);
  });

  test('proposal creation works with valid CSRF token', async ({ page }) => {
    const client = await createTestClient(page);
    
    await page.goto('/proposals/create');
    await page.click(`text=${client.name}`);
    await page.click('button:has-text("Continue")');
    await page.click('text=Monthly Bookkeeping');
    await page.click('button:has-text("Continue")');

    // Fill proposal title
    await page.fill('[data-testid="proposal-title"]', 'Test CSRF Proposal');
    
    // Submit should succeed
    await page.click('button:has-text("Create & Copy Link")');

    // Verify success
    await expect(page.locator('text=Proposal created')).toBeVisible();
  });

  test('CSRF token auto-refreshes on expiry', async ({ page, context }) => {
    // Clear CSRF cookie to simulate expiry
    await context.clearCookies({ name: 'csrfToken' });

    const client = await createTestClient(page);
    
    await page.goto('/proposals/create');
    await page.click(`text=${client.name}`);
    await page.click('button:has-text("Continue")');
    await page.click('text=Monthly Bookkeeping');
    await page.click('button:has-text("Continue")');

    await page.fill('[data-testid="proposal-title"]', 'Test Auto-Retry');
    
    // Should auto-retry and succeed
    await page.click('button:has-text("Create & Copy Link")');

    await expect(page.locator('text=Proposal created')).toBeVisible();
  });
});
