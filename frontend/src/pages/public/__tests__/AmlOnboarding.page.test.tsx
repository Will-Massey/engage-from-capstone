/**
 * The client link /onboarding/aml/:token rendered "ID verification coming
 * soon" for every client. It must render the live upload form (or the
 * client's status), never a placeholder.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const getAmlOnboarding = vi.fn();

vi.mock('react-router-dom', () => ({ useParams: () => ({ token: 'tok_existing_link' }) }));
vi.mock('../../../utils/api', () => ({
  apiClient: {
    getAmlOnboarding: (...args: unknown[]) => getAmlOnboarding(...args),
    submitAmlOnboarding: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import AmlOnboarding from '../AmlOnboarding';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function context(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      client: { name: 'Paul Example', contactName: 'Paul Example' },
      practice: { name: 'Fortis Example', primaryColor: null, logo: null },
      lifecycleStage: 'PROPOSAL_ACCEPTED',
      amlStatus: 'NOT_STARTED',
      amlSubmittedAt: null,
      amlCompletedAt: null,
      existingSubmission: null,
      ...overrides,
    },
  };
}

let container: HTMLDivElement;
let root: Root;

async function renderPage() {
  await act(async () => {
    root.render(<AmlOnboarding />);
  });
  // let the load effect resolve
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  getAmlOnboarding.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('AmlOnboarding page (client ID / AML upload link)', () => {
  it('shows the live upload form, not a coming-soon placeholder', async () => {
    getAmlOnboarding.mockResolvedValue(context());
    await renderPage();

    expect(getAmlOnboarding).toHaveBeenCalledWith('tok_existing_link');
    const text = container.textContent || '';
    expect(text.toLowerCase()).not.toContain('coming soon');
    expect(container.querySelector('[data-testid="aml-onboarding-coming-soon"]')).toBeNull();
    expect(container.querySelector('[data-testid="aml-onboarding-form"]')).not.toBeNull();
    expect(text).toContain('ID & AML verification');
    expect(text).toContain('Photo ID');
    expect(text).toContain('Proof of address');

    const inputs = container.querySelectorAll('input[type="file"]');
    expect(inputs.length).toBe(2);
    expect(inputs[0].getAttribute('accept')).toBe(
      'image/jpeg,image/png,image/webp,application/pdf'
    );
  });

  it('shows "Documents received" once the client has uploaded', async () => {
    getAmlOnboarding.mockResolvedValue(
      context({
        amlStatus: 'PENDING',
        amlSubmittedAt: '2026-10-08T16:00:00Z',
        existingSubmission: { idDocumentType: 'PASSPORT', fullLegalName: 'Paul Example' },
      })
    );
    await renderPage();
    const status = container.querySelector('[data-testid="aml-onboarding-status"]');
    expect(status?.getAttribute('data-aml-step')).toBe('uploaded');
    expect(container.textContent).toContain('Documents received');
    expect(container.querySelector('[data-testid="aml-onboarding-form"]')).toBeNull();
  });

  it('shows "Verification complete" once the practice has verified', async () => {
    getAmlOnboarding.mockResolvedValue(
      context({ amlStatus: 'CLEAR', amlCompletedAt: '2026-10-09T09:00:00Z' })
    );
    await renderPage();
    const status = container.querySelector('[data-testid="aml-onboarding-status"]');
    expect(status?.getAttribute('data-aml-step')).toBe('verified');
    expect(container.textContent).toContain('Verification complete');
  });

  it('asks for a re-upload when the practice refers the documents', async () => {
    getAmlOnboarding.mockResolvedValue(
      context({
        amlStatus: 'REFER',
        amlSubmittedAt: '2026-10-08T16:00:00Z',
        existingSubmission: { idDocumentType: 'PASSPORT', fullLegalName: 'Paul Example' },
      })
    );
    await renderPage();
    expect(container.querySelector('[data-testid="aml-onboarding-resubmit"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="aml-onboarding-form"]')).not.toBeNull();
  });

  it('explains an invalid or expired link', async () => {
    getAmlOnboarding.mockRejectedValue(new Error('404'));
    await renderPage();
    expect(container.textContent).toContain('This link is invalid or has expired');
  });
});
