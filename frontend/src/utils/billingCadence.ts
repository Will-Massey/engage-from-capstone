/**
 * Billing cadence helpers for proposal line items.
 * Prices are stored per billing period; switching cadence converts via annual equivalent.
 */

import { annualEquivalentFor, roundMoney } from '@shared/pricingEngine';

export const ALL_BILLING_CADENCES = [
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'ANNUALLY',
  'ONE_TIME',
] as const;

export type BillingCadence = (typeof ALL_BILLING_CADENCES)[number];

export const BILLING_CADENCE_OPTIONS: {
  value: BillingCadence;
  label: string;
  short: string;
}[] = [
  { value: 'WEEKLY', label: 'Weekly', short: 'Wk' },
  { value: 'MONTHLY', label: 'Monthly', short: 'Mo' },
  { value: 'QUARTERLY', label: 'Quarterly', short: 'Qtr' },
  { value: 'ANNUALLY', label: 'Annual', short: 'Yr' },
  { value: 'ONE_TIME', label: 'One-time', short: '1×' },
];

export function parseFrequencyOptions(raw?: string | string[] | null): BillingCadence[] {
  const list = Array.isArray(raw)
    ? raw
    : (raw || 'WEEKLY,MONTHLY,QUARTERLY,ANNUALLY,ONE_TIME')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
  const valid = list.filter((f): f is BillingCadence =>
    ALL_BILLING_CADENCES.includes(f as BillingCadence)
  );
  return valid.length ? valid : ['MONTHLY', 'QUARTERLY', 'ANNUALLY', 'ONE_TIME'];
}

export function annualValueForCadence(price: number, cadence: string): number {
  return annualEquivalentFor(price, cadence);
}

const PERIODS_PER_YEAR: Record<string, number> = {
  WEEKLY: 52,
  MONTHLY: 12,
  QUARTERLY: 4,
  ANNUALLY: 1,
};

/** Convert a per-period price when the billing cadence changes */
export function convertPriceBetweenCadences(
  price: number,
  fromCadence: string,
  toCadence: string
): number {
  if (fromCadence === toCadence) return price;
  if (toCadence === 'ONE_TIME' || fromCadence === 'ONE_TIME') return price;
  const annual = annualEquivalentFor(price, fromCadence);
  const periods = PERIODS_PER_YEAR[toCadence];
  return roundMoney(periods ? annual / periods : price);
}

export function cadencePeriodLabel(cadence: string): string {
  const opt = BILLING_CADENCE_OPTIONS.find((o) => o.value === cadence);
  return opt?.label || 'Monthly';
}
