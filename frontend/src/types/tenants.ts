/** Tenant signup, settings, and onboarding API types — aligned with backend Zod schemas. */

export type ProfessionalBody =
  | 'ACCA'
  | 'ICAEW'
  | 'ICAS'
  | 'CIMA'
  | 'AAT'
  | 'ATT'
  | 'CIOT'
  | 'CPAA'
  | 'CTA'
  | 'OTHER';

export type VatRate = 'ZERO' | 'REDUCED_5' | 'STANDARD_20' | 'EXEMPT';

export type GoverningLaw = 'England and Wales' | 'Scotland' | 'Northern Ireland';

export type EmailProvider = 'smtp' | 'gmail' | 'outlook' | 'microsoft365';

export type ProposalTermsSource = 'engage_default' | 'custom';

export type WebhookFormat = 'default' | 'hubspot' | 'zapier' | 'senta' | 'karbon';

export interface TenantAddress {
  line1: string;
  line2?: string;
  city: string;
  postcode: string;
  country: string;
}

export interface TenantVatSettings {
  vatRegistered?: boolean;
  vatNumber?: string;
  defaultVatRate?: VatRate | string;
  autoApplyVat?: boolean;
}

export interface TenantBrandingSettings {
  name?: string;
  logo?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

export interface TenantSmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

export interface TenantOAuthMailboxSettings {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  user: string;
}

export interface TenantEmailSettings {
  provider?: EmailProvider;
  fromName?: string;
  fromEmail?: string;
  smtp?: TenantSmtpSettings;
  gmail?: TenantOAuthMailboxSettings;
  outlook?: TenantOAuthMailboxSettings;
}

export interface TenantNotificationSettings {
  proposalAccepted?: boolean;
  proposalViewed?: boolean;
  mtditsaDeadlines?: boolean;
  weeklySummary?: boolean;
}

export interface TenantProposalSettings {
  defaultExpiryDays?: number;
  chaseSequenceDays?: number[];
  chaseSequenceEnabled?: boolean;
  renewalReminderDays?: number;
  defaultPaymentTermsDays?: number;
  cancellationNoticeDays?: number;
  termsSource?: ProposalTermsSource;
  customTerms?: string | null;
  benchmarksOptIn?: boolean;
  blockSendUntilAmlCleared?: boolean;
  /** Legacy flag still read by some UI paths */
  useCustomTerms?: boolean;
}

export interface TenantPaymentSettings {
  collectPaymentAtSign?: boolean;
  allowDirectDebit?: boolean;
  allowCard?: boolean;
}

export interface TenantWhiteLabelSettings {
  customDomain?: string;
  hideCapstoneBranding?: boolean;
  portalTitle?: string;
}

export interface TenantIntegrationsSettings {
  webhookUrl?: string;
  webhookFormat?: WebhookFormat;
}

export interface ClaraOnboardingProfile {
  practiceSize?: string;
  clientTypes?: string[];
  mtdStatus?: string;
}

export interface TenantSignupSettings {
  defaultCurrency?: string;
  vatRegistered?: boolean;
  professionalBody?: ProfessionalBody | string;
  companyRegistration?: string;
  vatNumber?: string;
  address?: TenantAddress;
}

export interface CreateTenantPayload {
  subdomain: string;
  name: string;
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
  adminPassword: string;
  primaryColor?: string;
  settings?: TenantSignupSettings;
}

export interface CreateTenantUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface CreateTenantRecord {
  id: string;
  subdomain: string;
  name: string;
  primaryColor: string;
  settings?: TenantSignupSettings | Record<string, unknown>;
}

export interface CreateTenantResponse {
  /** Always true now — signup requires email verification before first sign-in */
  requiresVerification?: boolean;
  email?: string;
  /** Legacy authenticated-signup fields (no longer returned) */
  csrfToken?: string;
  tenant?: CreateTenantRecord;
  user?: CreateTenantUser;
  token?: string;
}

export interface SubdomainAvailability {
  available: boolean;
  subdomain?: string;
  reason?: string;
}

export interface OnboardingStep {
  id: string;
  label: string;
  completed: boolean;
}

export interface OnboardingStatus {
  steps: OnboardingStep[];
}

/** Clara autopilot (R5.1) — agentic drafting config, default OFF */
export interface TenantClaraSettings {
  agenticDraftingEnabled?: boolean;
  draftRegulatoryFamilies?: string[];
  draftRenewals?: boolean;
  renewalUpliftPercent?: number;
  useAiCoverLetter?: boolean;
  draftOwnerUserId?: string | null;
  maxDraftsPerRun?: number;
}

/** Full settings document returned by GET /tenants/settings */
export interface TenantSettingsRecord {
  vat?: TenantVatSettings;
  branding?: TenantBrandingSettings;
  email?: TenantEmailSettings;
  notifications?: TenantNotificationSettings;
  proposals?: TenantProposalSettings;
  payments?: TenantPaymentSettings;
  professionalBody?: ProfessionalBody | string;
  companyRegistration?: string;
  phone?: string;
  website?: string;
  address?: TenantAddress;
  insurerName?: string;
  governingLaw?: GoverningLaw | string;
  fcaAuthorised?: boolean;
  privacyPolicyUrl?: string;
  termsVersion?: string;
  whiteLabel?: TenantWhiteLabelSettings;
  integrations?: TenantIntegrationsSettings;
  webhookUrl?: string;
  claraOnboarding?: ClaraOnboardingProfile;
  clara?: TenantClaraSettings;
  defaultCurrency?: string;
}

/** PUT /tenants/settings body — matches backend update schema plus frontend-only keys */
export interface UpdateTenantSettingsPayload {
  vat?: TenantVatSettings;
  branding?: TenantBrandingSettings;
  email?: TenantEmailSettings;
  notifications?: TenantNotificationSettings;
  proposals?: TenantProposalSettings;
  payments?: TenantPaymentSettings;
  professionalBody?: ProfessionalBody | string;
  companyRegistration?: string;
  phone?: string;
  website?: string;
  address?: TenantAddress;
  insurerName?: string;
  governingLaw?: GoverningLaw | string;
  fcaAuthorised?: boolean;
  privacyPolicyUrl?: string;
  termsVersion?: string;
  whiteLabel?: TenantWhiteLabelSettings;
  /** Stored in settings JSON; used by webhook settings UI */
  integrations?: TenantIntegrationsSettings;
  webhookUrl?: string;
  claraOnboarding?: ClaraOnboardingProfile;
  clara?: TenantClaraSettings;
}

export interface UpdateTenantSettingsResult {
  vat?: TenantVatSettings;
  branding?: TenantBrandingSettings;
}

export interface DefaultProposalTerms {
  preview?: string;
  template?: string;
}

export interface TestIntegrationWebhookPayload {
  format?: WebhookFormat;
}

export interface TestIntegrationWebhookResult {
  delivered?: boolean;
  webhookUrl?: string;
}
