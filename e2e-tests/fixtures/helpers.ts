import { Page, expect } from '@playwright/test';
import { randomUUID } from 'crypto';

/**
 * E2E Test Helpers for Engage
 */

const TEST_USER = {
  email: process.env.TEST_USER_EMAIL || 'partner@test.com',
  password: process.env.TEST_USER_PASSWORD || 'test123',
};

const API_BASE = process.env.API_URL || 'http://localhost:3001/api';

/**
 * Login as partner user
 */
export async function loginAsPartner(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('input[name="email"]', TEST_USER.email);
  await page.fill('input[name="password"]', TEST_USER.password);
  await page.click('button[type="submit"]');

  // Wait for dashboard
  await expect(page).toHaveURL(/dashboard|proposals/);
}

/**
 * Create a test client
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

  // Navigate to clients and create
  await page.goto('/clients');
  await page.click('button:has-text("New Client")');

  await page.fill('input[name="name"]', clientData.name);
  await page.fill('input[name="contactEmail"]', clientData.email);
  await page.selectOption('select[name="companyType"]', clientData.companyType);

  await page.click('button:has-text("Create")');

  // Wait for creation
  await expect(page.locator('text=Client created')).toBeVisible();

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
  await page.click('button:has-text("New Service")');

  await page.fill('input[name="name"]', config.name);
  await page.fill('input[name="basePrice"]', config.basePrice.toString());
  await page.selectOption('select[name="defaultFrequency"]', config.defaultFrequency);
  await page.selectOption('select[name="category"]', config.category || 'COMPLIANCE');

  await page.click('button:has-text("Create")');

  await expect(page.locator('text=Service created')).toBeVisible();
}

/**
 * Create a proposal with services
 */
export async function createTestProposal(
  page: Page,
  config: {
    clientName: string;
    services: string[];
    title?: string;
  }
): Promise<{ id: string; reference: string }> {
  await page.goto('/proposals/create');

  // Select client
  await page.click(`text=${config.clientName}`);
  await page.click('button:has-text("Continue")');

  // Add services
  for (const service of config.services) {
    await page.click(`text=${service}`);
  }

  await page.click('button:has-text("Continue")');

  // Fill details
  const title = config.title || `Test Proposal ${randomUUID().slice(0, 8)}`;
  await page.fill('[data-testid="proposal-title"]', title);

  // Create
  await page.click('button:has-text("Create & Copy Link")');

  await expect(page.locator('text=Proposal created')).toBeVisible();

  return {
    id: 'test-proposal-id',
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
