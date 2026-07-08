/** Clara AI API types — aligned with backend Zod schemas and service return shapes. */

export type AiCoverLetterTone = 'PROFESSIONAL' | 'FRIENDLY' | 'MODERN';
export type AiFollowUpTone = 'professional' | 'friendly' | 'urgent';
export type AiQuickMode = 'ask' | 'health' | 'follow_up' | 'suggest_services';
export type AiCommandAction =
  | 'navigate'
  | 'suggest_services'
  | 'proposal_health'
  | 'renewal_draft'
  | 'follow_up'
  | 'create_proposal'
  | 'answer';

export interface AiServiceLineItem {
  name: string;
  billingFrequency?: string;
  displayPrice?: number;
}

export interface AiTokenBudgetStatus {
  budgetMonthly: number;
  usedThisMonth: number;
  remaining: number;
  withinBudget: boolean;
  aiCallsThisMonth: number;
  callsWithLoggedTokens: number;
  callsEstimated: number;
}

export interface AiAssistantMeta {
  name: string;
  tagline: string;
  status: 'ready' | 'unavailable';
}

export interface AiFeatureFlags {
  benchmarkPricing: boolean;
  regulatoryWatcher: boolean;
}

export interface AiStatusResult {
  configured: boolean;
  assistant: AiAssistantMeta;
  features: string[];
  featureFlags: AiFeatureFlags;
  tokenBudget: AiTokenBudgetStatus;
  usageSummary: string;
}

export interface AiEmptySuggestionResult {
  tip: string;
}

export interface AiServiceSuggestion {
  serviceId: string;
  name: string;
  billingFrequency: string;
  displayPrice: number;
  rationale: string;
  category: string;
}

export interface AiSuggestServicesResult {
  suggestions: AiServiceSuggestion[];
  summary: string;
  contractStartNote?: string;
  validUntilDays: number;
}

export interface AiDraftReviewPayload {
  clientId: string;
  title?: string;
  coverLetter?: string;
  validUntil?: string;
  terms?: string;
  services: AiServiceLineItem[];
}

export interface AiDraftReviewResult {
  healthScore: number;
  summary: string;
  recommendedActions: string[];
  readyToSend: boolean;
}

export interface AiSuggestTitlePayload {
  clientId?: string;
  clientName?: string;
  services: Array<{ name: string; billingFrequency?: string }>;
}

export interface AiSuggestTitleResult {
  title: string;
}

export interface AiCoverLetterPayload {
  clientId: string;
  tone: AiCoverLetterTone;
  practiceName: string;
  senderName?: string;
  services: AiServiceLineItem[];
}

export interface AiCoverLetterResult {
  content: string;
  requiresApproval: true;
}

export interface AiFollowUpResult {
  subject: string;
  body: string;
  suggestedSendInDays?: number;
  requiresApproval: true;
  proposalId: string;
}

export interface AiEngagementLetterPayload {
  proposalId: string;
  includeAiIntro?: boolean;
}

export interface AiEngagementLetterResult {
  content: string;
  clauseIds: string[];
  requiresApproval: true;
}

export interface ProposalHealthSignals {
  status: string;
  daysSinceSent: number | null;
  daysUntilExpiry: number;
  viewCount: number;
  totalViewMinutes: number;
  expired: boolean;
  expiringSoon: boolean;
  noViews: boolean;
  stuck: boolean;
}

export interface ProposalHealthResult {
  healthScore: number;
  signals: ProposalHealthSignals;
  summary: string;
  recommendedActions: string[];
}

export interface AiRenewalServiceLine {
  serviceId: string | null;
  name: string;
  billingFrequency: string;
  displayPrice: number;
  quantity: number;
  discountPercent: number;
}

export interface AiRenewalDraftResult {
  title: string;
  clientId: string;
  validUntil: string;
  coverLetter: string;
  renewalNarrative: string;
  upliftPercent: number;
  services: AiRenewalServiceLine[];
  originalProposalId: string;
  requiresApproval: true;
}

export interface AiCommandContext {
  proposalId?: string;
  clientId?: string;
}

export interface AiCommandResult {
  action: AiCommandAction | string;
  message: string;
  params?: Record<string, unknown>;
}

export interface AiQuickContext {
  proposalId?: string;
  clientId?: string;
  page?: string;
}

export interface AiQuickPayload {
  mode: AiQuickMode;
  query?: string;
  context?: AiQuickContext;
}

export interface AiQuickAnswerResult {
  message: string;
  action: 'answer';
  params?: Record<string, unknown>;
  data?: unknown;
}

export interface AiQuickSuggestServicesResult {
  message: string;
  action: 'suggest_services';
  params?: { clientId?: string };
  data?: AiSuggestServicesResult;
}

export type AiQuickResult = AiQuickAnswerResult | AiQuickSuggestServicesResult;

export interface AiFeedbackPayload {
  feature: string;
  helpful: boolean;
  comment?: string;
  proposalId?: string;
}

export interface AiFeedbackResult {
  recorded: true;
}

export interface AiProposalEmailDraftInput {
  clientId: string;
  title?: string;
  reference?: string;
  coverLetter?: string;
  validUntil?: string;
  viewLink?: string;
  services: AiServiceLineItem[];
  senderName?: string;
  senderEmail?: string;
  practiceName?: string;
}

export type AiProposalEmailDraftPayload = { proposalId: string } | AiProposalEmailDraftInput;

export interface AiProposalSendEmailResult {
  subject: string;
  htmlBody: string;
  textBody: string;
  requiresApproval: true;
}

export interface AiEmailContext {
  clientName?: string;
  proposalTitle?: string;
  tenantName?: string;
  proposalId?: string;
  clientId?: string;
  draft?: AiProposalEmailDraftInput;
}

export interface AiRevisePayload {
  currentBody: string;
  instruction: string;
  context?: AiEmailContext;
}

export interface AiReviseResult {
  revisedBody: string;
}

export interface AiProposalExplanationService {
  name: string;
  description?: string;
  billingFrequency?: string;
  billingCycle?: string;
}

export interface AiProposalExplanationPayload {
  clientId: string;
  title: string;
  services: AiProposalExplanationService[];
  monthlyTotal?: number;
  annualTotal?: number;
  contractTotal?: number;
}

export interface AiProposalExplanationResult {
  explanation: string;
}

export interface AiSuggestEmailSubjectsResult {
  subjects: string[];
}

export interface AiSuggestEmailCtasResult {
  ctas: string[];
}

export interface AiAnalyzeEmailResult {
  issues: string[];
  score?: number;
  missing: string[];
}

export interface AiProposalEmailStreamEvent {
  subject?: string;
  bodyChunk?: string;
  textBody?: string;
  done?: boolean;
  error?: string;
}

export interface AiCompaniesHouseContext {
  companyNumber: string;
  companyName: string;
  companyStatus: string;
  companyType: string;
  dateOfCreation: string;
  registeredOfficeAddress?: string;
  sicCodes?: string[];
  accountsNextDue?: string;
}

export interface AiClientBriefResult {
  brief: string;
  highlights: string[];
  companiesHouse?: AiCompaniesHouseContext;
  requiresApproval: true;
}

export interface AiAutoFitServiceSuggestion {
  serviceId: string;
  name: string;
  billingFrequency: string;
  displayPrice: number;
  rationale: string;
}

export interface AiAutoFitResult {
  suggestedTitle: string;
  services: AiAutoFitServiceSuggestion[];
  coverLetterTone: AiCoverLetterTone;
  coverLetterDraft: string;
  pricingNotes: string;
  validUntilDays: number;
}

export interface RegulatoryAlert {
  id: string;
  ruleCode: string;
  title: string;
  summary: string;
  severity: 'info' | 'warning' | 'critical';
  affectedProposalCount: number;
  effectiveFrom?: string;
  proposalIds?: string[];
}

export interface AiRegulatoryAlertsResult {
  alerts: RegulatoryAlert[];
  scannedAt: string;
  proposalCount: number;
}

export interface AiAttentionQueueItem {
  proposalId: string;
  reference: string;
  title: string;
  clientName: string;
  status: string;
  priorityScore: number;
  reason: string;
  narrative: string;
  recommendedAction: string;
}

export interface AiAttentionQueueResult {
  items: AiAttentionQueueItem[];
  generatedAt: string;
}

/** Stored in tenant settings — GET /ai/voice-of-practice is not wired yet; shape matches voiceOfPracticeService. */
export interface VoiceOfPracticeSettings {
  sampleText?: string;
  styleHints?: string;
  updatedAt?: string;
  updatedByUserId?: string;
}

export interface AiVoiceProposalServiceSuggestion {
  name: string;
  billingFrequency: string;
  displayPrice?: number;
  rationale: string;
}

export interface AiVoiceProposalResult {
  title: string;
  coverLetterTone: AiCoverLetterTone;
  coverLetter: string;
  suggestedServices: AiVoiceProposalServiceSuggestion[];
  clarifyingQuestions: string[];
}
