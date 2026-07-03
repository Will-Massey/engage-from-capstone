export const TRIAL_DAYS = 7;

export function trialEndsAtFromNow(now = new Date()): Date {
  const ends = new Date(now);
  ends.setDate(ends.getDate() + TRIAL_DAYS);
  return ends;
}