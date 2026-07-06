/**
 * Proposal line items are immutable snapshots — never merge live catalogue data on read.
 */

export type ProposalServiceRow = {
  id: string;
  name: string;
  description?: string | null;
  displayPrice: number;
  billingFrequency: string;
  priceDisplayMode?: string;
  annualEquivalent?: number;
  quantity: number;
  lineTotal: number;
  unitPrice: number;
  discountPercent: number;
  frequency: string;
  vatRate: number;
  vatAmount: number;
  grossTotal: number;
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
    category: serviceTemplate?.category ?? null,
    catalogServiceId: service.serviceTemplateId ?? null,
  };
}

export function serializeProposalServicesForApi(services: ProposalServiceRow[]) {
  return services.map(serializeProposalServiceForApi);
}

export function deepCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
