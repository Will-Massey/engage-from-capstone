import { Page, expect } from '@playwright/test';
import { randomUUID } from 'crypto';

/**
 * E2E Test Helpers for Engage
 */

const TEST_USER = {
  email: process.env.TEST_USER_EMAIL || 'admin@demo.practice',
  password: process.env.TEST_USER_PASSWORD || 'DemoPass123!',
};

const API_BASE = process.env.API_URL || 'http://localhost:3001/api';

/**
 * Login as partner user
 */
export async function loginAsPartner(page: Page): Promise<void> {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  const emailInput = page.locator('input[name="email"]');
  const passwordInput = page.locator('input[name="password"]');
  const submitButton = page.locator('button[type="submit"]');

  await emailInput.fill(TEST_USER.email);
  await passwordInput.fill(TEST_USER.password);
  await expect(submitButton).toBeEnabled();

  // Click and wait for navigation to complete
  await Promise.all([
    page.waitForURL(/\/$|\/dashboard|\/proposals/, { timeout: 15000, waitUntil: 'networkidle' }),
    submitButton.click(),
  ]);
}

/**
 * Create a test client using the new 2-step wizard
 */
export async function createTestClient(
  page: Page,
  overrides: Partial<{ name: string; email: string }> = {}
): Promise<{ id: string; name: string; email: string }> {
  const testId = randomUUID().slice(0, 8);
  const clientData = {
    name: overrides.name || `Test Client ${testId}`,
    email: overrides.email || `test-${testId}@example.com`,
    companyType: 'LIMITED_COMPANY',
  };

  // Navigate to client creation
  await page.goto('/clients/new');

  // Step 1: Basic Info
  await page.click('text=Limited Company');
  await page.fill('input[name="name"]', clientData.name);
  await page.fill('input[name="contactEmail"]', clientData.email);

  await page.click('button:has-text("Continue")');

  // Step 2: Details
  await page.fill('input[name="companyNumber"]', '12345678');
  await page.fill('input[name="utr"]', '1234567890');
  await page.fill('input[name="addressLine1"]', '1 Test Street');
  await page.fill('input[name="city"]', 'London');
  await page.fill('input[name="postcode"]', 'SW1A 1AA');

  await page.click('button:has-text("Create Client")');

  // Wait for creation — verify by URL redirect to clients list or client detail
  await expect(page).toHaveURL(/\/clients/);

  return {
    id: `test-${testId}`,
    name: clientData.name,
    email: clientData.email,
  };
}

/**
 * Create a test service with specific pricing
 */
export async function createTestService(
  page: Page,
  config: {
    name: string;
    basePrice: number;
    defaultFrequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY' | 'ONE_TIME';
    category?: string;
  }
): Promise<void> {
  await page.goto('/services');
  await page.click('a:has-text("Add Service")');

  await page.fill('input[name="name"]', config.name);
  await page.fill('input[name="basePrice"]', config.basePrice.toString());
  await page.selectOption('select[name="defaultFrequency"]', config.defaultFrequency);
  await page.selectOption('select[name="category"]', config.category || 'COMPLIANCE');

  await page.click('button:has-text("Create")');

  await expect(page.locator('text=Service created')).toBeVisible();
}

/**
 * Create a proposal with services using the proposal builder (Create Proposal flow).
 */
export async function createTestProposal(
  page: Page,
  config: {
    clientName: string;
    services: string[];
    title?: string;
  }
): Promise<{ id: string; reference: string }> {
  await page.goto('/proposals/new');

  // Step 1: Select client
  await page.waitForSelector('[data-testid="client-card"]');
  const clientCard = page.locator('[data-testid="client-card"]').filter({ hasText: config.clientName });
  await expect(clientCard).toBeVisible();
  await clientCard.click();
  await page.locator('[data-testid="client-continue-button"]').click();

  // Step 2: Add services
  await page.waitForSelector('[data-testid="available-service-row"]');
  for (const service of config.services) {
    const serviceRow = page.locator('[data-testid="available-service-row"]').filter({ hasText: service });
    await expect(serviceRow).toBeVisible();
    await serviceRow.click();
  }

  await page.locator('[data-testid="services-continue-button"]').click();

  // Step 3: Fill title and create
  const title = config.title || `Test Proposal ${randomUUID().slice(0, 8)}`;
  await page.fill('[data-testid="proposal-title-input"]', title);

  await page.locator('[data-testid="create-proposal-button"]').click();

  // Wait for navigation to proposal detail page as success indicator
  // Must match /proposals/<uuid> but not /proposals/new or /proposals/new/edit
  await expect(page).toHaveURL(/\/proposals\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);

  // Extract proposal ID from URL
  const url = page.url();
  const idMatch = url.match(/\/proposals\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  const id = idMatch ? idMatch[1] : 'unknown';

  return {
    id,
    reference: 'PROP-TEST',
  };
}

/**
 * Calculate expected monthly price
 */
export function calculateMonthlyPrice(basePrice: number, frequency: string): number {
  switch (frequency) {
    case 'ANNUALLY':
      return Math.round((basePrice / 12) * 100) / 100;
    case 'QUARTERLY':
      return Math.round((basePrice / 3) * 100) / 100;
    case 'MONTHLY':
    case 'ONE_TIME':
    default:
      return basePrice;
  }
}

/**
 * Calculate VAT amount
 */
export function calculateVAT(amount: number, vatRate: number): number {
  return Math.round(amount * (vatRate / 100) * 100) / 100;
}

/**
 * Cleanup test data via API
 */
export async function cleanupTestData(): Promise<void> {
  try {
    // This would call an API endpoint to clean up test data
    // For now, just log
    console.log('Cleaning up test data...');
  } catch (error) {
    console.error('Cleanup failed:', error);
  }
}

/**
 * Wait for element to be stable
 */
export async function waitForStable(
  page: Page,
  selector: string,
  timeout: number = 5000
): Promise<void> {
  const element = page.locator(selector);
  await element.waitFor({ state: 'visible', timeout });

  // Wait for any animations to complete
  await page.waitForTimeout(300);
}

/**
 * Get CSRF token from page
 */
export async function getCSRFToken(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const match = document.cookie.match(/csrfToken=([^;]+)/);
    return match ? match[1] : null;
  });
}

/**
 * Make authenticated API request
 */
export async function apiRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json();
}
