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

export interface PayoutSettings {
  enabled: boolean;
  allowRevolutPay: boolean;
  allowCard: boolean;
  payoutMethod: string;
  accountHolderName: string | null;
  bankDetailsLast4: string | null;
  revolutCounterpartyId: string | null;
  verificationStatus: string;
  verifiedAt: string | null;
  consentVersion: string | null;
  consentAcceptedAt: string | null;
  platformFeeBps: number;
  collectPaymentAtSign: boolean;
}
