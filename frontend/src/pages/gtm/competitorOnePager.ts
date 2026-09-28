import { ENGAGE_TIERS } from './packagingValue';

export const ONE_PAGER_HEADLINE = 'Engager runs the job. Engage wins it, signs it, and collects.';

export const ONE_PAGER_PROBLEM =
  'TaxCalc Engager is a strong practice board. Cash and AI sit in partner add-ons, and the story still points you at TaxCalc. Engage is the money loop plus Clara — independent of that stack.';

export const ONE_PAGER_LOOP = ['Win', 'Sign', 'Collect', 'Deliver', 'Renew'] as const;

export const ONE_PAGER_DIFFERENTIATORS = [
  {
    title: 'Collect at sign',
    line: 'UK cards via Stripe. The practice pays Stripe (about 1.5% + 20p) plus a 0.25% platform fee. BACS Direct Debit is coming soon — we do not pretend a bank-debit rail is live.',
  },
  {
    title: 'Clara drafts, never sends',
    line: 'Cover letters, chases, and partner-quality email stay in your queue until a human hits send.',
  },
  {
    title: 'Independent of TaxCalc',
    line: 'Companies House native. Xero and QuickBooks when you connect them. TaxCalc is not an Engage integration.',
  },
] as const;

export const ONE_PAGER_ROWS: Array<{
  capability: string;
  engager: string;
  engage: string;
}> = [
  { capability: 'Jobs board and portal', engager: 'Yes', engage: 'Yes' },
  {
    capability: 'Proposal → e-sign → collect',
    engager: 'Partner add-ons',
    engage: 'In product (UK cards)',
  },
  { capability: 'Practice AI', engager: 'Chase / records', engage: 'Clara drafts only' },
  { capability: 'TaxCalc required', engager: 'Distribution story', engage: 'No' },
  {
    capability: 'Trust claims',
    engager: 'Vendor pack',
    engage: 'No CE cert · not UK-only hosting',
  },
];

export const ONE_PAGER_CTA = 'https://capstonesoftware.co.uk/engage';

export function formatEngageLadder(): string {
  return ENGAGE_TIERS.map((tier) => `£${tier.monthly} ${tier.name}`).join(' · ');
}

/** Plain-text leave-behind for email or paste into a partner note. */
export function formatCompetitorOnePager(): string {
  const diffs = ONE_PAGER_DIFFERENTIATORS.map((d) => `• ${d.title} — ${d.line}`).join('\n');
  const rows = ONE_PAGER_ROWS.map(
    (r) => `• ${r.capability}: Engager ${r.engager} · Engage ${r.engage}`
  ).join('\n');
  return `${ONE_PAGER_HEADLINE}

${ONE_PAGER_PROBLEM}

Money loop: ${ONE_PAGER_LOOP.join(' → ')}.

Why Engage
${diffs}

Side by side
${rows}

Pack: ${formatEngageLadder()} / month. Do not race to £9/client.

Next: ${ONE_PAGER_CTA} — 12-minute walkthrough on the battle card (Partner kit).
Illustrative only — not a quote. Clara never sends. We do not claim Cyber Essentials certified or UK-only hosting.`;
}
