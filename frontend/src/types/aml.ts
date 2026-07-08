/** AML, regulatory, and public onboarding API types. */

export type AmlProvider = 'smartsearch' | 'creditsafe' | 'stub';
export type AmlStatus = 'NOT_STARTED' | 'PENDING' | 'CLEAR' | 'REFER' | 'FAILED';
export type RegulatoryRuleSeverity = 'info' | 'warning' | 'action_required';

export interface InitiateAmlCheckPayload {
  clientId: string;
  provider?: AmlProvider;
}

export interface AmlCheckResult {
  clientId: string;
  amlStatus: AmlStatus;
  amlProviderRef: string;
  provider: AmlProvider;
  isStub: boolean;
  message: string;
  webhookUrl: string;
}

export interface AmlPartnerConfig {
  mode: 'live' | 'demo';
  partnerConfigured: boolean;
  availableProviders: AmlProvider[];
  smartsearchConfigured: boolean;
  creditsafeConfigured: boolean;
}

export interface AmlClientStatus {
  clientId: string;
  amlStatus: AmlStatus;
  amlProviderRef: string | null;
  amlCheckedAt: string | null;
  amlCompletedAt: string | null;
  amlSubmittedAt: string | null;
  lifecycleStage: string;
  provider: AmlProvider | null;
  mode: 'live' | 'demo';
  lastCheckMessage: string | null;
  partnerConfigured: boolean;
  config: AmlPartnerConfig;
}

export interface RegulatoryRule {
  id: string;
  title: string;
  description: string;
  severity: RegulatoryRuleSeverity;
  category: 'mtd_itsa' | 'vat' | 'compliance';
  effectiveFrom?: string;
  threshold?: number;
  source: string;
}

export interface RegulatoryCheckResult {
  clientId: string;
  assessedAt: string;
  incomeUsed: number;
  rules: RegulatoryRule[];
  summary: { actionRequired: number; warnings: number; info: number };
}

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
  | 'SATISFACTION_CHECK'
  | 'ONGOING'
  | 'ANNUAL_REVIEW';

export type AmlIdDocumentType = 'PASSPORT' | 'DRIVING_LICENCE' | 'OTHER';

export interface AmlOnboardingFileRef {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface AmlOnboardingExistingSubmission {
  idDocumentType: AmlIdDocumentType;
  idDocumentTypeOther?: string;
  fullLegalName: string;
  dateOfBirth: string;
  registeredAddress: string;
  nationality: string;
  sourceOfFunds: string;
  isPep: boolean;
  pepDetails?: string;
  photoIdDocument: AmlOnboardingFileRef | null;
  proofOfAddressDocument: AmlOnboardingFileRef | null;
  submittedAt?: string;
}

export interface AmlOnboardingContext {
  client: { name: string; contactName: string | null };
  practice: { name: string; primaryColor: string | null; logo: string | null };
  lifecycleStage: ClientLifecycleStage;
  amlSubmittedAt: string | null;
  amlCompletedAt: string | null;
  existingSubmission: AmlOnboardingExistingSubmission | null;
}

export interface AmlOnboardingFileUpload {
  fileName: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
  data: string;
}

export interface SubmitAmlOnboardingPayload {
  idDocumentType: AmlIdDocumentType;
  idDocumentTypeOther?: string;
  fullLegalName: string;
  dateOfBirth: string;
  registeredAddress: string;
  nationality: string;
  sourceOfFunds: string;
  isPep: boolean;
  pepDetails?: string;
  photoIdDocument: AmlOnboardingFileUpload;
  proofOfAddressDocument: AmlOnboardingFileUpload;
  confirmAccurate: true;
}

export interface SubmitAmlOnboardingResult {
  message: string;
  amlSubmittedAt: string;
}
