import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { e2eExtraHeaders } from './fixtures/e2e-headers';

const authFile = path.join(__dirname, '.auth', 'user.json');

/**
 * Build verification — run against Render (or local) before manual QA continues.
 * Single chromium worker + global login to avoid auth rate limits.
 */
const canonicalFrontend = (
  process.env.FRONTEND_URL || 'https://capstonesoftware.co.uk/engage'
).replace(/\/$/, '');

// Default production smoke to same-origin proxy (httpOnly cookies + /auth/me).
if (!process.env.API_URL) {
  process.env.API_URL = canonicalFrontend;
}
if (!process.env.FRONTEND_URL) {
  process.env.FRONTEND_URL = canonicalFrontend;
}

export default defineConfig({
  testDir: './specs',
  testMatch: [
    'build-smoke.spec.ts',
    'ai-native.spec.ts',
    'templates-smoke.spec.ts',
    'automation-smoke.spec.ts',
    'market-leader-smoke.spec.ts',
    'uat-smoke.spec.ts',
    'payout-smoke.spec.ts',
    'money-path.spec.ts',
    'compliance-journeys.spec.ts',
    'layout-smoke.spec.ts',
  ],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // AI endpoints can transiently 502 / socket-hang-up on Render
  retries: 2,
  workers: 1,
  timeout: 150_000,
  globalSetup: require.resolve('./global-setup'),

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report-build' }],
    ['json', { outputFile: 'test-results/build-results.json' }],
  ],

  use: {
    baseURL: canonicalFrontend,
    storageState: authFile,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    extraHTTPHeaders: e2eExtraHeaders('e2e-build'),
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
