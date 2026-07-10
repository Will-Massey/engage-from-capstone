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
