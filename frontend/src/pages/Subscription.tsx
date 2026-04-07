import { useState, useEffect, lazy, Suspense } from 'react';
import { apiClient } from '../utils/api';
import { useAuthStore } from '../stores/authStore';
import toast from 'react-hot-toast';
import {
  CheckIcon,
  CreditCardIcon,
  CalendarIcon,
  XCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

// Lazy load Stripe components
const loadStripeComponents = async () => {
  const [{ loadStripe }, { Elements }] = await Promise.all([
    import('@stripe/stripe-js'),
    import('@stripe/react-stripe-js'),
  ]);
  return { loadStripe, Elements };
};

// Lazy load payment form
const StripePaymentForm = lazy(() => import('../components/payments/StripePaymentForm'));

interface PricingTier {
  name: string;
  description: string;
  maxUsers: number | string;
  maxClients: number | string;
  maxProposals: number | string;
  features: string[];
  priceId?: string;
  price?: number;
}

const Subscription = () => {
  const { tenant } = useAuthStore();
  const [stripePromise, setStripePromise] = useState<any>(null);
  const [ElementsComponent, setElementsComponent] = useState<any>(null);
  const [tiers, setTiers] = useState<Record<string, PricingTier>>({});
  const [currentSubscription, setCurrentSubscription] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  useEffect(() => {
    loadStripeConfig();
    loadSubscription();
  }, []);

  const loadStripeConfig = async () => {
    try {
      const response = await apiClient.getStripeConfig() as any;
      if (response.success) {
        setTiers(response.data.tiers);
        // Only load Stripe if properly configured
        if (response.data.publishableKey && response.data.publishableKey.startsWith('pk_')) {
          const { loadStripe, Elements } = await loadStripeComponents();
          setElementsComponent(() => Elements);
          setStripePromise(loadStripe(response.data.publishableKey));
        }
      }
    } catch (error) {
      console.log('Stripe not configured');
    }
  };

  const loadSubscription = async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.getSubscription() as any;
      if (response.success) {
        setCurrentSubscription(response.data);
      }
    } catch (error) {
      // Error handled by UI
    } finally {
      setIsLoading(false);
    }
  };

  // ... rest of component
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Subscription</h1>
      {stripePromise && ElementsComponent ? (
        <ElementsComponent stripe={stripePromise}>
          <Suspense fallback={<div>Loading...</div>}>
            {/* Payment form content */}
          </Suspense>
        </ElementsComponent>
      ) : (
        <div>Stripe not configured</div>
      )}
    </div>
  );
};

export default Subscription;
