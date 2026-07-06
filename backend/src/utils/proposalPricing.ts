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
  oneOffDueDate: Date | null;
  serviceTemplateId: string | null;
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

  return {
    name: snapshotName || template?.name || 'Service',
    description: snapshotDescription !== undefined ? snapshotDescription : template?.description,
    displayPrice: line.displayPrice,
    billingFrequency,
    priceDisplayMode: billingFrequencyToDisplayMode(billingFrequency),
    annualEquivalent: line.annualEquivalent,
    quantity: line.quantity,
    lineTotal: line.netTotal,
    unitPrice: line.displayPrice,
    discountPercent,
    frequency: billingFrequency,
    vatRate,
    vatAmount: line.vatAmount,
    grossTotal: line.grossTotal,
    oneOffDueDate: parseOneOffDueDate(billingFrequency, svc.oneOffDueDate),
    serviceTemplateId: template?.id ?? null,
  };
}

export function calculateHeaderTotals(services: BuiltProposalService[]) {
  return {
    subtotal: services.reduce((sum, s) => sum + s.lineTotal, 0),
    vatAmount: services.reduce((sum, s) => sum + s.vatAmount, 0),
    total: services.reduce((sum, s) => sum + s.grossTotal, 0),
  };
}
