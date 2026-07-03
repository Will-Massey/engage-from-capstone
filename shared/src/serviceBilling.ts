import type { BillingFrequency } from './pricingEngine';

export const VALID_BILLING_FREQUENCIES: readonly BillingFrequency[] = [
  'ONE_TIME',
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'ANNUALLY',
] as const;

export interface CatalogServiceBillingFields {
  billingCycle?: string | null;
  defaultFrequency?: string | null;
  priceDisplayMode?: string | null;
  frequencyOptions?: string | string[] | null;
}

function normaliseFrequency(raw: string | null | undefined): BillingFrequency | null {
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (upper === 'ONE_OFF' || upper === 'ONE_TIME') return 'ONE_TIME';
  if (VALID_BILLING_FREQUENCIES.includes(upper as BillingFrequency)) {
    return upper as BillingFrequency;
  }
  return null;
}

function parseFrequencyOptions(raw: string | string[] | null | undefined): BillingFrequency[] {
  if (!raw) return [];
  const values = Array.isArray(raw)
    ? raw
    : String(raw)
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
  return values
    .map((value) => normaliseFrequency(value))
    .filter((value): value is BillingFrequency => value !== null);
}

/**
 * Resolve catalog billing cycle for display and proposal defaults.
 *
 * Legacy migrations stored ONE_TIME services with billingCycle/defaultFrequency = MONTHLY
 * but left priceDisplayMode = ONE_TIME — honour that signal.
 */
export function resolveCatalogBillingCycle(service: CatalogServiceBillingFields): BillingFrequency {
  const billing = normaliseFrequency(service.billingCycle ?? undefined);
  const defaultFreq = normaliseFrequency(service.defaultFrequency ?? undefined);

  if (billing === 'ONE_TIME' || defaultFreq === 'ONE_TIME') {
    return 'ONE_TIME';
  }

  if (service.priceDisplayMode === 'ONE_TIME') {
    return 'ONE_TIME';
  }

  const options = parseFrequencyOptions(service.frequencyOptions);
  if (options.length === 1 && options[0] === 'ONE_TIME') {
    return 'ONE_TIME';
  }

  if (defaultFreq && defaultFreq !== 'MONTHLY') {
    return defaultFreq;
  }

  return billing || 'MONTHLY';
}

export function billingFrequencyToDisplayMode(billingFrequency: BillingFrequency): string {
  switch (billingFrequency) {
    case 'QUARTERLY':
      return 'PER_QUARTER';
    case 'ANNUALLY':
      return 'PER_YEAR';
    case 'ONE_TIME':
      return 'ONE_TIME';
    case 'WEEKLY':
    case 'MONTHLY':
    default:
      return 'PER_MONTH';
  }
}