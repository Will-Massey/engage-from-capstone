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

export function getProcessorMarkupBps(): number {
  const raw = Number(process.env.ENGAGE_PROCESSOR_MARKUP_BPS ?? 50);
  if (!Number.isFinite(raw) || raw < 0 || raw > 500) return 50;
  return Math.round(raw);
}

export function getProcessorMarkupFixedPence(): number {
  const raw = Number(process.env.ENGAGE_PROCESSOR_MARKUP_FIXED_PENCE ?? 0);
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.round(raw);
}

/** Estimated processor cost to Engage (pass-through), not client-facing label */
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
    STARTER: 250,
    PROFESSIONAL: 250,
    ENTERPRISE: 100,
    STARTER_ANNUAL: 250,
    PROFESSIONAL_ANNUAL: 250,
    ENTERPRISE_ANNUAL: 100,
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

/** Public fee preview for client checkout UI */
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
