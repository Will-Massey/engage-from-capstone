import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

// Make Stripe optional - app can start without payments configured
export const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2025-02-24.acacia' as any,
      typescript: true,
    })
  : null;

/** Annual billing discount (15% off monthly equivalent). */
export const ANNUAL_DISCOUNT_RATE = 0.15;

function monthlyToAnnualEquivalent(monthly: number): number {
  return Math.round(monthly * (1 - ANNUAL_DISCOUNT_RATE) * 100) / 100;
}

function annualTotal(monthlyEquivalent: number): number {
  return Math.round(monthlyEquivalent * 12 * 100) / 100;
}

// Price IDs for different plans (monthly + annual)
export const STRIPE_PRICE_IDS = {
  STARTER: process.env.STRIPE_STARTER_PRICE_ID || 'price_starter',
  STARTER_ANNUAL: process.env.STRIPE_STARTER_ANNUAL_PRICE_ID || 'price_starter_annual',
  PROFESSIONAL: process.env.STRIPE_PROFESSIONAL_PRICE_ID || 'price_professional',
  PROFESSIONAL_ANNUAL:
    process.env.STRIPE_PROFESSIONAL_ANNUAL_PRICE_ID || 'price_professional_annual',
  ENTERPRISE: process.env.STRIPE_ENTERPRISE_PRICE_ID || 'price_enterprise',
  ENTERPRISE_ANNUAL: process.env.STRIPE_ENTERPRISE_ANNUAL_PRICE_ID || 'price_enterprise_annual',
};

const STARTER_LIMITS = {
  maxUsers: 3,
  maxClients: 50,
  maxProposals: 100,
  features: ['Basic proposals', 'Client management', 'Email integration', 'MTD ITSA tracking'],
} as const;

const PROFESSIONAL_LIMITS = {
  maxUsers: 10,
  maxClients: 500,
  maxProposals: 'Unlimited' as const,
  features: [
    'Everything in Starter',
    'Custom branding',
    'Advanced analytics',
    'Priority support',
    'API access',
  ],
} as const;

const ENTERPRISE_LIMITS = {
  maxUsers: 'Unlimited' as const,
  maxClients: 'Unlimited' as const,
  maxProposals: 'Unlimited' as const,
  features: [
    'Everything in Professional',
    'White-label options',
    'Dedicated support',
    'Custom integrations',
    'SLA guarantee',
  ],
} as const;

// Subscription tiers configuration with prices
export const SUBSCRIPTION_TIERS = {
  STARTER: {
    name: 'Starter',
    description: 'Perfect for small practices',
    price: 49,
    billingInterval: 'monthly' as const,
    priceId: STRIPE_PRICE_IDS.STARTER,
    ...STARTER_LIMITS,
  },
  STARTER_ANNUAL: {
    name: 'Starter',
    description: 'Perfect for small practices — billed annually (−15%)',
    price: monthlyToAnnualEquivalent(49), // £41.65/mo equivalent
    annualTotal: annualTotal(monthlyToAnnualEquivalent(49)), // £499.80/year
    billingInterval: 'annual' as const,
    priceId: STRIPE_PRICE_IDS.STARTER_ANNUAL,
    ...STARTER_LIMITS,
  },
  PROFESSIONAL: {
    name: 'Professional',
    description: 'For growing practices',
    price: 99,
    billingInterval: 'monthly' as const,
    priceId: STRIPE_PRICE_IDS.PROFESSIONAL,
    ...PROFESSIONAL_LIMITS,
  },
  PROFESSIONAL_ANNUAL: {
    name: 'Professional',
    description: 'For growing practices — billed annually (−15%)',
    price: monthlyToAnnualEquivalent(99), // £84.15/mo equivalent
    annualTotal: annualTotal(monthlyToAnnualEquivalent(99)), // £1,009.80/year
    billingInterval: 'annual' as const,
    priceId: STRIPE_PRICE_IDS.PROFESSIONAL_ANNUAL,
    ...PROFESSIONAL_LIMITS,
  },
  ENTERPRISE: {
    name: 'Enterprise',
    description: 'For large firms',
    price: 249,
    billingInterval: 'monthly' as const,
    priceId: STRIPE_PRICE_IDS.ENTERPRISE,
    ...ENTERPRISE_LIMITS,
  },
  ENTERPRISE_ANNUAL: {
    name: 'Enterprise',
    description: 'For large firms — billed annually (−15%)',
    price: monthlyToAnnualEquivalent(249), // £211.65/mo equivalent
    annualTotal: annualTotal(monthlyToAnnualEquivalent(249)), // £2,539.80/year
    billingInterval: 'annual' as const,
    priceId: STRIPE_PRICE_IDS.ENTERPRISE_ANNUAL,
    ...ENTERPRISE_LIMITS,
  },
};

export default stripe;
