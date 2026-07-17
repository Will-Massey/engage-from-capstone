/**
 * Proposal line items are immutable snapshots — never merge live catalogue data on read.
 *
 * Storage is integer pence (docs/money-int-pence-migration.md, Stage 2);
 * the wire format stays pounds, derived here at the serialization boundary.
 */
import { penceToPounds } from './proposalPricing.js';

export type ProposalServiceRow = {
  id: string;
  name: string;
  description?: string | null;
  billingFrequency: string;
  priceDisplayMode?: string;
  quantity: number;
  discountPercent: number;
  frequency: string;
  vatRate: number;
  displayPricePence: number;
  unitPricePence: number;
  annualEquivalentPence?: number | null;
  lineTotalPence: number;
  vatAmountPence?: number | null;
  grossTotalPence?: number | null;
  isOptional?: boolean;
  sortOrder?: number;
  oneOffDueDate?: Date | string | null;
  serviceTemplateId?: string | null;
  serviceTemplate?: { id: string; category?: string | null } | null;
};

/** Strip live catalogue joins; keep only snapshot fields (+ optional category hint). */
export function serializeProposalServiceForApi(service: ProposalServiceRow) {
  const { serviceTemplate, ...snapshot } = service;
  return {
    ...snapshot,
    displayPrice: penceToPounds(service.displayPricePence),
    unitPrice: penceToPounds(service.unitPricePence),
    annualEquivalent: penceToPounds(service.annualEquivalentPence),
    lineTotal: penceToPounds(service.lineTotalPence),
    vatAmount: penceToPounds(service.vatAmountPence),
    grossTotal: penceToPounds(service.grossTotalPence),
    category: serviceTemplate?.category ?? null,
    catalogServiceId: service.serviceTemplateId ?? null,
  };
}

export function serializeProposalServicesForApi(services: ProposalServiceRow[]) {
  return services.map(serializeProposalServiceForApi);
}

export type ProposalMoneyRow = {
  subtotalPence: number;
  discountAmountPence: number;
  vatAmountPence: number;
  totalPence: number;
};

/**
 * Derived pounds header money for API responses. Spread AFTER the proposal
 * row so the pounds fields the frontend reads (subtotal, discountAmount,
 * vatAmount, total) are always present.
 */
export function proposalMoneyForApi(proposal: ProposalMoneyRow) {
  return {
    subtotal: penceToPounds(proposal.subtotalPence),
    discountAmount: penceToPounds(proposal.discountAmountPence),
    vatAmount: penceToPounds(proposal.vatAmountPence),
    total: penceToPounds(proposal.totalPence),
  };
}

export function deepCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
