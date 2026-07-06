/**
 * Tenant-level payment collection settings (stored in Tenant.settings JSON).
 */
export interface PaymentSettings {
  /** Offer Direct Debit / card setup immediately after the client signs */
  collectPaymentAtSign: boolean;
  /** Payment methods offered at sign */
  allowDirectDebit: boolean;
  allowCard: boolean;
}

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  collectPaymentAtSign: false,
  allowDirectDebit: true,
  allowCard: true,
};

export function getPaymentSettings(tenantSettingsJson?: string | null): PaymentSettings {
  try {
    const parsed = JSON.parse(tenantSettingsJson || '{}');
    const p = parsed.payments || {};
    return {
      collectPaymentAtSign: p.collectPaymentAtSign === true,
      allowDirectDebit: p.allowDirectDebit !== false,
      allowCard: p.allowCard !== false,
    };
  } catch {
    return DEFAULT_PAYMENT_SETTINGS;
  }
}
