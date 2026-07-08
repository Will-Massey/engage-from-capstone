/** Touchpoint templates, approvals, and client lifecycle automation API types. */

import type { ClientRecord } from './clients';

export type TouchpointLifecycleStage =
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
  | 'SATISFACTION_CHECK'
  | 'ONGOING'
  | 'ANNUAL_REVIEW';

export type TouchpointTone = 'WARM' | 'NEUTRAL' | 'URGENT';

export type TouchpointStatus = 'PENDING' | 'SENT' | 'SKIPPED' | 'PAUSED';

export type TouchpointTriggerType = 'EVENT' | 'TIME_DELAY';

export type TouchpointChannel = 'EMAIL' | 'SMS' | 'IN_APP';

export interface UpsertTouchpointTemplatePayload {
  subject?: string;
  body?: string;
  tone?: TouchpointTone | string;
  isMarketing?: boolean;
  isActive?: boolean;
}

export interface TouchpointTemplateRecord {
  id: string;
  tenantId: string;
  stage: TouchpointLifecycleStage | string;
  subject: string;
  body: string;
  tone: TouchpointTone | string;
  isMarketing: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SeedTouchpointDefaultsPayload {
  resetAll?: boolean;
}

export interface TouchpointSeedResult {
  created: number;
  updated: number;
  skipped: number;
  total: number;
}

export interface TouchpointApprovalClientSummary {
  id: string;
  name: string;
  contactEmail?: string | null;
}

export interface TouchpointApprovalTemplateSummary {
  subject: string;
  tone?: TouchpointTone | string;
}

export interface TouchpointApprovalRecord {
  id: string;
  clientId: string;
  stage: TouchpointLifecycleStage | string;
  scheduledFor: string;
  status: TouchpointStatus | string;
  requiresHumanApproval: boolean;
  client: TouchpointApprovalClientSummary;
  template?: TouchpointApprovalTemplateSummary | null;
}

export interface ClientTouchpointSettingsPayload {
  touchpointsPaused?: boolean;
  marketingConsent?: boolean;
  lifecycleStage?: TouchpointLifecycleStage | string;
}

export interface TouchpointEngineRunResult {
  checked: number;
  sent: number;
  skipped: number;
  errors: number;
  humanApprovalQueued: number;
}

export interface TouchpointTemplateSummary {
  subject: string;
  body: string;
  tone: TouchpointTone | string;
}

export interface ClientTouchpointRecord {
  id: string;
  clientId: string;
  stage: TouchpointLifecycleStage | string;
  triggerType: TouchpointTriggerType | string;
  scheduledFor: string;
  status: TouchpointStatus | string;
  channel: TouchpointChannel | string;
  templateId?: string | null;
  sentAt?: string | null;
  requiresHumanApproval: boolean;
  notes?: string | null;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
  template?: TouchpointTemplateSummary | null;
}

export type ClientTouchpointSettingsResult = ClientRecord;
