import { lazy, type LazyExoticComponent, type ComponentType } from 'react';

/** Client-facing routes — must not pull the staff app builder into the initial chunk. */
export const PublicProposalView = lazy(() => import('../pages/public/ProposalView'));
export const ClientPortal = lazy(() => import('../pages/public/ClientPortal'));
export const AmlOnboarding = lazy(() => import('../pages/public/AmlOnboarding'));

/** Auth */
export const Login = lazy(() => import('../pages/auth/Login'));
export const Onboarding = lazy(() => import('../pages/auth/Onboarding'));
export const ForgotPassword = lazy(() => import('../pages/auth/ForgotPassword'));
export const ResetPassword = lazy(() => import('../pages/auth/ResetPassword'));
export const VerifyEmail = lazy(() => import('../pages/auth/VerifyEmail'));
export const TwoFactorSetup = lazy(() => import('../pages/auth/TwoFactorSetup'));

/** Staff dashboard shell pages */
export const Dashboard = lazy(() => import('../pages/Dashboard'));
export const Proposals = lazy(() => import('../pages/proposals/Proposals'));
export const ProposalDetail = lazy(() => import('../pages/proposals/ProposalDetail'));
export const JobsBoard = lazy(() => import('../pages/jobs/JobsBoard'));
export const JobDetail = lazy(() => import('../pages/jobs/JobDetail'));
export const Workload = lazy(() => import('../pages/jobs/Workload'));
export const PracticeLetters = lazy(() => import('../pages/letters/PracticeLetters'));
export const PracticeAutomations = lazy(() => import('../pages/automations/PracticeAutomations'));
export const FirmInbox = lazy(() => import('../pages/inbox/FirmInbox'));
export const PracticeForms = lazy(() => import('../pages/forms/PracticeForms'));
export const DocumentsHub = lazy(() => import('../pages/documents/DocumentsHub'));
export const AccountFlowSandbox = lazy(() => import('../pages/integrations/AccountFlowSandbox'));
export const IntegrationsHub = lazy(() => import('../pages/integrations/IntegrationsHub'));
export const Clients = lazy(() => import('../pages/clients/Clients'));
export const ClientDetail = lazy(() => import('../pages/clients/ClientDetail'));
export const ClientImport = lazy(() => import('../pages/clients/ClientImport'));
export const Services = lazy(() => import('../pages/services/Services'));
export const ServiceDetail = lazy(() => import('../pages/services/ServiceDetail'));
export const ProposalTemplates = lazy(() => import('../pages/templates/ProposalTemplates'));
export const NotFound = lazy(() => import('../pages/NotFound'));
export const Status = lazy(() => import('../pages/Status'));

/** Proposal builder cluster */
export const BulkRenewalWizard = lazy(() => import('../pages/proposals/BulkRenewalWizard'));
export const FirstProposalWizardPage = lazy(
  () => import('../pages/proposals/FirstProposalWizardPage')
);
export const CreateProposal = lazy(() => import('../pages/proposals/CreateProposal'));
export const WizardProposal = lazy(() => import('../pages/proposals/WizardProposal'));
export const EditProposal = lazy(() => import('../pages/proposals/EditProposal'));
export const CreateClient = lazy(() => import('../pages/clients/CreateClient'));
export const PricingCalculatorPage = lazy(() => import('../pages/pricing/PricingCalculatorPage'));

/** Settings, billing, analytics */
export const Settings = lazy(() => import('../pages/Settings'));
export const Subscription = lazy(() => import('../pages/Subscription'));
export const Analytics = lazy(() => import('../pages/Analytics'));
export const PartnerProgramme = lazy(() => import('../pages/PartnerProgramme'));
export const SwitchFromEngager = lazy(() => import('../pages/gtm/SwitchFromEngager'));
export const TrustPack = lazy(() => import('../pages/gtm/TrustPack'));

/** Legal (public) */
export const TermsOfService = lazy(() => import('../pages/legal/TermsOfService'));
export const PaymentCollectionTerms = lazy(() => import('../pages/legal/PaymentCollectionTerms'));
export const ClientPaymentAuthorisation = lazy(
  () => import('../pages/legal/ClientPaymentAuthorisation')
);
export const PrivacyPolicy = lazy(() => import('../pages/legal/PrivacyPolicy'));
export const AiDisclosure = lazy(() => import('../pages/legal/AiDisclosure'));
export const Soc2Controls = lazy(() => import('../pages/legal/Soc2Controls'));

/** Every route page in App.tsx — used by tests to ensure lazy coverage stays complete. */
export const ROUTE_LAZY_PAGES: Record<string, LazyExoticComponent<ComponentType<unknown>>> = {
  Login,
  Onboarding,
  ForgotPassword,
  ResetPassword,
  VerifyEmail,
  TwoFactorSetup,
  Dashboard,
  Proposals,
  JobsBoard,
  JobDetail,
  Workload,
  PracticeLetters,
  PracticeAutomations,
  FirmInbox,
  PracticeForms,
  DocumentsHub,
  AccountFlowSandbox,
  IntegrationsHub,
  BulkRenewalWizard,
  FirstProposalWizardPage,
  ProposalDetail,
  CreateProposal,
  WizardProposal,
  EditProposal,
  Clients,
  ClientDetail,
  ClientImport,
  CreateClient,
  Services,
  ServiceDetail,
  PricingCalculatorPage,
  ProposalTemplates,
  Settings,
  Subscription,
  Analytics,
  PartnerProgramme,
  SwitchFromEngager,
  TrustPack,
  NotFound,
  Status,
  PublicProposalView,
  ClientPortal,
  AmlOnboarding,
  TermsOfService,
  PaymentCollectionTerms,
  ClientPaymentAuthorisation,
  PrivacyPolicy,
  AiDisclosure,
  Soc2Controls,
};
