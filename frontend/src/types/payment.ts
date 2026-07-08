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
  provider: 'revolut' | 'none';
  providerConfigured: boolean;
  methods: {
    revolutPay: boolean;
    card: boolean;
  };
  paymentStatus: string | null;
  paymentMandateId: string | null;
  checkoutUrl: string | null;
  feePreview: PaymentFeePreview | null;
  clientPaymentAuthVersion: string;
}

export type PayoutMethod = 'UK_BANK_TRANSFER' | 'REVOLUT_COUNTERPARTY';

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
  allowRevolutPay: boolean;
  allowCard: boolean;
  payoutMethod: PayoutMethod | string;
  accountHolderName: string | null;
  bankDetailsLast4: string | null;
  revolutCounterpartyId: string | null;
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
  allowRevolutPay?: boolean;
  allowCard?: boolean;
  payoutMethod?: PayoutMethod;
  accountHolderName?: string;
  sortCode?: string;
  accountNumber?: string;
  revolutCounterpartyId?: string;
  collectPaymentAtSign?: boolean;
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

export type PaymentProvider = 'revolut' | 'stripe' | null;

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
  revolutPublicKey: string | null;
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
  provider: 'revolut' | 'stripe' | null;
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
