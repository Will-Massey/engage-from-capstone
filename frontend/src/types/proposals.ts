import type { PricingFrequency, ProposalStatus } from '@uk-proposal-platform/shared';
import type { ProposalCustomFields } from '../utils/proposalCustomFields';

export type { PricingFrequency, ProposalStatus };

/** Line item sent when creating or updating a proposal */
export interface ProposalServiceLineInput {
  serviceId: string;
  name?: string;
  description?: string | null;
  quantity: number;
  unitPrice?: number;
  discountPercent?: number;
  frequency?: PricingFrequency | string;
  billingFrequency?: PricingFrequency | string;
  displayPrice?: number;
  vatRate?: number;
  oneOffDueDate?: string | null;
}

export interface CreateProposalPayload {
  clientId: string;
  title: string;
  templateId?: string;
  services: ProposalServiceLineInput[];
  validUntil?: string;
  contractStartDate?: string | null;
  paymentTerms?: string;
  paymentFrequency?: PricingFrequency;
  coverLetter?: string;
  proposalSummary?: string;
  engagementLetter?: string;
  terms?: string;
  notes?: string;
  discountType?: 'PERCENTAGE' | 'FIXED';
  discountValue?: number;
  customFields?: ProposalCustomFields;
}

export type UpdateProposalPayload = Partial<
  Omit<CreateProposalPayload, 'clientId' | 'services'>
> & {
  services?: ProposalServiceLineInput[];
  status?: ProposalStatus;
};

export interface AcceptProposalPayload {
  signature: string;
  acceptedBy?: string;
  signatoryPosition?: string;
  deviceInfo?: string;
}

export interface ProposalListParams {
  limit?: number;
  offset?: number;
  page?: number;
  status?: ProposalStatus | string;
  approvalStatus?: string;
  clientId?: string;
  search?: string;
}

/** Minimal proposal shape returned by create / get / list endpoints */
export interface ProposalRecord {
  id: string;
  clientId: string;
  title: string;
  reference?: string;
  status: ProposalStatus | string;
  approvalStatus?: string;
  validUntil?: string;
  coverLetter?: string | null;
  terms?: string | null;
  paymentTerms?: string | null;
  customFields?: string | ProposalCustomFields | null;
  shareToken?: string | null;
  shareUrl?: string;
  total?: number;
  services?: Array<{
    id?: string;
    serviceId?: string;
    serviceTemplateId?: string;
    name: string;
    quantity: number;
    unitPrice?: number;
    displayPrice?: number;
    billingFrequency?: PricingFrequency | string;
    frequency?: PricingFrequency | string;
    discountPercent?: number;
    vatRate?: number;
    oneOffDueDate?: string | null;
  }>;
}
