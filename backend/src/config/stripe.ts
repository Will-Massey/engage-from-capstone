import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

// Make Stripe optional - app can start without payments configured
export const stripe = STRIPE_SECRET_KEY 
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2025-02-24.acacia' as any,
      typescript: true,
    })
  : null;

// Price IDs for different plans
export const STRIPE_PRICE_IDS = {
  STARTER: process.env.STRIPE_STARTER_PRICE_ID || 'price_starter',
  PROFESSIONAL: process.env.STRIPE_PROFESSIONAL_PRICE_ID || 'price_professional',
  ENTERPRISE: process.env.STRIPE_ENTERPRISE_PRICE_ID || 'price_enterprise',
};

// Subscription tiers configuration with prices
export const SUBSCRIPTION_TIERS = {
  STARTER: {
    name: 'Starter',
    description: 'Perfect for small practices',
    price: 49,
    priceId: STRIPE_PRICE_IDS.STARTER,
    maxUsers: 3,
    maxClients: 50,
    maxProposals: 100,
    features: ['Basic proposals', 'Client management', 'Email integration', 'MTD ITSA tracking'],
  },
  PROFESSIONAL: {
    name: 'Professional',
    description: 'For growing practices',
    price: 99,
    priceId: STRIPE_PRICE_IDS.PROFESSIONAL,
    maxUsers: 10,
    maxClients: 500,
    maxProposals: 'Unlimited',
    features: ['Everything in Starter', 'Custom branding', 'Advanced analytics', 'Priority support', 'API access'],
  },
  ENTERPRISE: {
    name: 'Enterprise',
    description: 'For large firms',
    price: 249,
    priceId: STRIPE_PRICE_IDS.ENTERPRISE,
    maxUsers: 'Unlimited',
    maxClients: 'Unlimited',
    maxProposals: 'Unlimited',
    features: ['Everything in Professional', 'White-label options', 'Dedicated support', 'Custom integrations', 'SLA guarantee'],
  },
};

export default stripe;
