import { useState, useEffect } from 'react';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
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
import StripePaymentForm from '../components/payments/StripePaymentForm';

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
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
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
        if (response.data.publishableKey) {
          setStripePromise(loadStripe(response.data.publishableKey));
        }
      }
    } catch (error) {
      // Error handled by UI
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

  const handleSubscribe = (tierKey: string) => {
    if (!stripePromise) {
      toast.error('Payment system not available');
      return;
    }
    setSelectedTier(tierKey);
    setShowPaymentForm(true);
  };

  const handleCancelSubscription = async () => {
    if (!confirm('Are you sure you want to cancel your subscription? You\'ll still have access until the end of your billing period.')) {
      return;
    }

    try {
      setIsLoading(true);
      const response = await apiClient.cancelSubscription() as any;
      if (response.success) {
        toast.success('Subscription will be cancelled at the end of the billing period');
        loadSubscription();
      }
    } catch (error) {
      toast.error('Failed to cancel subscription');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReactivateSubscription = async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.reactivateSubscription() as any;
      if (response.success) {
        toast.success('Subscription reactivated successfully');
        loadSubscription();
      }
    } catch (error) {
      toast.error('Failed to reactivate subscription');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Subscription & Billing</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage your plan and payment details
        </p>
      </div>

      {/* Current Subscription */}
      {currentSubscription?.hasSubscription && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 bg-primary-50 border-primary-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Current Plan: {currentSubscription.tier}
              </h2>
              <p className="text-sm text-slate-700 mt-1">
                Status: <span className={`font-medium ${
                  currentSubscription.status === 'active' ? 'text-green-600' : 'text-yellow-600'
                }`}>
                  {currentSubscription.status}
                </span>
              </p>
              <p className="text-sm text-slate-600 mt-1">
                Current period ends: {new Date(currentSubscription.currentPeriodEnd).toLocaleDateString()}
              </p>
              {currentSubscription.cancelAtPeriodEnd && (
                <p className="text-sm text-red-600 mt-1">
                  Your subscription will be cancelled at the end of this period
                </p>
              )}
            </div>
            <div className="flex space-x-3">
              {currentSubscription.cancelAtPeriodEnd ? (
                <button
                  onClick={handleReactivateSubscription}
                  className="btn-primary bg-green-600 hover:bg-green-700"
                  disabled={isLoading}
                >
                  <ArrowPathIcon className="h-4 w-4 mr-2" />
                  Reactivate
                </button>
              ) : (
                <button
                  onClick={handleCancelSubscription}
                  className="btn-secondary text-red-600 border-red-300 hover:bg-red-50"
                  disabled={isLoading}
                >
                  <XCircleIcon className="h-4 w-4 mr-2" />
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payment Form Modal */}
      {showPaymentForm && selectedTier && stripePromise && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              Subscribe to {tiers[selectedTier]?.name}
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              Enter your payment details to complete your subscription.
            </p>
            <Elements stripe={stripePromise}>
              <StripePaymentForm
                priceId={tiers[selectedTier]?.priceId || ''}
                onSuccess={() => {
                  setShowPaymentForm(false);
                  loadSubscription();
                }}
                onCancel={() => setShowPaymentForm(false)}
              />
            </Elements>
          </div>
        </div>
      )}

      {/* Pricing Tiers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Object.entries(tiers).map(([key, tier]) => (
          <div
            key={key}
            className={`bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col ${
              currentSubscription?.tier === key
                ? 'ring-2 ring-primary-500 bg-primary-50'
                : ''
            }`}
          >
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-slate-900">{tier.name}</h3>
              <p className="text-sm text-slate-600 mt-1">{tier.description}</p>
              
              {tier.price && (
                <div className="mt-4">
                  <span className="text-3xl font-bold text-slate-900">£{tier.price}</span>
                  <span className="text-slate-600">/month</span>
                </div>
              )}

              <ul className="mt-6 space-y-3">
                <li className="flex items-center text-sm text-slate-700">
                  <CheckIcon className="h-4 w-4 text-green-500 mr-2" />
                  {typeof tier.maxUsers === 'number' ? tier.maxUsers : tier.maxUsers} users
                </li>
                <li className="flex items-center text-sm text-slate-700">
                  <CheckIcon className="h-4 w-4 text-green-500 mr-2" />
                  {typeof tier.maxClients === 'number' ? tier.maxClients : tier.maxClients} clients
                </li>
                <li className="flex items-center text-sm text-slate-700">
                  <CheckIcon className="h-4 w-4 text-green-500 mr-2" />
                  {typeof tier.maxProposals === 'number' ? tier.maxProposals : tier.maxProposals} proposals
                </li>
                {tier.features.map((feature, index) => (
                  <li key={index} className="flex items-center text-sm text-slate-700">
                    <CheckIcon className="h-4 w-4 text-green-500 mr-2" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6">
              {currentSubscription?.tier === key ? (
                <button
                  disabled
                  className="w-full btn-secondary cursor-default"
                >
                  Current Plan
                </button>
              ) : (
                <button
                  onClick={() => handleSubscribe(key)}
                  className="w-full btn-primary"
                  disabled={!stripePromise}
                >
                  <CreditCardIcon className="h-4 w-4 mr-2 inline" />
                  {currentSubscription?.hasSubscription ? 'Switch Plan' : 'Subscribe'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Payment Methods */}
      {currentSubscription?.hasSubscription && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Payment Methods</h2>
          <div className="flex items-center space-x-4">
            <CreditCardIcon className="h-8 w-8 text-slate-400" />
            <div>
              <p className="text-sm font-medium text-slate-900">Card on file</p>
              <p className="text-sm text-slate-600">
                To update your payment method, please contact support
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Billing History */}
      {currentSubscription?.hasSubscription && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Billing History</h2>
          <p className="text-sm text-slate-600">
            Your billing history is managed through Stripe. 
            Invoice emails will be sent to your registered email address.
          </p>
        </div>
      )}
    </div>
  );
};

export default Subscription;
