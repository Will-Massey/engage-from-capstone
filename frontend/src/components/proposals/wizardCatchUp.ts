import {
  isQuotedBillingFrequency,
  monthlyEquivalentFor,
  roundMoney,
  type BillingFrequency,
} from '@shared/pricingEngine';

export type WizardCatchUpDraft = {
  enabled: boolean;
  months: number;
  /** Used when the source line is hourly. Billed as rate times hours, once. */
  hours?: number;
  discountPercent: number;
};

export type WizardCatchUpSource = {
  serviceId: string;
  name: string;
  displayPrice: number;
  billingFrequency: string;
  quantity?: number;
};

export const DEFAULT_WIZARD_CATCH_UP: WizardCatchUpDraft = {
  enabled: false,
  months: 3,
  discountPercent: 0,
};

export function isRecurringWizardFrequency(freq?: string): boolean {
  return Boolean(freq && !isQuotedBillingFrequency(freq));
}

export function isHourlyCatchUpFrequency(freq?: string): boolean {
  return String(freq || '').toUpperCase() === 'HOURLY';
}

/** Recurring lines use months. Hourly lines use a one-off block of hours. */
export function isCatchUpEligibleFrequency(freq?: string): boolean {
  return isRecurringWizardFrequency(freq) || isHourlyCatchUpFrequency(freq);
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

export function clampCatchUpHours(hours: number): number {
  return Math.max(1, Math.min(999, Math.round(Number(hours) || 0)));
}

/** One-off catch-up at an hourly rate: rate times hours, after discount. */
export function previewHourlyCatchUp(
  rate: number,
  hours: number,
  discountPercent = 0
): number | null {
  const net = roundMoney(
    rate * clampCatchUpHours(hours) * (1 - clampCatchUpDiscount(discountPercent) / 100)
  );
  return net > 0 ? net : null;
}

export function previewCatchUpNet(
  source: WizardCatchUpSource,
  draft: Pick<WizardCatchUpDraft, 'months' | 'hours' | 'discountPercent'>
): number | null {
  if (isHourlyCatchUpFrequency(source.billingFrequency)) {
    return previewHourlyCatchUp(
      source.displayPrice,
      draft.hours ?? source.quantity ?? 1,
      draft.discountPercent
    );
  }
  const base = previewCatchUpBase(source, draft.months);
  if (base == null) return null;
  return roundMoney(base * (1 - clampCatchUpDiscount(draft.discountPercent) / 100));
}

export type WizardCatchUpPayload = {
  serviceId: string;
  name: string;
  description: string;
  displayPrice: number;
  billingFrequency: 'ONE_TIME' | 'HOURLY';
  hourlyBillingMode?: 'ONE_OFF';
  quantity: number;
  discountPercent: number;
  oneOffDueDate?: string;
};

export function buildWizardCatchUpPayload(
  source: WizardCatchUpSource,
  draft: WizardCatchUpDraft,
  todayIso: string
): WizardCatchUpPayload | null {
  if (!draft.enabled) return null;
  if (isHourlyCatchUpFrequency(source.billingFrequency)) {
    const hours = clampCatchUpHours(draft.hours ?? source.quantity ?? 1);
    const discountPercent = clampCatchUpDiscount(draft.discountPercent);
    const net = previewHourlyCatchUp(source.displayPrice, hours, discountPercent);
    if (net == null) return null;
    const hoursLabel = `${hours} hour${hours === 1 ? '' : 's'}`;
    return {
      serviceId: source.serviceId,
      name: `Catch-up: ${source.name} (${hoursLabel})`,
      description: `One-off catch-up bringing ${source.name} up to date, billed as the hourly rate times ${hoursLabel}.`,
      displayPrice: source.displayPrice,
      billingFrequency: 'HOURLY',
      hourlyBillingMode: 'ONE_OFF',
      quantity: hours,
      discountPercent,
    };
  }
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
    .map((source) =>
      buildWizardCatchUpPayload(
        source,
        drafts[source.serviceId] || DEFAULT_WIZARD_CATCH_UP,
        todayIso
      )
    )
    .filter((line): line is WizardCatchUpPayload => line != null);
}
