/** Session storage for pricing calculator → proposal builder handoff (Phase W2.9). */

import type {
  PricingComplexityFlags,
  PricingMethodologyTotals,
  PricingSuggestFeesPayload,
  PricingSuggestionPayload,
  SuggestedServiceFee,
} from '../types/pricing';

export const PRICING_SUGGESTION_KEY = 'engage-pricing-suggestion';

export type {
  PricingComplexityFlags,
  PricingMethodologyTotals,
  PricingSuggestFeesPayload,
  PricingSuggestionPayload,
  SuggestedServiceFee,
};

/** @deprecated Use PricingSuggestFeesPayload */
export type PricingCalculatorInputs = PricingSuggestFeesPayload;

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
