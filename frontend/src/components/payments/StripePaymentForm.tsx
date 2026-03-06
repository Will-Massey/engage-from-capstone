import { useState } from 'react';
import {
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { apiClient } from '../../utils/api';
import toast from 'react-hot-toast';

interface StripePaymentFormProps {
  priceId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const StripePaymentForm = ({ priceId, onSuccess, onCancel }: StripePaymentFormProps) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      toast.error('Stripe not loaded');
      return;
    }

    setIsLoading(true);

    try {
      // Create payment method
      const { error: submitError } = await elements.submit();
      if (submitError) {
        toast.error(submitError.message || 'Payment failed');
        setIsLoading(false);
        return;
      }

      // Create payment method
      const { paymentMethod, error: pmError } = await stripe.createPaymentMethod({
        elements,
      });

      if (pmError || !paymentMethod) {
        toast.error(pmError?.message || 'Failed to create payment method');
        setIsLoading(false);
        return;
      }

      // Create subscription
      const response = await apiClient.createSubscription({
        priceId,
        paymentMethodId: paymentMethod.id,
      }) as any;

      if (response.success) {
        // Confirm payment if required
        if (response.data.clientSecret) {
          const { error: confirmError } = await stripe.confirmCardPayment(
            response.data.clientSecret
          );

          if (confirmError) {
            toast.error(confirmError.message || 'Payment confirmation failed');
            setIsLoading(false);
            return;
          }
        }

        toast.success('Subscription created successfully!');
        onSuccess();
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to create subscription');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <PaymentElement />
      </div>

      <div className="flex space-x-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 btn-secondary"
          disabled={isLoading}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="flex-1 btn-primary"
          disabled={!stripe || isLoading}
        >
          {isLoading ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Processing...
            </span>
          ) : (
            'Subscribe Now'
          )}
        </button>
      </div>
    </form>
  );
};

export default StripePaymentForm;
