/** Cover letter and proposal template API types — aligned with backend Zod schemas. */

import type { AiCoverLetterTone } from './ai';

export type CoverLetterTemplateTone = AiCoverLetterTone;

export interface CoverLetterTemplateRecord {
  id: string;
  tenantId: string;
  name: string;
  tone: CoverLetterTemplateTone;
  content: string;
  isDefault: boolean;
  isSystem: boolean;
  createdById?: string | null;
  engagementLibraryVersionId?: string | null;
  needsUpdate?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCoverLetterTemplatePayload {
  name: string;
  tone: CoverLetterTemplateTone;
  content: string;
  isDefault?: boolean;
}

export type UpdateCoverLetterTemplatePayload = Partial<CreateCoverLetterTemplatePayload>;

export interface CoverLetterMergeField {
  key: string;
  description: string;
  example: string;
}

/** POST cover-letter preview body — aligned with backend previewSchema */
export interface CoverLetterPreviewPayload {
  clientName?: string;
  companyName?: string;
  servicesSummary?: string;
  discussionDate?: string;
  tenantName?: string;
  firmExperience?: string;
  sectorOrRegion?: string;
  firmCredentials?: string;
  keyOutcome?: string;
  senderName?: string;
  senderPosition?: string;
  serviceCount?: number;
  monthlyTotal?: string;
  proposalReference?: string;
  proposalTitle?: string;
}

export interface CoverLetterPreviewResult {
  original: string;
  rendered: string;
}

export interface DeleteCoverLetterTemplateResult {
  message: string;
}

export interface ProposalTemplateServiceConfigItem {
  serviceId: string;
  name?: string;
  description?: string | null;
  billingFrequency: string;
  displayPrice: number;
  quantity?: number;
  discountPercent?: number;
}

export interface ProposalTemplateDefaultPricing {
  coverLetterTone?: string;
}

export interface ProposalTemplateSummary {
  id: string;
  name: string;
  description?: string | null;
  title: string;
  targetEntityType?: string | null;
  usageCount?: number | null;
  lastUsedAt?: string | null;
  updatedAt: string;
  serviceCount: number;
  coverLetterTone?: string;
  isLibraryTemplate?: boolean;
  needsUpdate?: boolean;
  engagementLibraryVersion?: { versionLabel: string } | null;
}

export interface ProposalTemplatesMeta {
  expectedLibraryCount: number;
  libraryActive: number;
  customActive: number;
  totalActive: number;
  catalogueActive: number;
  libraryComplete: boolean;
}

export interface ProposalTemplateRecord {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  title: string;
  coverLetter?: string | null;
  terms?: string | null;
  targetEntityType?: string | null;
  targetIndustry?: string | null;
  serviceConfig: ProposalTemplateServiceConfigItem[];
  defaultPricing: ProposalTemplateDefaultPricing;
  usageCount?: number | null;
  lastUsedAt?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
  needsUpdate?: boolean;
  createdById?: string | null;
  engagementLibraryVersionId?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Raw Prisma row returned by create / from-proposal before serviceConfig is parsed */
export interface ProposalTemplateCreatedRecord {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  title: string;
  coverLetter?: string | null;
  terms?: string | null;
  targetEntityType?: string | null;
  serviceConfig: string;
  defaultPricing: string;
  usageCount?: number | null;
  isDefault?: boolean;
  isActive?: boolean;
  needsUpdate?: boolean;
  createdById?: string | null;
  engagementLibraryVersionId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProposalTemplatePayload {
  name: string;
  description?: string;
  title: string;
  coverLetter?: string;
  coverLetterTone?: string;
  serviceConfig: ProposalTemplateServiceConfigItem[];
  targetEntityType?: string;
}

export type UpdateProposalTemplatePayload = Partial<CreateProposalTemplatePayload>;

export interface SaveProposalTemplateFromProposalPayload {
  proposalId: string;
  name: string;
  description?: string;
}