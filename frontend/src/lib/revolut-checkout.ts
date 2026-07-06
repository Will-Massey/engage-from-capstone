import RevolutCheckout from '@revolut/checkout';

export interface RevolutCheckoutOptions {
  token: string;
  mode?: 'sandbox' | 'prod';
  onSuccess?: () => void;
  onError?: (message: string) => void;
  onCancel?: () => void;
}

export async function openRevolutCheckout({
  token,
  mode = 'sandbox',
  onSuccess,
  onError,
  onCancel,
}: RevolutCheckoutOptions) {
  const instance = await RevolutCheckout(token, mode);

  instance.payWithPopup({
    onSuccess: () => onSuccess?.(),
    onError: (error: { message?: string }) => onError?.(error?.message || 'Payment failed'),
    onCancel: () => onCancel?.(),
  });
}
