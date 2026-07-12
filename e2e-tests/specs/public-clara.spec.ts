import { test, expect, Page } from '@playwright/test';
import {
  loginAsPartner,
  createTestClient,
  createTestProposal,
  ensureTestService,
  getCSRFToken,
} from '../fixtures/helpers';

/**
 * Public sign page — Clara FAQ accordion & live Q&A
 *
 * Follows the proposal-share.spec.ts fixture pattern: create a client +
 * proposal in the authenticated app, share it via the API, then exercise the
 * public /proposals/view/:token page without auth.
 */

const API_URL = process.env.API_URL || 'http://localhost:3001/api';

async function createSharedProposal(page: Page, titlePrefix: string): Promise<string> {
  const client = await createTestClient(page);
  const uniqueTitle = `${titlePrefix} ${Date.now()}`;
  const proposal = await createTestProposal(page, {
    clientName: client.name,
    services: ['Comprehensive Bookkeeping'],
    title: uniqueTitle,
  });

  await page.goto(`/proposals/${proposal.id}`);
  await page.waitForLoadState('networkidle');
  const csrf = await getCSRFToken(page);
  const shareRes = await page.request.post(`${API_URL}/proposals/${proposal.id}/share`, {
    headers: csrf ? { 'X-CSRF-Token': csrf } : {},
    data: {},
  });
  expect(shareRes.ok()).toBeTruthy();
  return (await shareRes.json()).data.shareUrl as string;
}

test.describe('Public Clara FAQ & Q&A', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPartner(page);
    await ensureTestService(page, {
      name: 'Comprehensive Bookkeeping',
      basePrice: 85,
      defaultFrequency: 'MONTHLY',
    });
  });

  test('FAQ accordion expands and collapses on the public sign page', async ({ page, context }) => {
    const shareUrl = await createSharedProposal(page, 'Clara FAQ Proposal');

    const publicPage = await context.newPage();
    await publicPage.goto(shareUrl);
    await publicPage.waitForLoadState('networkidle');

    const faqSection = publicPage.getByTestId('clara-faq-section');
    await expect(faqSection).toBeVisible();

    // Collapsed by default — no FAQ items rendered yet
    const firstItem = publicPage.getByTestId('faq-item-0');
    await expect(firstItem).toBeHidden();

    // Expand the section
    await publicPage.getByTestId('faq-toggle').click();
    await expect(firstItem).toBeVisible();

    // Expand the first FAQ item and check its answer appears
    const firstAnswer = publicPage.getByText(
      'You confirm you are authorised to accept this proposal'
    );
    await expect(firstAnswer).toBeHidden();
    await firstItem.click();
    await expect(firstAnswer).toBeVisible();

    // Collapse the item again
    await firstItem.click();
    await expect(firstAnswer).toBeHidden();

    // Collapse the whole section (animated exit — allow it to finish)
    await publicPage.getByTestId('faq-toggle').click();
    await expect(firstItem).toBeHidden({ timeout: 5000 });
  });

  test('Clara Q&A answers from the proposal (fallback without AI)', async ({ page, context }) => {
    // Clara live Q&A needs a configured AI provider (XAI_API_KEY). Mirror
    // ai-native.spec.ts: probe /ai/status (authenticated) and assert the
    // fallback answer when AI is off, the real answer when it's on.
    const statusRes = await page.request.get(`${API_URL}/ai/status`);
    const aiConfigured = !!(await statusRes.json().catch(() => ({})))?.data?.configured;

    const shareUrl = await createSharedProposal(page, 'Clara QA Proposal');

    const publicPage = await context.newPage();
    await publicPage.goto(shareUrl);
    await publicPage.waitForLoadState('networkidle');

    // Open the live Q&A panel and ask a question
    await publicPage.getByTestId('qa-toggle').click();
    await expect(publicPage.getByTestId('qa-input')).toBeVisible();
    await publicPage.getByTestId('qa-input').fill('What is included in the monthly fee?');

    const askResponsePromise = publicPage.waitForResponse(
      (resp) => resp.url().includes('/ask') && resp.request().method() === 'POST'
    );
    await publicPage.getByTestId('qa-submit').click();

    const askResponse = await askResponsePromise;
    expect(askResponse.ok()).toBeTruthy();
    const askBody = await askResponse.json();
    expect(askBody.success).toBe(true);
    expect(askBody.data.assistantName).toBe('Clara');
    const answer: string = askBody.data.answer;
    expect(answer.length).toBeGreaterThan(0);

    if (!aiConfigured) {
      // No AI key on this stack — the endpoint returns the polite fallback
      expect(answer).toMatch(/isn.t available right now/);
      await expect(publicPage.getByText(/isn.t available right now/)).toBeVisible();
    } else {
      // Real AI answer — rendered in an assistant bubble on the page
      expect(answer).not.toMatch(/isn.t available right now/);
      const answerSnippet = answer.replace(/\s+/g, ' ').trim().slice(0, 40);
      await expect(publicPage.getByText(answerSnippet)).toBeVisible();
    }
  });
});
