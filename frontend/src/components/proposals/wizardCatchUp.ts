import {
  monthlyEquivalentFor,
  roundMoney,
  type BillingFrequency,
} from '@shared/pricingEngine';

export type WizardCatchUpDraft = {
  enabled: boolean;
  months: number;
  discountPercent: number;
};

export type WizardCatchUpSource = {
  serviceId: string;
  name: string;
  displayPrice: number;
  billingFrequency: string;
};

export const DEFAULT_WIZARD_CATCH_UP: WizardCatchUpDraft = {
  enabled: false,
  months: 3,
  discountPercent: 0,
};

export function isRecurringWizardFrequency(freq?: string): boolean {
  return Boolean(freq && freq !== 'ONE_TIME');
}

export function clampCatchUpMonths(months: number): number {
  return Math.max(1, Math.min(24, Math.round(Number(months) || 0)));
}

export function clampCatchUpDiscount(percent: number): number {
  return Math.max(0, Math.min(100, Number(percent) || 0));
}

export function catchUpMonthsLabel(months: number): string {
  const n = clampCatchUpMonths(months);
  return `${n} month${n === 1 ? '' : 's'}`;
}

export function previewCatchUpBase(source: WizardCatchUpSource, months: number): number | null {
  if (!isRecurringWizardFrequency(source.billingFrequency)) return null;
  const monthly = monthlyEquivalentFor(
    source.displayPrice,
    source.billingFrequency as BillingFrequency
  );
  const base = roundMoney(monthly * clampCatchUpMonths(months));
  return base > 0 ? base : null;
}

export function previewCatchUpNet(
  source: WizardCatchUpSource,
  draft: Pick<WizardCatchUpDraft, 'months' | 'discountPercent'>
): number | null {
  const base = previewCatchUpBase(source, draft.months);
  if (base == null) return null;
  return roundMoney(base * (1 - clampCatchUpDiscount(draft.discountPercent) / 100));
}

export type WizardCatchUpPayload = {
  serviceId: string;
  name: string;
  description: string;
  displayPrice: number;
  billingFrequency: 'ONE_TIME';
  quantity: number;
  discountPercent: number;
  oneOffDueDate: string;
};

export function buildWizardCatchUpPayload(
  source: WizardCatchUpSource,
  draft: WizardCatchUpDraft,
  todayIso: string
): WizardCatchUpPayload | null {
  if (!draft.enabled) return null;
  const base = previewCatchUpBase(source, draft.months);
  if (base == null) return null;
  const monthsLabel = catchUpMonthsLabel(draft.months);
  return {
    serviceId: source.serviceId,
    name: `Catch-up — ${source.name} (${monthsLabel})`,
    description: `One-off catch-up bringing ${monthsLabel} of ${source.name} up to date before the ongoing service begins.`,
    displayPrice: base,
    billingFrequency: 'ONE_TIME',
    quantity: 1,
    discountPercent: clampCatchUpDiscount(draft.discountPercent),
    oneOffDueDate: todayIso,
  };
}

export function collectWizardCatchUpLines(
  services: WizardCatchUpSource[],
  drafts: Record<string, WizardCatchUpDraft>,
  todayIso: string
): WizardCatchUpPayload[] {
  return services
    .map((source) => buildWizardCatchUpPayload(source, drafts[source.serviceId] || DEFAULT_WIZARD_CATCH_UP, todayIso))
    .filter((line): line is WizardCatchUpPayload => line != null);
}
