import { useState, useEffect, lazy, Suspense } from 'react';
import { apiClient } from '../utils/api';
import toast from 'react-hot-toast';
import { CheckIcon } from '@heroicons/react/24/outline';

const StripePaymentForm = lazy(() => import('../components/payments/StripePaymentForm'));

interface PricingTier {
  name: string;
  description: string;
  price: number;
  maxUsers: number | string;
  maxClients: number | string;
  maxProposals: number | string;
  features: string[];
  priceId?: string;
}

const TIER_ORDER = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as const;

const Subscription = () => {
  const [provider, setProvider] = useState<'stripe' | null>(null);
  const [stripePromise, setStripePromise] = useState<any>(null);
  const [ElementsComponent, setElementsComponent] = useState<any>(null);
  const [tiers, setTiers] = useState<Record<string, PricingTier>>({});
  const [currentSubscription, setCurrentSubscription] = useState<{
    hasSubscription?: boolean;
    tier?: string;
    status?: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStripeTier, setSelectedStripeTier] = useState<string | null>(null);

  useEffect(() => {
    void loadBillingConfig();
    void loadSubscription();
  }, []);

  const loadBillingConfig = async () => {
    try {
      const response = (await apiClient.getBillingConfig()) as any;

      if (!response.success) return;

      setTiers(response.data.tiers);
      const nextProvider = response.data.provider === 'stripe' ? 'stripe' : null;
      setProvider(nextProvider);

      if (nextProvider === 'stripe' && response.data.publishableKey?.startsWith('pk_')) {
        const [{ loadStripe }, { Elements }] = await Promise.all([
          import('@stripe/stripe-js'),
          import('@stripe/react-stripe-js'),
        ]);
        setElementsComponent(() => Elements);
        setStripePromise(loadStripe(response.data.publishableKey));
      }
    } catch {
      // Billing optional in dev
    }
  };

  const loadSubscription = async () => {
    try {
      setIsLoading(true);
      const response = (await apiClient.getBillingSubscription()) as any;
      if (response.success) {
        setCurrentSubscription(response.data);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-pulse h-8 w-48 bg-gray-200 rounded mb-8" />
        <div className="grid md:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-64 bg-gray-100 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const activeTier = currentSubscription?.tier;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {currentSubscription?.hasSubscription && (
        <div className="mb-8">
          <p className="text-sm text-emerald-700 font-medium">
            Active plan: {activeTier} ({currentSubscription.status})
          </p>
        </div>
      )}

      {!provider && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
          Billing is not configured yet. Contact support@capstonesoftware.co.uk.
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {TIER_ORDER.map((key) => {
          const tier = tiers[key];
          if (!tier) return null;
          const isActive = activeTier === key;

          return (
            <div
              key={key}
              className={`rounded-xl border p-6 bg-white shadow-sm ${isActive ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-gray-200'}`}
            >
              <h2 className="text-xl font-semibold text-gray-900">{tier.name}</h2>
              <p className="text-sm text-gray-500 mt-1">{tier.description}</p>
              <p className="mt-4 text-3xl font-bold text-gray-900">
                £{tier.price}
                <span className="text-base font-normal text-gray-500">/month + VAT</span>
              </p>
              <ul className="mt-4 space-y-2 text-sm text-gray-600">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <CheckIcon className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              {provider === 'stripe' && tier.priceId && (
                <button
                  type="button"
                  onClick={() => setSelectedStripeTier(key)}
                  disabled={isActive}
                  className="mt-6 w-full btn-primary disabled:opacity-50"
                >
                  {isActive ? 'Current plan' : 'Subscribe with card'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {provider === 'stripe' && selectedStripeTier && stripePromise && ElementsComponent && (
        <div className="mt-8 max-w-md mx-auto bg-white rounded-xl border p-6">
          <ElementsComponent stripe={stripePromise}>
            <Suspense fallback={<div>Loading payment form…</div>}>
              <StripePaymentForm
                priceId={tiers[selectedStripeTier]?.priceId || ''}
                onSuccess={() => {
                  setSelectedStripeTier(null);
                  void loadSubscription();
                }}
                onCancel={() => setSelectedStripeTier(null)}
              />
            </Suspense>
          </ElementsComponent>
        </div>
      )}
    </div>
  );
};

export default Subscription;
