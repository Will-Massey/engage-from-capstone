export const DECLINE_REASONS = ['PRICE', 'SCOPE', 'TIMING', 'COMPETITOR', 'OTHER'] as const;

export type DeclineReason = (typeof DECLINE_REASONS)[number];

export const DECLINE_REASON_LABELS: Record<DeclineReason, string> = {
  PRICE: 'Price / fees too high',
  SCOPE: 'Services or scope not right',
  TIMING: 'Timing — not ready yet',
  COMPETITOR: 'Chose another provider',
  OTHER: 'Other reason',
};

export function isDeclineReason(value: string): value is DeclineReason {
  return (DECLINE_REASONS as readonly string[]).includes(value);
}
