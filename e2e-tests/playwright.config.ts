import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration for Engage
 * Tests proposal creation, pricing, VAT, and CSRF handling
 */

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
  ],

  use: {
    baseURL: process.env.FRONTEND_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // API configuration for backend tests
    extraHTTPHeaders: {
      'X-Test-Mode': 'e2e',
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  // Web servers auto-start disabled - run them manually or in CI
  // webServer: [
  //   {
  //     command: 'cd ../backend && npm run dev',
  //     url: 'http://localhost:3001/ping',
  //     reuseExistingServer: !process.env.CI,
  //     timeout: 120000,
  //   },
  //   {
  //     command: 'cd ../frontend && npm run dev',
  //     url: 'http://localhost:5173',
  //     reuseExistingServer: !process.env.CI,
  //     timeout: 120000,
  //   }
  // ],
});
