import type { PricingFrequency, ProposalStatus } from '@uk-proposal-platform/shared';
import type { DeclineReason } from '../constants/declineReasons';
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

export interface ProposalListMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApprovalQueueParams {
  page?: number;
  limit?: number;
}

/** Renewal wizard — GET /api/proposals/renewal-candidates */
export interface RenewalCandidate {
  clientId: string;
  clientName: string;
  companyType: string | null;
  proposalId: string;
  proposalReference: string;
  proposalTitle: string;
  renewalDate: string;
  total: number;
  paymentFrequency: string;
  hasPendingRenewal: boolean;
  daysUntilRenewal: number;
}

export interface RenewalCandidatesParams {
  expiringBefore?: string;
  clientIds?: string[];
}

export interface RenewalCandidatesMeta {
  count: number;
  expiringBefore: string | null;
  eligible: number;
}

export type RenewalUpliftMode = 'percent' | 'cpi' | 'min_floor';

export interface RenewalUpliftRules {
  mode: RenewalUpliftMode;
  percent?: number;
  cpiPercent?: number;
  minFeeGbp?: number;
  perServiceFloors?: Record<string, number>;
}

export interface BulkRenewalPayload {
  clientIds?: string[];
  proposalIds?: string[];
  expiringBefore?: string;
  templateId?: string;
  upliftPercent?: number;
  upliftRules?: RenewalUpliftRules;
  useAiCoverLetter?: boolean;
}

export interface BulkRenewalItemResult {
  clientId: string;
  clientName: string;
  proposalId?: string;
  reference?: string;
  title?: string;
  total?: number;
  reason?: string;
}

export interface BulkRenewalResult {
  created: BulkRenewalItemResult[];
  skipped: BulkRenewalItemResult[];
  failed: BulkRenewalItemResult[];
  summary: {
    requested: number;
    created: number;
    skipped: number;
    failed: number;
  };
}

/** POST /api/proposals/loe-only — route may not be wired; shape matches loeOnlyProposalService */
export interface CreateLoeOnlyProposalPayload {
  clientId: string;
  serviceIds: string[];
  title?: string;
  validUntil?: string;
  contractStartDate?: string | null;
  notes?: string;
}

export interface LoeOnlyProposalResult {
  proposal: ProposalRecord;
  clauseIds: string[];
}

export interface ProposalTermsPreviewResult {
  terms: string;
}

export interface SendProposalEmailPayload {
  subject: string;
  textBody: string;
  htmlBody?: string;
}

export interface ApproveProposalPayload {
  approvalNotes?: string;
}

export interface RejectProposalPayload {
  rejectionReason: string;
  approvalNotes?: string;
}

export interface MarkProposalLostPayload {
  declineReason: DeclineReason;
  reason?: string;
}

export interface DeleteProposalResult {
  message: string;
}

export interface RecordProposalViewResult {
  message: string;
  status: string;
}

export interface ProposalActivityUser {
  firstName: string;
  lastName: string;
  email: string;
}

export interface ProposalActivityEntry {
  id: string;
  action: string;
  description?: string | null;
  entityType: string;
  entityId: string;
  createdAt: string;
  metadata?: string | null;
  user?: ProposalActivityUser | null;
}

export type RegulatoryFitSeverity = 'info' | 'warning' | 'critical';

export interface RegulatoryFitAlert {
  id: string;
  code: string;
  title: string;
  message: string;
  severity: RegulatoryFitSeverity;
  suggestion?: string;
}

export type RegulatoryTurnoverBand = 'UNKNOWN' | 'MICRO' | 'SMALL' | 'MEDIUM' | 'LARGE';

export interface ProposalRegulatoryFitResult {
  proposalId: string;
  clientId: string;
  clientName: string;
  mtditsaStatus: string;
  turnoverBand: RegulatoryTurnoverBand;
  alerts: RegulatoryFitAlert[];
  scannedAt: string;
}

export interface ProposalSignatureRecord {
  id: string;
  signedBy: string;
  signedByRole: string | null;
  signerEmail: string | null;
  signedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  deviceInfo: string | null;
  geoLocation: string | null;
  documentHash: string | null;
  termsHash: string | null;
  consentText: string | null;
  signatureType: string | null;
  agreementVersion: string | null;
  agreementAccepted: boolean | null;
}

export interface SignatureAuditRecord {
  auditSchemaVersion: string;
  exportedAt: string;
  proposal: {
    id: string;
    reference: string;
    title: string;
    status: string;
    acceptedAt: string | null;
    acceptedBy: string | null;
  };
  signature: ProposalSignatureRecord;
}

export interface ComplianceAuditEntry {
  timestamp: string;
  action: string;
  actor: string;
  ipAddress: string | null;
  userAgent: string | null;
  details: Record<string, unknown>;
}
