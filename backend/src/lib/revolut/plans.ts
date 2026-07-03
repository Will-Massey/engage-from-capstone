import { SUBSCRIPTION_TIERS } from '../../config/stripe.js';

export type SubscriptionTierKey =
  | 'STARTER'
  | 'PROFESSIONAL'
  | 'ENTERPRISE'
  | 'STARTER_ANNUAL'
  | 'PROFESSIONAL_ANNUAL'
  | 'ENTERPRISE_ANNUAL';

export type BillingInterval = 'monthly' | 'annual';

export const PLATFORM_PLANS = {
  STARTER: {
    tier: 'STARTER' as const,
    name: SUBSCRIPTION_TIERS.STARTER.name,
    description: 'Engage — Starter monthly platform fee',
    amount: SUBSCRIPTION_TIERS.STARTER.price * 100,
    currency: 'GBP',
    displayPrice: SUBSCRIPTION_TIERS.STARTER.price,
    billingInterval: 'monthly' as BillingInterval,
  },
  STARTER_ANNUAL: {
    tier: 'STARTER_ANNUAL' as const,
    name: SUBSCRIPTION_TIERS.STARTER_ANNUAL.name,
    description: 'Engage — Starter annual platform fee (−15%)',
    amount: Math.round(SUBSCRIPTION_TIERS.STARTER_ANNUAL.annualTotal! * 100),
    currency: 'GBP',
    displayPrice: SUBSCRIPTION_TIERS.STARTER_ANNUAL.price,
    annualTotal: SUBSCRIPTION_TIERS.STARTER_ANNUAL.annualTotal,
    billingInterval: 'annual' as BillingInterval,
  },
  PROFESSIONAL: {
    tier: 'PROFESSIONAL' as const,
    name: SUBSCRIPTION_TIERS.PROFESSIONAL.name,
    description: 'Engage — Professional monthly platform fee',
    amount: SUBSCRIPTION_TIERS.PROFESSIONAL.price * 100,
    currency: 'GBP',
    displayPrice: SUBSCRIPTION_TIERS.PROFESSIONAL.price,
    billingInterval: 'monthly' as BillingInterval,
  },
  PROFESSIONAL_ANNUAL: {
    tier: 'PROFESSIONAL_ANNUAL' as const,
    name: SUBSCRIPTION_TIERS.PROFESSIONAL_ANNUAL.name,
    description: 'Engage — Professional annual platform fee (−15%)',
    amount: Math.round(SUBSCRIPTION_TIERS.PROFESSIONAL_ANNUAL.annualTotal! * 100),
    currency: 'GBP',
    displayPrice: SUBSCRIPTION_TIERS.PROFESSIONAL_ANNUAL.price,
    annualTotal: SUBSCRIPTION_TIERS.PROFESSIONAL_ANNUAL.annualTotal,
    billingInterval: 'annual' as BillingInterval,
  },
  ENTERPRISE: {
    tier: 'ENTERPRISE' as const,
    name: SUBSCRIPTION_TIERS.ENTERPRISE.name,
    description: 'Engage — Enterprise monthly platform fee',
    amount: SUBSCRIPTION_TIERS.ENTERPRISE.price * 100,
    currency: 'GBP',
    displayPrice: SUBSCRIPTION_TIERS.ENTERPRISE.price,
    billingInterval: 'monthly' as BillingInterval,
  },
  ENTERPRISE_ANNUAL: {
    tier: 'ENTERPRISE_ANNUAL' as const,
    name: SUBSCRIPTION_TIERS.ENTERPRISE_ANNUAL.name,
    description: 'Engage — Enterprise annual platform fee (−15%)',
    amount: Math.round(SUBSCRIPTION_TIERS.ENTERPRISE_ANNUAL.annualTotal! * 100),
    currency: 'GBP',
    displayPrice: SUBSCRIPTION_TIERS.ENTERPRISE_ANNUAL.price,
    annualTotal: SUBSCRIPTION_TIERS.ENTERPRISE_ANNUAL.annualTotal,
    billingInterval: 'annual' as BillingInterval,
  },
} as const;

export function isRevolutBillingEnabled(): boolean {
  return Boolean(process.env.REVOLUT_API_SECRET_KEY && process.env.REVOLUT_WEBHOOK_SECRET);
}

/** Platform fee on client proposal payments — basis points (250 = 2.5%). */
export function getPlatformFeeBps(): number {
  const raw = Number(process.env.ENGAGE_PLATFORM_FEE_BPS ?? 250);
  if (!Number.isFinite(raw) || raw < 0 || raw > 5000) return 250;
  return Math.round(raw);
}