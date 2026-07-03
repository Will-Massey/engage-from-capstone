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
  | 'WEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'ANNUALLY';

export type PriceDisplayMode = 'PER_MONTH' | 'PER_QUARTER' | 'PER_YEAR' | 'ONE_TIME';

export interface ServicePricingInput {
  basePrice: number;
  billingFrequency: BillingFrequency;
  quantity?: number;
  discountPercent?: number;
  vatRate?: number;
}

export interface LineItemResult {
  displayPrice: number;
  billingFrequency: BillingFrequency;
  priceDisplayMode: PriceDisplayMode;
  priceLabel: string;
  annualEquivalent: number;
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
  grandTotal: number;
  totalAnnualEquivalent: number;
  primaryBillingFrequency: BillingFrequency;
}

export function calculateLineItem(input: ServicePricingInput): LineItemResult {
  const { basePrice, billingFrequency, quantity = 1, discountPercent = 0, vatRate = 20 } = input;

  const lineTotal = basePrice * quantity;
  const discountAmount = lineTotal * (discountPercent / 100);
  const netTotal = lineTotal - discountAmount;
  const vatAmount = Math.round(netTotal * (vatRate / 100) * 100) / 100;
  const grossTotal = netTotal + vatAmount;

  let annualEquivalent = 0;
  switch (billingFrequency) {
    case 'MONTHLY':
      annualEquivalent = basePrice * 12;
      break;
    case 'QUARTERLY':
      annualEquivalent = basePrice * 4;
      break;
    case 'ANNUALLY':
      annualEquivalent = basePrice;
      break;
    case 'ONE_TIME':
      annualEquivalent = 0;
      break;
    case 'WEEKLY':
      annualEquivalent = basePrice * 52;
      break;
    default:
      annualEquivalent = basePrice * 12;
  }

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
  }

  return {
    displayPrice: basePrice,
    billingFrequency,
    priceDisplayMode,
    priceLabel,
    annualEquivalent,
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

  const grandTotal =
    monthly.total + quarterly.total + annually.total + oneTime.total + weekly.total;
  const totalAnnualEquivalent =
    monthly.items.reduce((sum, item) => sum + item.annualEquivalent * item.quantity, 0) +
    quarterly.items.reduce((sum, item) => sum + item.annualEquivalent * item.quantity, 0) +
    annually.items.reduce((sum, item) => sum + item.annualEquivalent * item.quantity, 0);

  const counts: Record<BillingFrequency, number> = {
    MONTHLY: grouped.monthly.length,
    QUARTERLY: grouped.quarterly.length,
    ANNUALLY: grouped.annually.length,
    ONE_TIME: grouped.oneTime.length,
    WEEKLY: grouped.weekly.length,
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
    default:
      return '';
  }
}