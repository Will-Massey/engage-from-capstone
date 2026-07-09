/** Default platform fee in basis points when no tier/override applies. */
export function getPlatformFeeBps(): number {
  const raw = Number(process.env.ENGAGE_PLATFORM_FEE_BPS ?? 250);
  if (!Number.isFinite(raw) || raw < 0 || raw > 10000) return 250;
  return Math.round(raw);
}

/** Estimated Stripe processing cost to Engage (pence). UK standard card ~1.5% + 20p. */
export function estimateStripeProcessorCost(grossPence: number): number {
  const bps = Number(process.env.ENGAGE_STRIPE_PROCESSOR_BPS ?? 150);
  const fixed = Number(process.env.ENGAGE_STRIPE_PROCESSOR_FIXED_PENCE ?? 20);
  const safeBps = Number.isFinite(bps) && bps >= 0 ? bps : 150;
  const safeFixed = Number.isFinite(fixed) && fixed >= 0 ? fixed : 20;
  return Math.round((grossPence * safeBps) / 10000) + safeFixed;
}
