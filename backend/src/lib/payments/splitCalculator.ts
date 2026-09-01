import { getPlatformFeeBps, estimateStripeProcessorCost } from './feeConfig.js';

export interface SplitInput {
  grossPence: number;
  platformFeeBps?: number;
  processorFeePence?: number;
  processorMarkupPence?: number;
}

export interface SplitResult {
  grossPence: number;
  platformFeePence: number;
  processorFeePence: number;
  processorMarkupPence: number;
  agencySharePence: number;
  platformFeeBps: number;
  engageRevenuePence: number;
}

/** Extra percent on top of Stripe pass-through. Default 0. */
export function getProcessorMarkupBps(): number {
  const raw = Number(process.env.ENGAGE_PROCESSOR_MARKUP_BPS ?? 0);
  if (!Number.isFinite(raw) || raw < 0 || raw > 500) return 0;
  return Math.round(raw);
}

/** Extra fixed pence on top of Stripe pass-through. Default 0 (the 20p is in the Stripe estimate). */
export function getProcessorMarkupFixedPence(): number {
  const raw = Number(process.env.ENGAGE_PROCESSOR_MARKUP_FIXED_PENCE ?? 0);
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.round(raw);
}

/** Estimated processor cost to Engage (pass-through). */
export function estimateProcessorCost(provider: 'STRIPE', grossPence: number): number {
  return estimateStripeProcessorCost(grossPence);
}

export function estimateProcessorMarkup(grossPence: number): number {
  return (
    Math.round((grossPence * getProcessorMarkupBps()) / 10000) + getProcessorMarkupFixedPence()
  );
}

export function resolvePlatformFeeBps(tier?: string | null, override?: number | null): number {
  if (override != null && Number.isFinite(override)) return Math.round(override);
  const tierDefaults: Record<string, number> = {
    STARTER: 25,
    PROFESSIONAL: 25,
    ENTERPRISE: 25,
    STARTER_ANNUAL: 25,
    PROFESSIONAL_ANNUAL: 25,
    ENTERPRISE_ANNUAL: 25,
  };
  if (tier && tierDefaults[tier] != null) return tierDefaults[tier];
  return getPlatformFeeBps();
}

export function calculateSplit(input: SplitInput): SplitResult {
  const platformFeeBps = input.platformFeeBps ?? getPlatformFeeBps();
  const platformFeePence = Math.round((input.grossPence * platformFeeBps) / 10000);
  const processorFeePence = input.processorFeePence ?? 0;
  const processorMarkupPence = input.processorMarkupPence ?? 0;
  const agencySharePence =
    input.grossPence - platformFeePence - processorFeePence - processorMarkupPence;

  if (agencySharePence < 0) {
    throw new Error('Net payout would be negative — check fee configuration');
  }

  return {
    grossPence: input.grossPence,
    platformFeePence,
    processorFeePence,
    processorMarkupPence,
    agencySharePence,
    platformFeeBps,
    engageRevenuePence: platformFeePence + processorMarkupPence,
  };
}

/** What we take on the destination charge — Stripe cost plus our margin. Never below Stripe. */
export function applicationFeePence(split: SplitResult): number {
  const fee = split.platformFeePence + split.processorFeePence + split.processorMarkupPence;
  return Math.max(fee, split.processorFeePence);
}

/**
 * Stripe subscription `application_fee_percent` for this invoice size
 * (percent cannot carry a separate 20p, so we bake the full fee into the rate).
 */
export function collectionFeePercent(grossPence: number, platformFeeBps: number): number {
  if (grossPence <= 0) return Math.round((platformFeeBps / 100) * 100) / 100;
  const split = calculateSplit({
    grossPence,
    platformFeeBps,
    processorFeePence: estimateProcessorCost('STRIPE', grossPence),
    processorMarkupPence: estimateProcessorMarkup(grossPence),
  });
  return Math.round((applicationFeePence(split) / grossPence) * 10000) / 100;
}

/**
 * Public fee preview. Practice pays Stripe pass-through plus platform margin.
 */
export function buildFeePreview(grossPence: number, platformFeeBps: number) {
  const processorFeePence = estimateProcessorCost('STRIPE', grossPence);
  const processorMarkupPence = estimateProcessorMarkup(grossPence);
  const split = calculateSplit({
    grossPence,
    platformFeeBps,
    processorFeePence,
    processorMarkupPence,
  });
  return {
    grossPence,
    platformFeePence: split.platformFeePence,
    processingFeePence: processorFeePence + processorMarkupPence,
    netToPracticePence: split.agencySharePence,
    platformFeeBps,
  };
}
