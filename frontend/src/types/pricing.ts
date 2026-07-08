/** Pricing methodology and AI pricing-advisor API types — aligned with backend schemas. */

export type PricingTurnoverBand =
  | 'UNDER_50K'
  | 'BAND_50K_100K'
  | 'BAND_100K_250K'
  | 'BAND_250K_500K'
  | 'BAND_500K_1M'
  | 'OVER_1M';

export type PricingEntityType = 'LIMITED_COMPANY' | 'SOLE_TRADER' | 'LLP' | 'PARTNERSHIP';

export type PricingMtdStatus =
  | 'NOT_APPLICABLE'
  | 'NOT_REGISTERED'
  | 'REGISTERED'
  | 'FULLY_COMPLIANT';

export interface PricingComplexityFlags {
  hasPayroll: boolean;
  hasRd: boolean;
  multiSite: boolean;
}

export interface PricingSuggestFeesPayload {
  turnoverBand: PricingTurnoverBand | string;
  entityType: PricingEntityType | string;
  employeeCount: number;
  vatRegistered: boolean;
  mtdStatus: PricingMtdStatus | string;
  complexity: PricingComplexityFlags;
}

export interface AppliedMultiplier {
  name: string;
  value: number;
  description: string;
}

export interface SuggestedServiceFee {
  catalogName: string;
  category: string;
  subcategory?: string;
  description: string;
  billingCycle: string;
  baselinePrice?: number;
  suggestedPrice: number;
  feeLow: number;
  feeHigh: number;
  annualEquivalent: number;
  multipliers?: AppliedMultiplier[];
  rationale?: string;
  serviceTemplateId?: string;
}

export interface CategoryFeeSummary {
  category: string;
  label: string;
  serviceCount?: number;
  monthlyLow: number;
  monthlyHigh: number;
  monthlySuggested: number;
  annualSuggested: number;
}

export interface PricingMethodologyTotals {
  monthlyLow: number;
  monthlyHigh: number;
  monthlySuggested: number;
  annualSuggested: number;
  currency: 'GBP' | string;
}

export interface PricingMethodologyResult {
  inputs: PricingSuggestFeesPayload;
  services: SuggestedServiceFee[];
  byCategory: CategoryFeeSummary[];
  totals: PricingMethodologyTotals;
  formulaNotes: string[];
}

export interface PricingExplainTotals {
  monthlySuggested: number;
  annualSuggested: number;
}

export interface PricingExplainPayload {
  suggestion: {
    inputs: PricingSuggestFeesPayload;
    services: SuggestedServiceFee[];
    totals: PricingExplainTotals | PricingMethodologyTotals;
  };
}

export interface PricingExplainResult {
  explanation: string;
  tokensUsed: string;
}

export interface ContingentFeePayload {
  estimatedSavingGbp: number;
  percentOfSaving: number;
  capGbp?: number;
  floorGbp?: number;
}

export interface ContingentFeeResult {
  feeGbp: number;
  explanation: string;
}

/** Client turnover band used by pricing-advisor (distinct from methodology bands). */
export type AdvisorTurnoverBand = 'UNKNOWN' | 'MICRO' | 'SMALL' | 'MEDIUM' | 'LARGE';

export interface PricingAdvisorLineItem {
  serviceId: string;
  name?: string;
  displayPrice: number;
}

export interface PricingAdvisorPayload {
  clientId: string;
  lineItems: PricingAdvisorLineItem[];
}

export interface PricingAdvisorFlag {
  serviceId: string;
  serviceName: string;
  quotedPrice: number;
  floorPrice: number;
  turnoverBand: AdvisorTurnoverBand;
  message: string;
}

export interface PricingAdvisorResult {
  clientId: string;
  turnoverBand: AdvisorTurnoverBand;
  flags: PricingAdvisorFlag[];
  summary: string;
}

/** Session handoff payload for pricing calculator → proposal builder. */
export interface PricingSuggestionPayload {
  inputs: PricingSuggestFeesPayload;
  services: SuggestedServiceFee[];
  totals: PricingMethodologyTotals;
  savedAt: string;
}
