import type { CompanyType, MTDITSAStatus } from '@uk-proposal-platform/shared';

export type { CompanyType, MTDITSAStatus };

export type ClientRelationship = 'NEW' | 'EXISTING';

export type ClientLifecycleStage =
  | 'PROSPECT'
  | 'PROPOSAL_ACCEPTED'
  | 'AML_PENDING'
  | 'AML_COMPLETE'
  | 'ENGAGEMENT_LETTER_SENT'
  | 'ENGAGEMENT_LETTER_SIGNED'
  | 'INFO_REQUESTED'
  | 'INFO_RECEIVED'
  | 'ONBOARDING_SETUP'
  | 'KICKOFF_SENT'
  | 'MILESTONE_CHECK_IN'
  | 'SATISFACTION_CHECK';

export interface ClientAddress {
  line1?: string;
  line2?: string;
  city?: string;
  postcode?: string;
  country?: string;
}

export interface CreateClientPayload {
  name: string;
  companyType: CompanyType | string;
  contactEmail: string;
  contactPhone?: string;
  contactName?: string;
  companyNumber?: string;
  utr?: string;
  vatNumber?: string;
  vatRegistered?: boolean;
  address?: ClientAddress;
  industry?: string;
  employeeCount?: number;
  turnover?: number;
  yearEnd?: string;
  mtditsaIncome?: number;
  notes?: string;
  tags?: string[];
  clientRelationship?: ClientRelationship;
}

export type UpdateClientPayload = Partial<CreateClientPayload> & {
  contactName?: string | null;
  contactPhone?: string | null;
  companyNumber?: string | null;
  utr?: string | null;
  vatNumber?: string | null;
  industry?: string | null;
  yearEnd?: string | null;
  notes?: string | null;
  clientRelationship?: ClientRelationship;
  lifecycleStage?: ClientLifecycleStage;
  touchpointsPaused?: boolean;
  marketingConsent?: boolean;
  nextVatDueDate?: string | null;
  nextAccountsDueDate?: string | null;
};

export interface ClientListParams {
  search?: string;
  companyType?: CompanyType | string;
  mtditsaStatus?: MTDITSAStatus | string;
  lifecycleStage?: ClientLifecycleStage | string;
  page?: number | string;
  limit?: number | string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc' | string;
}

export interface ClientRecord {
  id: string;
  tenantId?: string;
  name: string;
  companyType: CompanyType | string;
  contactEmail: string;
  contactPhone?: string | null;
  contactName?: string | null;
  companyNumber?: string | null;
  utr?: string | null;
  vatNumber?: string | null;
  vatRegistered?: boolean;
  address?: ClientAddress | string | null;
  industry?: string | null;
  employeeCount?: number | null;
  turnover?: number | null;
  yearEnd?: string | null;
  mtditsaIncome?: number | null;
  mtditsaStatus?: MTDITSAStatus | string;
  mtditsaEligible?: boolean;
  notes?: string | null;
  tags?: string[];
  clientRelationship?: ClientRelationship;
  lifecycleStage?: ClientLifecycleStage;
  touchpointsPaused?: boolean;
  marketingConsent?: boolean;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  _count?: { proposals?: number };
}

export type MtdIncomeSourceType = 'SELF_EMPLOYMENT' | 'PROPERTY' | 'PARTNERSHIP' | 'OTHER';

export interface MtdIncomeSource {
  type: MtdIncomeSourceType;
  amount: number;
}

export interface MtdItsaAssessmentResult {
  status: MTDITSAStatus | string;
  isRequired?: boolean;
  message?: string;
}
