/**
 * Proposal customFields helpers — pricing tiers & multi-signer config (mirrors backend).
 */

export interface PricingTier {
  id: string;
  label: string;
  description?: string;
  feeMultiplier?: number;
  serviceLineIds?: string[];
}

export interface ProposalCustomFields {
  offerThreePackages?: boolean;
  pricingTiers?: PricingTier[];
  requiredSigners?: number;
  selectedTierId?: string;
  selectedTierLabel?: string;
  signaturesReceived?: number;
}

export interface PublicSigningState {
  requiredSigners: number;
  signaturesReceived: number;
  awaitingAdditionalSigner: boolean;
  existingSignatures: Array<{
    signedBy: string;
    signedByRole: string;
    signedAt: string;
  }>;
}

export const DEFAULT_PRICING_TIERS: PricingTier[] = [
  {
    id: 'good',
    label: 'Good',
    description: 'Core compliance — everything you need to stay on track',
    feeMultiplier: 1,
  },
  {
    id: 'better',
    label: 'Better',
    description: 'Compliance plus proactive advisory support',
    feeMultiplier: 1.3,
  },
  {
    id: 'best',
    label: 'Best',
    description: 'Full-service partnership with priority access',
    feeMultiplier: 1.6,
  },
];

export function parseProposalCustomFields(
  raw: string | Record<string, unknown> | null | undefined
): ProposalCustomFields {
  if (!raw) return {};
  if (typeof raw === 'string') {
    if (raw === '{}') return {};
    try {
      return JSON.parse(raw) as ProposalCustomFields;
    } catch {
      return {};
    }
  }
  return raw as ProposalCustomFields;
}

export function hasPricingTiers(fields: ProposalCustomFields): boolean {
  return Boolean(
    fields.offerThreePackages && fields.pricingTiers && fields.pricingTiers.length >= 2
  );
}

export function getRequiredSigners(fields: ProposalCustomFields): number {
  const n = fields.requiredSigners ?? 1;
  return Math.min(2, Math.max(1, n));
}

export function findPricingTier(
  fields: ProposalCustomFields,
  tierId: string | undefined | null
): PricingTier | undefined {
  if (!tierId || !fields.pricingTiers) return undefined;
  return fields.pricingTiers.find((t) => t.id === tierId);
}

export function calculateTierTotals(
  base: { subtotal: number; vatAmount: number; total: number },
  tier: PricingTier
): { subtotal: number; vatAmount: number; total: number } {
  const mult = tier.feeMultiplier ?? 1;
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    subtotal: round(base.subtotal * mult),
    vatAmount: round(base.vatAmount * mult),
    total: round(base.total * mult),
  };
}

export function buildCustomFieldsPayload(input: {
  offerThreePackages: boolean;
  pricingTiers: PricingTier[];
  requireTwoSigners: boolean;
}): ProposalCustomFields {
  return {
    offerThreePackages: input.offerThreePackages,
    pricingTiers: input.offerThreePackages ? input.pricingTiers : undefined,
    requiredSigners: input.requireTwoSigners ? 2 : 1,
  };
}

export function formatTierMultiplier(tier: PricingTier): string {
  const pct = Math.round((tier.feeMultiplier ?? 1) * 100);
  return `${pct}% of base fees`;
}