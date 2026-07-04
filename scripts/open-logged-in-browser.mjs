#!/usr/bin/env node
/**
 * Open a visible browser, log into Engage production, leave session open for manual testing.
 * Usage: node scripts/open-logged-in-browser.mjs
 */
import { chromium } from 'playwright';

const BASE = (process.env.FRONTEND_URL || 'https://capstonesoftware.co.uk/engage').replace(/\/$/, '');
const EMAIL = process.env.SMOKE_EMAIL || 'william@capstonesoftware.co.uk';
const PASSWORD = process.env.SMOKE_PASSWORD || 'Engage2026!';

console.log(`Opening ${BASE}/login as ${EMAIL}…`);

const browser = await chromium.launch({
  headless: false,
  ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
});
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('input[type="email"]', { timeout: 30_000 });

await page.locator('input[type="email"]').fill(EMAIL);
await page.locator('input[autocomplete="current-password"]').fill(PASSWORD);
await page.getByRole('button', { name: /^sign in$/i }).click();

await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 30_000 });
console.log(`Logged in → ${page.url()}`);
console.log('Browser left open for testing. Close the window or press Ctrl+C here to exit.');

await page.waitForEvent('close', { timeout: 0 }).catch(() => {});
await browser.close();