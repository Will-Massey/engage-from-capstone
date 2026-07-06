/**
 * Pricing Engine v2 — backend adapter over @uk-proposal-platform/shared (canonical source).
 */
import { PricingFrequency } from '@prisma/client';
import {
  calculateLineItem,
  calculateProposalTotals,
  formatPricingCurrency,
  getBillingFrequencyLabel,
  getBillingFrequencyShort,
  VALID_BILLING_FREQUENCIES,
  billingFrequencyToDisplayMode,
  type BillingFrequency,
  type FrequencyBandTotals,
  type LineItemResult,
  type PriceDisplayMode,
  type ProposalTotals,
  type ServicePricingInput,
} from '@uk-proposal-platform/shared';

export type {
  BillingFrequency,
  FrequencyBandTotals,
  LineItemResult,
  PriceDisplayMode,
  ProposalTotals,
  ServicePricingInput,
};

export {
  calculateLineItem,
  calculateProposalTotals,
  getBillingFrequencyLabel,
  getBillingFrequencyShort,
  VALID_BILLING_FREQUENCIES,
  billingFrequencyToDisplayMode,
};

export { formatPricingCurrency as formatCurrency };

export type { PricingFrequency };

export default {
  calculateLineItem,
  calculateProposalTotals,
  formatCurrency: formatPricingCurrency,
  getBillingFrequencyLabel,
  getBillingFrequencyShort,
};
