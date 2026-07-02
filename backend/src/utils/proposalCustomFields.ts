/**
 * Proposal customFields helpers — pricing tiers & multi-signer config (no migrations).
 */

export interface PricingTier {
  id: string;
  label: string;
  description?: string;
  /** MVP: multiply base proposal fees (1.0 = 100%, 1.3 = 130%, etc.) */
  feeMultiplier?: number;
  /** Optional: restrict tier to specific proposal service line IDs */
  serviceLineIds?: string[];
}

export type ProposalType = 'full' | 'loe_only';

export interface ProposalCustomFields {
  /** `loe_only` — engagement letter without fee schedule */
  proposalType?: ProposalType;
  offerThreePackages?: boolean;
  pricingTiers?: PricingTier[];
  /** MVP: 1 or 2 signers maximum */
  requiredSigners?: number;
  /** Set when client accepts a tiered package */
  selectedTierId?: string;
  selectedTierLabel?: string;
  /** Tracks partial multi-signer progress */
  signaturesReceived?: number;
}

export function getProposalType(fields: ProposalCustomFields): ProposalType {
  return fields.proposalType === 'loe_only' ? 'loe_only' : 'full';
}

export function isLoeOnlyProposalFields(fields: ProposalCustomFields): boolean {
  return getProposalType(fields) === 'loe_only';
}

export const DEFAULT_PRICING_TIERS: PricingTier[] = [
  {
    id: 'bronze',
    label: 'Bronze',
    description: 'Essential compliance — core filings and statutory obligations',
    feeMultiplier: 0.85,
  },
  {
    id: 'silver',
    label: 'Silver',
    description: 'Standard compliance plus routine advisory support',
    feeMultiplier: 1,
  },
  {
    id: 'gold',
    label: 'Gold',
    description: 'Enhanced compliance with proactive planning and reviews',
    feeMultiplier: 1.3,
  },
  {
    id: 'platinum',
    label: 'Platinum',
    description: 'Full-service partnership with priority access and strategic advice',
    feeMultiplier: 1.6,
  },
];

export function parseProposalCustomFields(
  raw: string | null | undefined
): ProposalCustomFields {
  if (!raw || raw === '{}') return {};
  try {
    const parsed = JSON.parse(raw) as ProposalCustomFields;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function serializeProposalCustomFields(fields: ProposalCustomFields): string {
  return JSON.stringify(fields);
}

export function mergeProposalCustomFields(
  existing: ProposalCustomFields,
  patch: Partial<ProposalCustomFields>
): ProposalCustomFields {
  return { ...existing, ...patch };
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
): { subtotal: number; vatAmount: number; total: number; feeMultiplier: number } {
  const mult = tier.feeMultiplier ?? 1;
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    subtotal: round(base.subtotal * mult),
    vatAmount: round(base.vatAmount * mult),
    total: round(base.total * mult),
    feeMultiplier: mult,
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