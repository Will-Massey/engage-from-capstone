/** Session storage for pricing calculator → proposal builder handoff (Phase W2.9). */

export const PRICING_SUGGESTION_KEY = 'engage-pricing-suggestion';

export interface PricingComplexityFlags {
  hasPayroll: boolean;
  hasRd: boolean;
  multiSite: boolean;
}

export interface PricingCalculatorInputs {
  turnoverBand: string;
  entityType: string;
  employeeCount: number;
  vatRegistered: boolean;
  mtdStatus: string;
  complexity: PricingComplexityFlags;
}

export interface SuggestedServiceFee {
  catalogName: string;
  category: string;
  description: string;
  billingCycle: string;
  suggestedPrice: number;
  feeLow: number;
  feeHigh: number;
  annualEquivalent: number;
  serviceTemplateId?: string;
  rationale?: string;
}

export interface PricingSuggestionPayload {
  inputs: PricingCalculatorInputs;
  services: SuggestedServiceFee[];
  totals: {
    monthlyLow: number;
    monthlyHigh: number;
    monthlySuggested: number;
    annualSuggested: number;
    currency: string;
  };
  savedAt: string;
}

export function savePricingSuggestion(payload: Omit<PricingSuggestionPayload, 'savedAt'>): void {
  const data: PricingSuggestionPayload = { ...payload, savedAt: new Date().toISOString() };
  sessionStorage.setItem(PRICING_SUGGESTION_KEY, JSON.stringify(data));
}

export function loadPricingSuggestion(): PricingSuggestionPayload | null {
  try {
    const raw = sessionStorage.getItem(PRICING_SUGGESTION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PricingSuggestionPayload;
  } catch {
    return null;
  }
}

export function clearPricingSuggestion(): void {
  sessionStorage.removeItem(PRICING_SUGGESTION_KEY);
}
