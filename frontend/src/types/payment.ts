export interface PaymentFeePreview {
  grossPence: number;
  platformFeePence: number;
  processingFeePence: number;
  netToPracticePence: number;
  platformFeeBps: number;
}

export interface PaymentConfig {
  payoutEnabled: boolean;
  collectPaymentAtSign: boolean;
  paymentRequired: boolean;
  provider: 'stripe' | 'none';
  providerConfigured: boolean;
  methods: {
    card: boolean;
  };
  paymentStatus: string | null;
  paymentMandateId: string | null;
  checkoutUrl: string | null;
  feePreview: PaymentFeePreview | null;
  clientPaymentAuthVersion: string;
}

export type PayoutMethod = 'STRIPE_CONNECT';

export type StripeTransfersStatus = 'active' | 'pending' | 'inactive' | string;

export type PayoutVerificationStatus = 'PENDING' | 'VERIFIED' | string;

export type PayoutTransferStatus =
  | 'PENDING'
  | 'SCHEDULED'
  | 'TRANSFERRED'
  | 'MANUAL'
  | 'FAILED'
  | 'HELD'
  | string;

export interface PayoutSettings {
  enabled: boolean;
  payoutMethod: PayoutMethod | string;
  accountHolderName: string | null;
  stripeConnectedAccountId: string | null;
  stripeTransfersStatus: StripeTransfersStatus;
  verificationStatus: PayoutVerificationStatus;
  verifiedAt: string | null;
  consentVersion: string | null;
  consentAcceptedAt: string | null;
  platformFeeBps: number;
  collectPaymentAtSign: boolean;
}

/** PUT /payout/settings body — aligned with backend Zod schema */
export interface UpdatePayoutSettingsPayload {
  enabled?: boolean;
  consentAccepted?: boolean;
  consentVersion?: string;
  payoutMethod?: PayoutMethod;
  accountHolderName?: string;
  collectPaymentAtSign?: boolean;
}

export interface StripeOnboardResult {
  url: string;
}

export interface PayoutLedgerEntry {
  id: string;
  reference: string;
  title: string;
  grossPence: number;
  platformFeePence: number;
  processingFeePence: number;
  netPayoutPence: number;
  payoutStatus: PayoutTransferStatus;
  paidAt: string;
  payoutTransferId: string | null;
}

export interface PayoutAgreements {
  paymentCollectionTermsVersion: string;
}

/** Platform subscription / Stripe billing — aligned with backend routes/payments.ts and routes/billing.ts */

export type SubscriptionBillingInterval = 'monthly' | 'annual';

export type PaymentProvider = 'stripe' | null;

export interface SubscriptionTier {
  name: string;
  description: string;
  price: number;
  billingInterval?: SubscriptionBillingInterval;
  annualTotal?: number;
  priceId?: string;
  maxUsers: number | string;
  maxClients: number | string;
  maxProposals: number | string;
  features: string[];
}

export type SubscriptionTiersMap = Record<string, SubscriptionTier>;

/** GET /api/payments/config */
export interface PaymentsConfigResult {
  isEnabled: boolean;
  provider: PaymentProvider;
  publishableKey: string | null;
  mode: 'sandbox' | 'prod';
  tiers: SubscriptionTiersMap;
}

export interface PlatformPlan {
  tier: string;
  name: string;
  description: string;
  amount: number;
  currency: string;
  displayPrice: number;
  billingInterval: SubscriptionBillingInterval;
  annualTotal?: number;
}

/** GET /api/billing/config */
export interface BillingConfigResult {
  provider: 'stripe' | null;
  mode: null;
  billingEnabled: boolean;
  publishableKey: string | null;
  tiers: SubscriptionTiersMap;
  plans: PlatformPlan[];
}

export interface BillingCheckoutPayload {
  tier: string;
}

/** Legacy Revolut one-time checkout — route now returns 410; shape retained for API seam */
export interface BillingCheckoutResult {
  token?: string;
  mode?: 'sandbox' | 'prod';
}

/** GET /api/billing/subscription */
export interface BillingSubscriptionResult {
  hasSubscription: boolean;
  tier: string | null;
  status: string | null;
  provider: 'stripe' | null;
  lastPaymentDate: string | null;
}

export interface CreateSubscriptionPayload {
  priceId: string;
  paymentMethodId: string;
}

export interface CreateSubscriptionResult {
  subscriptionId: string;
  status: string;
  clientSecret?: string | null;
}

/** GET /api/payments/subscription — trial + Stripe period details */
export interface TenantSubscriptionResult {
  hasSubscription: boolean;
  tier: string | null;
  status: string;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  trialEndsAt: string;
  daysRemaining: number;
  canSendProposals: boolean;
}

export interface CancelSubscriptionResult {
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd?: string;
}

export interface ReactivateSubscriptionResult {
  status: string;
  cancelAtPeriodEnd: false;
}

export interface CreateSetupIntentResult {
  clientSecret: string | null;
}
