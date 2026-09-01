export type EngageTierId = 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

export type EngageTier = {
  id: EngageTierId;
  name: string;
  monthly: number;
  annual: number;
  users: number | null;
  clients: number | null;
  proposalsPerMonth: number | null;
};

/** GTM ladder — matches landing copy. Do not race these down to £9/client. */
export const ENGAGE_TIERS: EngageTier[] = [
  {
    id: 'STARTER',
    name: 'Starter',
    monthly: 49,
    annual: 499,
    users: 3,
    clients: 50,
    proposalsPerMonth: 20,
  },
  {
    id: 'PROFESSIONAL',
    name: 'Professional',
    monthly: 99,
    annual: 999,
    users: 10,
    clients: 250,
    proposalsPerMonth: 100,
  },
  {
    id: 'ENTERPRISE',
    name: 'Enterprise',
    monthly: 249,
    annual: 2499,
    users: null,
    clients: null,
    proposalsPerMonth: null,
  },
];

export const FOUNDING_PROFESSIONAL_MONTHLY = 79;
export const DEFAULT_ENGAGER_PER_CLIENT = 9;

export function recommendEngageTier(opts: { clients: number; users: number }): {
  tier: EngageTier;
  reasons: string[];
} {
  const clients = Math.max(0, Math.round(Number(opts.clients) || 0));
  const users = Math.max(1, Math.round(Number(opts.users) || 1));
  const reasons: string[] = [];

  if (clients > 250 || users > 10) {
    if (clients > 250) reasons.push('More than 250 clients — Professional caps the book.');
    if (users > 10) reasons.push('More than 10 users — Professional caps seats.');
    reasons.push('Enterprise is the unlimited-users answer, not a per-client discount.');
    return { tier: ENGAGE_TIERS[2], reasons };
  }

  if (clients > 50 || users > 3) {
    if (clients > 50) reasons.push('More than 50 clients — Starter is too small.');
    if (users > 3) reasons.push('More than 3 users — Starter only includes three seats.');
    reasons.push('Professional is the default growing-practice pack. Clara lives here.');
    return { tier: ENGAGE_TIERS[1], reasons };
  }

  reasons.push('Fits Starter: up to 50 clients and 3 users.');
  reasons.push('Do not quote a per-client fee — the pack is the practice, not the book size.');
  return { tier: ENGAGE_TIERS[0], reasons };
}

export function engagePerClientEquivalent(monthly: number, clients: number): number | null {
  if (clients <= 0 || monthly <= 0) return null;
  return Math.round((monthly / clients) * 100) / 100;
}

export type PackagingComparison = {
  recommended: EngageTier;
  reasons: string[];
  engagerMonthly: number;
  engageMonthly: number;
  engagePerClient: number | null;
  engagerPerClient: number;
  stickerDelta: number;
  engageCheaperOnSticker: boolean;
};

export function comparePackaging(opts: {
  clients: number;
  users: number;
  engagerPerClient?: number;
}): PackagingComparison {
  const clients = Math.max(0, Math.round(Number(opts.clients) || 0));
  const engagerPerClient = Math.max(0, Number(opts.engagerPerClient) || DEFAULT_ENGAGER_PER_CLIENT);
  const { tier, reasons } = recommendEngageTier(opts);
  const engagerMonthly = clients * engagerPerClient;
  const engageMonthly = tier.monthly;
  return {
    recommended: tier,
    reasons,
    engagerMonthly,
    engageMonthly,
    engagePerClient: engagePerClientEquivalent(engageMonthly, clients),
    engagerPerClient,
    stickerDelta: engagerMonthly - engageMonthly,
    engageCheaperOnSticker: engagerMonthly > engageMonthly,
  };
}

export function formatPackagingPitch(opts: {
  clients: number;
  users: number;
  comparison: PackagingComparison;
}): string {
  const { comparison } = opts;
  const perClient =
    comparison.engagePerClient == null
      ? 'n/a (enter a client count)'
      : `£${comparison.engagePerClient.toFixed(2)}/client equivalent`;
  const sticker = comparison.engageCheaperOnSticker
    ? `Engage is ${formatDelta(comparison.stickerDelta)}/mo less on sticker than a £${comparison.engagerPerClient}/client book.`
    : `Sticker is not the close. A £${comparison.engagerPerClient}/client line looks cheap; it does not win, sign, or collect.`;

  return `Engage value pack (${opts.clients} clients · ${opts.users} users)
Recommended: ${comparison.recommended.name} at £${comparison.recommended.monthly}/mo (${perClient}).
Engager-class: £${comparison.engagerMonthly}/mo at £${comparison.engagerPerClient}/client.
${sticker}
We do not race to £8/client. The pack is the money loop + Clara + unlimited-feeling users inside the tier — not a cheaper practice-management seat.
(Not a quote — Founding Practice Professional is £${FOUNDING_PROFESSIONAL_MONTHLY}/mo for 12 months, first 20 firms.)`;
}

function formatDelta(n: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(Math.abs(n));
}
