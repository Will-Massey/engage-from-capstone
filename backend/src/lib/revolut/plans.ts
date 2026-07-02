import { SUBSCRIPTION_TIERS } from '../../config/stripe.js';

export type SubscriptionTierKey = 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

export const PLATFORM_PLANS = {
  STARTER: {
    tier: 'STARTER' as const,
    name: SUBSCRIPTION_TIERS.STARTER.name,
    description: 'Engage — Starter monthly platform fee',
    amount: SUBSCRIPTION_TIERS.STARTER.price * 100,
    currency: 'GBP',
    displayPrice: SUBSCRIPTION_TIERS.STARTER.price,
  },
  PROFESSIONAL: {
    tier: 'PROFESSIONAL' as const,
    name: SUBSCRIPTION_TIERS.PROFESSIONAL.name,
    description: 'Engage — Professional monthly platform fee',
    amount: SUBSCRIPTION_TIERS.PROFESSIONAL.price * 100,
    currency: 'GBP',
    displayPrice: SUBSCRIPTION_TIERS.PROFESSIONAL.price,
  },
  ENTERPRISE: {
    tier: 'ENTERPRISE' as const,
    name: SUBSCRIPTION_TIERS.ENTERPRISE.name,
    description: 'Engage — Enterprise monthly platform fee',
    amount: SUBSCRIPTION_TIERS.ENTERPRISE.price * 100,
    currency: 'GBP',
    displayPrice: SUBSCRIPTION_TIERS.ENTERPRISE.price,
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