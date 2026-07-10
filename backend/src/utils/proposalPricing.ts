/**
 * Shared proposal line-item pricing — canonical logic in @shared/pricingEngine.
 */
import { PricingFrequency } from '@prisma/client';
import {
  calculateLineItem,
  VALID_BILLING_FREQUENCIES,
  billingFrequencyToDisplayMode,
  type BillingFrequency,
} from '../services/pricingEngine_v2.js';
import { roundMoney } from '@uk-proposal-platform/shared';

export { VALID_BILLING_FREQUENCIES };
export type { BillingFrequency };

export interface ProposalServiceInput {
  serviceId: string;
  /** Snapshot name — must not be overwritten from catalogue on save */
  name?: string;
  /** Snapshot description — preserved per proposal line */
  description?: string | null;
  quantity?: number;
  discountPercent?: number;
  displayPrice?: number;
  billingFrequency?: string;
  frequency?: string;
  vatRate?: number;
  oneOffDueDate?: string | null;
}

export interface ServiceTemplateInfo {
  id: string;
  name: string;
  description?: string | null;
  priceAmount?: number | null;
  basePrice?: number | null;
  billingCycle?: string | null;
  defaultFrequency?: string | null;
}

export function resolveBillingFrequency(
  svc: ProposalServiceInput,
  template?: ServiceTemplateInfo
): BillingFrequency {
  let billingFrequency =
    svc.billingFrequency ||
    svc.frequency ||
    template?.billingCycle ||
    template?.defaultFrequency ||
    'MONTHLY';
  if (!VALID_BILLING_FREQUENCIES.includes(billingFrequency as BillingFrequency)) {
    billingFrequency = 'MONTHLY';
  }
  return billingFrequency as BillingFrequency;
}

export interface BuiltProposalService {
  name: string;
  description?: string | null;
  displayPrice: number;
  billingFrequency: string;
  priceDisplayMode: string;
  annualEquivalent: number;
  quantity: number;
  lineTotal: number;
  unitPrice: number;
  discountPercent: number;
  frequency: string;
  vatRate: number;
  vatAmount: number;
  grossTotal: number;
  // Int-pence mirrors (Stage 1, docs/money-int-pence-migration.md) —
  // authoritative at the payment boundary.
  displayPricePence: number;
  unitPricePence: number;
  annualEquivalentPence: number;
  lineTotalPence: number;
  vatAmountPence: number;
  grossTotalPence: number;
  oneOffDueDate: Date | null;
  serviceTemplateId: string | null;
}

/** Pounds (2dp) → integer pence. The single conversion point at persistence. */
export function poundsToPence(pounds: number): number {
  return Math.round(pounds * 100);
}

export function buildProposalServiceRecord(
  svc: ProposalServiceInput,
  template: ServiceTemplateInfo | undefined,
  parseOneOffDueDate: (billingFrequency: string, raw: unknown) => Date | null
): BuiltProposalService {
  const snapshotName = svc.name?.trim();
  const snapshotDescription =
    svc.description !== undefined && svc.description !== null ? svc.description : undefined;

  const displayPrice =
    svc.displayPrice !== undefined && svc.displayPrice >= 0
      ? svc.displayPrice
      : template?.priceAmount || template?.basePrice || 0;

  const billingFrequency = resolveBillingFrequency(svc, template);
  const quantity = svc.quantity || 1;
  const discountPercent = svc.discountPercent || 0;
  const vatRate = svc.vatRate !== undefined ? svc.vatRate : 20;

  const line = calculateLineItem({
    basePrice: displayPrice,
    billingFrequency,
    quantity,
    discountPercent,
    vatRate,
  });

  // Persisted money is always whole pence (2dp): quantities like 1.5 ×
  // £33.33 would otherwise store float dust that drifts from the pence
  // amounts charged at the payment boundary. Gross is derived from the
  // ROUNDED net so the gross === lineTotal + vatAmount invariant holds
  // exactly on what we store. (Stage 0 of the Int-pence migration — see
  // docs/money-int-pence-migration.md.)
  const netTotal = roundMoney(line.netTotal);
  const grossTotal = roundMoney(netTotal + line.vatAmount);

  return {
    name: snapshotName || template?.name || 'Service',
    description: snapshotDescription !== undefined ? snapshotDescription : template?.description,
    displayPrice: roundMoney(line.displayPrice),
    billingFrequency,
    priceDisplayMode: billingFrequencyToDisplayMode(billingFrequency),
    annualEquivalent: roundMoney(line.annualEquivalent),
    quantity: line.quantity,
    lineTotal: netTotal,
    unitPrice: roundMoney(line.displayPrice),
    discountPercent,
    frequency: billingFrequency,
    vatRate,
    vatAmount: line.vatAmount,
    grossTotal,
    displayPricePence: poundsToPence(roundMoney(line.displayPrice)),
    unitPricePence: poundsToPence(roundMoney(line.displayPrice)),
    annualEquivalentPence: poundsToPence(roundMoney(line.annualEquivalent)),
    lineTotalPence: poundsToPence(netTotal),
    vatAmountPence: poundsToPence(line.vatAmount),
    grossTotalPence: poundsToPence(netTotal) + poundsToPence(line.vatAmount),
    oneOffDueDate: parseOneOffDueDate(billingFrequency, svc.oneOffDueDate),
    serviceTemplateId: template?.id ?? null,
  };
}

export function calculateHeaderTotals(services: BuiltProposalService[]) {
  // Header pence are exact integer sums of line pence — never re-derived
  // from rounded pounds, so header pence === Σ line pence by construction.
  const subtotalPence = services.reduce((sum, s) => sum + s.lineTotalPence, 0);
  const vatAmountPence = services.reduce((sum, s) => sum + s.vatAmountPence, 0);
  const totalPence = services.reduce((sum, s) => sum + s.grossTotalPence, 0);
  return {
    subtotal: roundMoney(services.reduce((sum, s) => sum + s.lineTotal, 0)),
    vatAmount: roundMoney(services.reduce((sum, s) => sum + s.vatAmount, 0)),
    total: roundMoney(services.reduce((sum, s) => sum + s.grossTotal, 0)),
    subtotalPence,
    vatAmountPence,
    totalPence,
  };
}
