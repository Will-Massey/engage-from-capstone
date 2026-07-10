/**
 * R1 — split proposal services into one-off vs recurring, and map UK billing
 * cycles to Stripe recurring intervals. A Stripe subscription bills on a single
 * interval, so recurring lines are grouped by interval; the caller creates one
 * subscription per interval group.
 */

export interface ServiceLine {
  name: string;
  displayPrice: number; // GBP, price as shown (per the billing cycle)
  billingFrequency: string; // BillingCycle
  quantity?: number;
}

export interface StripeInterval {
  interval: 'day' | 'week' | 'month' | 'year';
  interval_count: number;
}

export interface RecurringGroup {
  key: string; // e.g. "month:1", "month:3"
  interval: StripeInterval;
  lines: { name: string; unitAmountPence: number; quantity: number }[];
}

export interface SplitResult {
  oneOffPence: number;
  recurringGroups: RecurringGroup[];
}

/** UK billing cycle → Stripe recurring interval, or null if not recurring. */
export function stripeIntervalFor(cycle: string): StripeInterval | null {
  switch (cycle) {
    case 'WEEKLY':
      return { interval: 'week', interval_count: 1 };
    case 'MONTHLY':
      return { interval: 'month', interval_count: 1 };
    case 'QUARTERLY':
      return { interval: 'month', interval_count: 3 };
    case 'ANNUALLY':
      return { interval: 'year', interval_count: 1 };
    // FIXED_DATE and ONE_TIME are treated as one-off.
    default:
      return null;
  }
}

function toPence(gbp: number): number {
  return Math.round(gbp * 100);
}

/** Split services into a one-off total (pence) and recurring groups by interval. */
export function splitRecurring(services: ServiceLine[]): SplitResult {
  let oneOffPence = 0;
  const groups = new Map<string, RecurringGroup>();

  for (const svc of services) {
    const qty = svc.quantity && svc.quantity > 0 ? svc.quantity : 1;
    const interval = stripeIntervalFor(svc.billingFrequency);
    if (!interval) {
      oneOffPence += toPence(svc.displayPrice) * qty;
      continue;
    }
    const key = `${interval.interval}:${interval.interval_count}`;
    const group = groups.get(key) ?? { key, interval, lines: [] };
    group.lines.push({ name: svc.name, unitAmountPence: toPence(svc.displayPrice), quantity: qty });
    groups.set(key, group);
  }

  return { oneOffPence, recurringGroups: [...groups.values()] };
}

/** Convenience: does this proposal have any recurring lines? */
export function hasRecurringLines(services: ServiceLine[]): boolean {
  return services.some((s) => stripeIntervalFor(s.billingFrequency) !== null);
}

export interface RecurringPlan {
  group: RecurringGroup;
  oneOffLines: { name: string; unitAmountPence: number; quantity: number }[];
}

/**
 * Decide whether a proposal's service lines can be collected as a single
 * subscription-mode checkout. v1 requires all recurring lines to share one
 * interval, and the gross line sum to equal the stored proposal total (a
 * mismatch means a proposal-level discount or drift — in that case the caller
 * falls back to the one-off checkout so the client is charged exactly the
 * displayed total). Line amounts are VAT-inclusive (grossTotal, quantity
 * already folded in).
 */
export function planRecurringCheckout(
  services: {
    name: string;
    billingFrequency: string;
    grossTotal: number;
    /** Stored Int-pence mirror — authoritative when present (Stage 1). */
    grossTotalPence?: number | null;
  }[],
  proposalTotalGbp: number,
  /** Stored Int-pence header total — authoritative when present (Stage 1). */
  proposalTotalPence?: number | null
): RecurringPlan | null {
  // Prefer the stored pence mirrors: legacy Float rows can carry dust that
  // Math.round(x * 100) may resolve differently from what was displayed.
  const lines: ServiceLine[] = services.map((s) => ({
    name: s.name,
    displayPrice: (s.grossTotalPence ?? Math.round(s.grossTotal * 100)) / 100,
    billingFrequency: s.billingFrequency,
    quantity: 1,
  }));
  if (!hasRecurringLines(lines)) return null;

  const split = splitRecurring(lines);
  if (split.recurringGroups.length !== 1) return null; // mixed intervals — v1 falls back

  const group = split.recurringGroups[0];
  const sumPence =
    split.oneOffPence + group.lines.reduce((acc, l) => acc + l.unitAmountPence * l.quantity, 0);
  const targetPence = proposalTotalPence ?? Math.round(proposalTotalGbp * 100);
  if (sumPence !== targetPence) return null;

  const oneOffLines = lines
    .filter((l) => stripeIntervalFor(l.billingFrequency) === null)
    .map((l) => ({ name: l.name, unitAmountPence: Math.round(l.displayPrice * 100), quantity: 1 }));

  return { group, oneOffLines };
}
