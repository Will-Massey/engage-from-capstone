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
