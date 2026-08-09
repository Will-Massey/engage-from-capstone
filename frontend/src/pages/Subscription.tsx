import { useState, useEffect, lazy, Suspense } from 'react';
import { apiClient } from '../utils/api';
import toast from 'react-hot-toast';
import { CheckIcon } from '@heroicons/react/24/outline';
import { isNativeApp } from '../lib/native';

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

/**
 * App Store Review Guideline 3.1.1.
 *
 * An Engage subscription is a digital service, so inside the iOS app it may not
 * be sold by any mechanism other than in-app purchase — and 3.1.1 bars not just
 * a card form but "buttons, external links, or other calls to action" pointing
 * at an outside purchasing route. Linking out needs the External Purchase Link
 * entitlement, which Capstone does not hold.
 *
 * Practices buy Engage on the web before their staff install the app, so the
 * native build carries no purchase route at all: no tier storefront, no card
 * form, and the Stripe SDK is never even loaded. What remains is a statement of
 * the plan the practice already has, which is account status rather than a call
 * to action. The review notes must describe the app this way, and they will be
 * true — a mismatch between the notes and a live purchase surface is exactly
 * what got The Forge rejected under 2.1(b).
 */
const NATIVE_PURCHASE_DISABLED = true;

interface NativeSummaryProps {
  subscription: { hasSubscription?: boolean; tier?: string; status?: string } | null;
  tiers: Record<string, PricingTier>;
}

export const NativeSubscriptionSummary = ({ subscription, tiers }: NativeSummaryProps) => {
  const tierKey = subscription?.tier;
  const tier = tierKey ? tiers[tierKey] : undefined;

  if (!subscription?.hasSubscription) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold text-gray-900">Your plan</h1>
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-gray-700">
            This practice does not have an active Engage Practice plan yet.
          </p>
          <p className="mt-3 text-sm text-gray-500">
            Plans are held at practice level and arranged by your practice administrator.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-gray-900">Your plan</h1>

      <div className="mt-6 rounded-xl border border-emerald-200 bg-white p-6 shadow-sm">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-xl font-semibold text-gray-900">{tier?.name || tierKey}</h2>
          <span className="text-sm font-medium text-emerald-700">{subscription.status}</span>
        </div>

        {tier?.description && <p className="mt-1 text-sm text-gray-500">{tier.description}</p>}

        {tier?.features?.length ? (
          <ul className="mt-5 space-y-2 text-sm text-gray-600">
            {tier.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <CheckIcon className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                {feature}
              </li>
            ))}
          </ul>
        ) : null}

        <p className="mt-6 border-t border-gray-100 pt-4 text-sm text-gray-500">
          Your plan is managed by your practice administrator.
        </p>
      </div>
    </div>
  );
};

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

      // Never initialise a payment SDK inside the native shell (3.1.1).
      if (isNativeApp() && NATIVE_PURCHASE_DISABLED) return;

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

  // Native gets status only — no tier storefront, no card form, no link out.
  if (isNativeApp() && NATIVE_PURCHASE_DISABLED) {
    return <NativeSubscriptionSummary subscription={currentSubscription} tiers={tiers} />;
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
