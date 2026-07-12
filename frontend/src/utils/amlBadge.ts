/**
 * Shared AML status badge styling — used by the client AML panel and the
 * proposal detail header when the AML send gate is enabled.
 */

export const AML_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Not started',
  PENDING: 'Pending',
  CLEAR: 'Clear',
  REFER: 'Refer',
  FAILED: 'Failed',
};

export const AML_STATUS_COLOURS: Record<string, string> = {
  NOT_STARTED: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200',
  CLEAR: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200',
  REFER: 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-200',
  FAILED: 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200',
};

export function amlStatusLabel(status: string): string {
  return AML_STATUS_LABELS[status] ?? status;
}

export function amlStatusColour(status: string): string {
  return AML_STATUS_COLOURS[status] ?? AML_STATUS_COLOURS.NOT_STARTED;
}

/** "£1.50" for 150 pence; null when no per-check price is configured. */
export function formatAmlCheckPrice(pence: number | null | undefined): string | null {
  if (typeof pence !== 'number' || !Number.isFinite(pence) || pence <= 0) return null;
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}
