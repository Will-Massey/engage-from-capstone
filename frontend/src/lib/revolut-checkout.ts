import RevolutCheckout from '@revolut/checkout';

export interface RevolutCheckoutOptions {
  token: string;
  mode?: 'sandbox' | 'prod';
  onSuccess?: () => void;
  onError?: (message: string) => void;
  onCancel?: () => void;
}

declare global {
  interface Window {
    /** Set by Playwright addInitScript to avoid loading the real Revolut popup in e2e. */
    __PLAYWRIGHT_MOCK_REVOLUT__?: boolean;
  }
}

export async function openRevolutCheckout({
  token,
  mode = 'sandbox',
  onSuccess,
  onError,
  onCancel,
}: RevolutCheckoutOptions) {
  if (typeof window !== 'undefined' && window.__PLAYWRIGHT_MOCK_REVOLUT__) {
    onSuccess?.();
    return;
  }

  const instance = await RevolutCheckout(token, mode);

  instance.payWithPopup({
    onSuccess: () => onSuccess?.(),
    onError: (error: { message?: string }) => onError?.(error?.message || 'Payment failed'),
    onCancel: () => onCancel?.(),
  });
}
