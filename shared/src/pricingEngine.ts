/**
 * Proposal pricing engine v2 — canonical source for backend and frontend.
 *
 * Principles:
 * 1. Show prices as stored — £850/year shows as £850/year
 * 2. Annual equivalent is for comparison only
 * 3. VAT calculated per line on discounted net
 */

export type BillingFrequency =
  | 'ONE_TIME'
  | 'HOURLY'
  | 'WEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'ANNUALLY';

export type PriceDisplayMode = 'PER_MONTH' | 'PER_QUARTER' | 'PER_YEAR' | 'ONE_TIME' | 'PER_HOUR';

export type HourlyBillingMode = 'ONE_OFF' | 'MONTHLY_ACTUAL';

/** Missing or unknown modes are a one-off block of hours (today's behaviour). */
export function normaliseHourlyBillingMode(mode: string | null | undefined): HourlyBillingMode {
  return String(mode || '').toUpperCase() === 'MONTHLY_ACTUAL' ? 'MONTHLY_ACTUAL' : 'ONE_OFF';
}

/**
 * Recurring monthly hourly: the quantity is an estimate of hours that month.
 * The client pays later for the hours actually worked.
 */
export function isMonthlyActualHourly(
  frequency: string | null | undefined,
  mode?: string | null
): boolean {
  return (
    String(frequency || '').toUpperCase() === 'HOURLY' &&
    normaliseHourlyBillingMode(mode) === 'MONTHLY_ACTUAL'
  );
}

export interface ServicePricingInput {
  basePrice: number;
  billingFrequency: BillingFrequency;
  quantity?: number;
  discountPercent?: number;
  vatRate?: number;
  /** Only read when billingFrequency is HOURLY. Defaults to ONE_OFF. */
  hourlyBillingMode?: string | null;
}

export interface LineItemResult {
  displayPrice: number;
  billingFrequency: BillingFrequency;
  priceDisplayMode: PriceDisplayMode;
  priceLabel: string;
  annualEquivalent: number;
  /** Set on hourly lines. ONE_OFF is a quoted block. MONTHLY_ACTUAL is an estimate. */
  hourlyBillingMode?: HourlyBillingMode;
  quantity: number;
  lineTotal: number;
  discountAmount: number;
  netTotal: number;
  vatAmount: number;
  grossTotal: number;
}

export interface FrequencyBandTotals {
  subtotal: number;
  vatAmount: number;
  total: number;
  items: LineItemResult[];
}

export interface ProposalTotals {
  monthly: FrequencyBandTotals;
  quarterly: FrequencyBandTotals;
  annually: FrequencyBandTotals;
  oneTime: FrequencyBandTotals;
  weekly: FrequencyBandTotals;
  /** Quoted hours (rate × quantity). Not a repeating calendar charge. */
  hourly: FrequencyBandTotals;
  grandTotal: number;
  totalAnnualEquivalent: number;
  primaryBillingFrequency: BillingFrequency;
}

/** Round to whole pence (2dp) — the single money-rounding rule for the app. */
export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export const DEFAULT_VAT_RATE = 20;

/** VAT on a (discounted) net amount, rounded to pence. */
export function vatAmountFor(netAmount: number, vatRate: number = DEFAULT_VAT_RATE): number {
  return roundMoney(netAmount * (vatRate / 100));
}

export interface EquivalentOptions {
  /**
   * How ONE_TIME amounts contribute to a recurring equivalent:
   * - 'excluded' (default): 0 — one-offs are not recurring value
   * - 'amortised': spread across one year (÷12 monthly, ×1 annual)
   * Callers MUST pick deliberately — historically different corners of the
   * app disagreed on this, which is why it is explicit here.
   */
  oneTime?: 'excluded' | 'amortised';
  /**
   * How HOURLY amounts contribute:
   * - 'excluded' (default): 0. A bare rate is not a monthly or annual fee.
   * - 'quoted': count rate × hours at full value. MONTHLY_ACTUAL then × 12.
   */
  hourly?: 'excluded' | 'quoted';
  /** Hours on the line. Used with hourly: 'quoted'. Defaults to 1. */
  quantity?: number;
  hourlyBillingMode?: string | null;
}

/**
 * Quoted amounts are collected once for the work described. They are not a
 * Stripe or accounting repeating interval.
 * HOURLY is a rate times a quantity of hours, not a calendar recurrence.
 */
export function isQuotedBillingFrequency(frequency: string | null | undefined): boolean {
  const upper = String(frequency || '').toUpperCase();
  return upper === 'ONE_TIME' || upper === 'ONE_OFF' || upper === 'HOURLY';
}

/**
 * Annualised value of a recurring amount. Unknown/blank frequencies are
 * treated as MONTHLY (matches the engine's historical default). Unrounded —
 * round at the display/persistence edge.
 */
export function annualEquivalentFor(
  amount: number,
  frequency: BillingFrequency | string,
  options?: EquivalentOptions
): number {
  switch (frequency) {
    case 'WEEKLY':
      return amount * 52;
    case 'QUARTERLY':
      return amount * 4;
    case 'ANNUALLY':
      return amount;
    case 'ONE_TIME':
      return options?.oneTime === 'amortised' ? amount : 0;
    case 'HOURLY': {
      // A bare rate is not a calendar fee. Callers that want the quoted fee
      // pass hourly: 'quoted' and the hours as quantity.
      if (options?.hourly !== 'quoted') return 0;
      const hours = options.quantity ?? 1;
      const quoted = amount * (Number.isFinite(hours) && hours > 0 ? hours : 0);
      return normaliseHourlyBillingMode(options.hourlyBillingMode) === 'MONTHLY_ACTUAL'
        ? quoted * 12
        : quoted;
    }
    case 'MONTHLY':
    default:
      return amount * 12;
  }
}

/** Monthly-average value of a recurring amount. Same conventions as annualEquivalentFor. */
export function monthlyEquivalentFor(
  amount: number,
  frequency: BillingFrequency | string,
  options?: EquivalentOptions
): number {
  return annualEquivalentFor(amount, frequency, options) / 12;
}

export function calculateLineItem(input: ServicePricingInput): LineItemResult {
  const { basePrice, billingFrequency, quantity = 1, discountPercent = 0, vatRate = 20 } = input;

  const lineTotal = basePrice * quantity;
  const discountAmount = lineTotal * (discountPercent / 100);
  const netTotal = lineTotal - discountAmount;
  const vatAmount = vatAmountFor(netTotal, vatRate);
  const grossTotal = netTotal + vatAmount;

  const hourlyBillingMode =
    billingFrequency === 'HOURLY' ? normaliseHourlyBillingMode(input.hourlyBillingMode) : undefined;
  const annualEquivalent =
    billingFrequency === 'HOURLY'
      ? annualEquivalentFor(basePrice, 'HOURLY', {
          hourly: 'quoted',
          quantity: 1,
          hourlyBillingMode,
        })
      : annualEquivalentFor(basePrice, billingFrequency);

  let priceDisplayMode: PriceDisplayMode;
  switch (billingFrequency) {
    case 'MONTHLY':
    case 'WEEKLY':
      priceDisplayMode = 'PER_MONTH';
      break;
    case 'QUARTERLY':
      priceDisplayMode = 'PER_QUARTER';
      break;
    case 'ANNUALLY':
      priceDisplayMode = 'PER_YEAR';
      break;
    case 'ONE_TIME':
      priceDisplayMode = 'ONE_TIME';
      break;
    case 'HOURLY':
      priceDisplayMode = 'PER_HOUR';
      break;
    default:
      priceDisplayMode = 'PER_MONTH';
  }

  const formattedPrice = formatPricingCurrency(basePrice);
  let priceLabel = '';
  switch (priceDisplayMode) {
    case 'PER_MONTH':
      priceLabel = `${formattedPrice}/month`;
      break;
    case 'PER_QUARTER':
      priceLabel = `${formattedPrice}/quarter`;
      break;
    case 'PER_YEAR':
      priceLabel = `${formattedPrice}/year`;
      break;
    case 'ONE_TIME':
      priceLabel = `${formattedPrice} one-time`;
      break;
    case 'PER_HOUR':
      priceLabel = `${formattedPrice}/hour`;
      break;
  }

  return {
    displayPrice: basePrice,
    billingFrequency,
    priceDisplayMode,
    priceLabel,
    annualEquivalent,
    hourlyBillingMode,
    quantity,
    lineTotal,
    discountAmount,
    netTotal,
    vatAmount,
    grossTotal,
  };
}

export function calculateProposalTotals(lineItems: LineItemResult[]): ProposalTotals {
  const grouped = {
    monthly: lineItems.filter((item) => item.billingFrequency === 'MONTHLY'),
    quarterly: lineItems.filter((item) => item.billingFrequency === 'QUARTERLY'),
    annually: lineItems.filter((item) => item.billingFrequency === 'ANNUALLY'),
    oneTime: lineItems.filter((item) => item.billingFrequency === 'ONE_TIME'),
    weekly: lineItems.filter((item) => item.billingFrequency === 'WEEKLY'),
    hourly: lineItems.filter((item) => item.billingFrequency === 'HOURLY'),
  };

  const calculateGroup = (items: LineItemResult[]): FrequencyBandTotals => ({
    subtotal: items.reduce((sum, item) => sum + item.netTotal, 0),
    vatAmount: items.reduce((sum, item) => sum + item.vatAmount, 0),
    total: items.reduce((sum, item) => sum + item.grossTotal, 0),
    items,
  });

  const monthly = calculateGroup(grouped.monthly);
  const quarterly = calculateGroup(grouped.quarterly);
  const annually = calculateGroup(grouped.annually);
  const oneTime = calculateGroup(grouped.oneTime);
  const weekly = calculateGroup(grouped.weekly);
  const hourly = calculateGroup(grouped.hourly);

  const grandTotal =
    monthly.total + quarterly.total + annually.total + oneTime.total + weekly.total + hourly.total;
  const totalAnnualEquivalent =
    monthly.items.reduce((sum, item) => sum + item.annualEquivalent * item.quantity, 0) +
    quarterly.items.reduce((sum, item) => sum + item.annualEquivalent * item.quantity, 0) +
    annually.items.reduce((sum, item) => sum + item.annualEquivalent * item.quantity, 0) +
    hourly.items.reduce((sum, item) => sum + item.annualEquivalent * item.quantity, 0);

  const counts: Record<BillingFrequency, number> = {
    MONTHLY: grouped.monthly.length,
    QUARTERLY: grouped.quarterly.length,
    ANNUALLY: grouped.annually.length,
    ONE_TIME: grouped.oneTime.length,
    WEEKLY: grouped.weekly.length,
    HOURLY: grouped.hourly.length,
  };
  const primaryBillingFrequency = Object.entries(counts).sort(
    (a, b) => b[1] - a[1]
  )[0][0] as BillingFrequency;

  return {
    monthly,
    quarterly,
    annually,
    oneTime,
    weekly,
    hourly,
    grandTotal,
    totalAnnualEquivalent,
    primaryBillingFrequency,
  };
}

export function formatPricingCurrency(amount: number, currency: string = 'GBP'): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function getBillingFrequencyLabel(frequency: BillingFrequency): string {
  switch (frequency) {
    case 'MONTHLY':
      return 'Monthly';
    case 'QUARTERLY':
      return 'Quarterly';
    case 'ANNUALLY':
      return 'Annual';
    case 'ONE_TIME':
      return 'One-time';
    case 'WEEKLY':
      return 'Weekly';
    case 'HOURLY':
      return 'Hourly';
    default:
      return frequency;
  }
}

export function getBillingFrequencyShort(frequency: BillingFrequency): string {
  switch (frequency) {
    case 'MONTHLY':
      return '/mo';
    case 'QUARTERLY':
      return '/qtr';
    case 'ANNUALLY':
      return '/yr';
    case 'ONE_TIME':
      return '';
    case 'WEEKLY':
      return '/wk';
    case 'HOURLY':
      return '/hr';
    default:
      return '';
  }
}
