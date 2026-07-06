import {
  calculateLineItem,
  calculateProposalTotals,
  type BillingFrequency,
  type ServicePricingInput,
} from './pricingEngine';

export interface BandTotals {
  subtotal: number;
  vat: number;
  total: number;
  count: number;
}

export interface PricingSummaryBands {
  weekly: BandTotals;
  monthly: BandTotals;
  quarterly: BandTotals;
  annually: BandTotals;
  oneTime: BandTotals;
  contractTotalIncVat: number;
  totalSubtotalExVat: number;
  totalVat: number;
}

export interface ProposalLineForSummary {
  billingFrequency: BillingFrequency;
  lineTotal: number;
  vatAmount: number;
  grossTotal: number;
}

const BAND_KEYS: Record<
  BillingFrequency,
  keyof Pick<PricingSummaryBands, 'weekly' | 'monthly' | 'quarterly' | 'annually' | 'oneTime'>
> = {
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  ANNUALLY: 'annually',
  ONE_TIME: 'oneTime',
};

function emptyBand(): BandTotals {
  return { subtotal: 0, vat: 0, total: 0, count: 0 };
}

/** Build per-line totals using the shared pricing engine (frontend live preview + API parity). */
export function buildProposalLinesForSummary(
  inputs: ServicePricingInput[]
): ProposalLineForSummary[] {
  return inputs.map((input) => {
    const line = calculateLineItem(input);
    return {
      billingFrequency: input.billingFrequency,
      lineTotal: line.netTotal,
      vatAmount: line.vatAmount,
      grossTotal: line.grossTotal,
    };
  });
}

/** Group proposal lines into investment summary bands (ProposalBuilder / client view). */
export function calculateProposalSummaryBands(
  lines: ProposalLineForSummary[]
): PricingSummaryBands {
  const bands: PricingSummaryBands = {
    weekly: emptyBand(),
    monthly: emptyBand(),
    quarterly: emptyBand(),
    annually: emptyBand(),
    oneTime: emptyBand(),
    contractTotalIncVat: 0,
    totalSubtotalExVat: 0,
    totalVat: 0,
  };

  for (const line of lines) {
    const key = BAND_KEYS[line.billingFrequency] ?? 'monthly';
    bands[key].subtotal += line.lineTotal;
    bands[key].vat += line.vatAmount;
    bands[key].total += line.grossTotal;
    bands[key].count += 1;
  }

  bands.contractTotalIncVat =
    bands.weekly.total +
    bands.monthly.total +
    bands.quarterly.total +
    bands.annually.total +
    bands.oneTime.total;
  bands.totalSubtotalExVat =
    bands.weekly.subtotal +
    bands.monthly.subtotal +
    bands.quarterly.subtotal +
    bands.annually.subtotal +
    bands.oneTime.subtotal;
  bands.totalVat =
    bands.weekly.vat +
    bands.monthly.vat +
    bands.quarterly.vat +
    bands.annually.vat +
    bands.oneTime.vat;

  return bands;
}

/** Convenience: pricing inputs → summary bands in one step (matches API grand totals). */
export function calculateProposalSummaryFromInputs(
  inputs: ServicePricingInput[]
): PricingSummaryBands {
  const lineResults = inputs.map((input) => calculateLineItem(input));
  const apiTotals = calculateProposalTotals(lineResults);
  const lines = lineResults.map((line) => ({
    billingFrequency: line.billingFrequency,
    lineTotal: line.netTotal,
    vatAmount: line.vatAmount,
    grossTotal: line.grossTotal,
  }));
  const summary = calculateProposalSummaryBands(lines);
  summary.contractTotalIncVat = apiTotals.grandTotal;
  return summary;
}
