/**
 * Billing cadence helpers for proposal line items.
 * Prices are stored per billing period; switching cadence converts via annual equivalent.
 */

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
  { value: 'ONE_TIME', label: 'One-off', short: '1×' },
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
  switch (cadence) {
    case 'WEEKLY':
      return price * 52;
    case 'MONTHLY':
      return price * 12;
    case 'QUARTERLY':
      return price * 4;
    case 'ANNUALLY':
      return price;
    case 'ONE_TIME':
      return 0;
    default:
      return price * 12;
  }
}

/** Convert a per-period price when the billing cadence changes */
export function convertPriceBetweenCadences(
  price: number,
  fromCadence: string,
  toCadence: string
): number {
  if (fromCadence === toCadence) return price;
  if (toCadence === 'ONE_TIME' || fromCadence === 'ONE_TIME') return price;
  const annual = annualValueForCadence(price, fromCadence);
  let converted: number;
  switch (toCadence) {
    case 'WEEKLY':
      converted = annual / 52;
      break;
    case 'MONTHLY':
      converted = annual / 12;
      break;
    case 'QUARTERLY':
      converted = annual / 4;
      break;
    case 'ANNUALLY':
      converted = annual;
      break;
    default:
      converted = price;
  }
  return Math.round(converted * 100) / 100;
}

export function cadencePeriodLabel(cadence: string): string {
  const opt = BILLING_CADENCE_OPTIONS.find((o) => o.value === cadence);
  return opt?.label || 'Monthly';
}
