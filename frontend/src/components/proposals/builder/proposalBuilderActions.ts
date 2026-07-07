import { calculateLineItem, type BillingFrequency } from '@shared/pricingEngine';
import { parseFrequencyOptions } from '../../../utils/billingCadence';
import { buildCustomFieldsPayload, type PricingTier } from '../../../utils/proposalCustomFields';
import type { CreateProposalPayload } from '../../../types/proposals';
import type { Client, SelectedService, Service } from './shared';

export function mapCatalogueVatPercent(service: Service): number {
  if (service.isVatApplicable === false) return 0;
  if (service.vatRate === 'REDUCED_5') return 5;
  if (service.vatRate === 'ZERO' || service.vatRate === 'EXEMPT') return 0;
  return 20;
}

export function newSelectedLineId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function isServiceLineAlreadySelected(
  selectedServices: SelectedService[],
  templateId: string
): boolean {
  return selectedServices.some((line) => line.templateId === templateId);
}

/** Pure builder for add-service — mirrors ProposalBuilderContext.addServiceWithCadence */
export function buildSelectedServiceLine(
  service: Service,
  opts: {
    billingFrequency?: string;
    overridePrice?: number;
    includeVat: boolean;
    lineId?: string;
  }
): SelectedService {
  const price = opts.overridePrice ?? service.priceAmount ?? 0;
  const frequency =
    opts.billingFrequency || service.billingCycle || service.defaultFrequency || 'MONTHLY';
  const vatPercent = opts.includeVat ? mapCatalogueVatPercent(service) : 0;
  const line = calculateLineItem({
    basePrice: price,
    billingFrequency: frequency as BillingFrequency,
    quantity: 1,
    discountPercent: 0,
    vatRate: vatPercent,
  });

  return {
    ...service,
    id: opts.lineId ?? newSelectedLineId(),
    templateId: service.id,
    quantity: 1,
    discountPercent: 0,
    displayPrice: price,
    billingCycle: frequency,
    priceAmount: price,
    annualEquivalent: line.annualEquivalent,
    lineTotal: line.netTotal,
    vatRate: vatPercent,
    vatAmount: line.vatAmount,
    grossTotal: line.grossTotal,
    allowedCadences: parseFrequencyOptions(service.frequencyOptions),
    oneOffDueDate: frequency === 'ONE_TIME' ? '' : undefined,
  };
}

export interface ProposalValidationInput {
  selectedClient: Client | null;
  selectedServices: SelectedService[];
  proposalTitle: string;
  validUntil: string;
  todayIso: string;
  coverLetter: string;
}

export function collectProposalValidationErrors(input: ProposalValidationInput): string[] {
  const errors: string[] = [];
  if (!input.selectedClient) errors.push('Select a client');
  if (input.selectedServices.length === 0) errors.push('Add at least one service');

  const missingCatalogue = input.selectedServices.filter((s) => !s.templateId);
  if (missingCatalogue.length > 0) {
    errors.push(
      `${missingCatalogue.length} service line(s) are not linked to your catalogue — remove and re-add them`
    );
  }

  if (!input.proposalTitle.trim()) errors.push('Enter a proposal title');
  if (!input.validUntil) errors.push('Set a proposal expiry date');
  if (input.validUntil && input.validUntil < input.todayIso) {
    errors.push('Expiry date must be today or in the future');
  }
  if (input.coverLetter.trim().length > 0 && input.coverLetter.trim().length < 80) {
    errors.push('Proposal letter is very short — regenerate with Clara or expand it');
  }
  if (!input.coverLetter.trim()) {
    errors.push('Generate the client proposal letter before saving');
  }
  return errors;
}

export interface ProposalSaveInput {
  selectedClient: Client;
  selectedServices: SelectedService[];
  proposalTitle: string;
  validUntil: string;
  contractStartDate: string;
  coverLetter: string;
  proposalTerms: string;
  defaultPaymentTermsDays: number;
  includeVat: boolean;
  offerThreePackages: boolean;
  pricingTiers: PricingTier[];
  requireTwoSigners: boolean;
}

export function buildProposalSavePayload(input: ProposalSaveInput): CreateProposalPayload {
  const servicesData = input.selectedServices
    .filter((s) => s.templateId)
    .map((s) => ({
      serviceId: s.templateId,
      name: s.name,
      description: s.description ?? null,
      displayPrice: s.displayPrice,
      billingFrequency:
        s.billingCycle as CreateProposalPayload['services'][number]['billingFrequency'],
      quantity: s.quantity,
      discountPercent: s.discountPercent,
      vatRate: input.includeVat ? s.vatRate : 0,
      ...(s.billingCycle === 'ONE_TIME' && s.oneOffDueDate?.trim()
        ? { oneOffDueDate: s.oneOffDueDate.trim() }
        : {}),
    }));

  return {
    clientId: input.selectedClient.id,
    title: input.proposalTitle,
    services: servicesData,
    ...(input.validUntil ? { validUntil: `${input.validUntil}T12:00:00.000Z` } : {}),
    contractStartDate: input.contractStartDate.trim()
      ? `${input.contractStartDate.trim()}T12:00:00.000Z`
      : null,
    coverLetter: input.coverLetter.trim(),
    paymentTerms: `${input.defaultPaymentTermsDays} day${input.defaultPaymentTermsDays === 1 ? '' : 's'}`,
    ...(input.proposalTerms.trim() ? { terms: input.proposalTerms.trim() } : {}),
    customFields: buildCustomFieldsPayload({
      offerThreePackages: input.offerThreePackages,
      pricingTiers: input.pricingTiers,
      requireTwoSigners: input.requireTwoSigners,
    }),
  };
}
