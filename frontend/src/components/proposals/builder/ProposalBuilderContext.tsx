/**
 * ProposalBuilderProvider — owns every piece of proposal-builder state, all effects,
 * handlers, and derived values. Extracted verbatim from the ProposalBuilder monolith;
 * the context value is a plain object literal recreated each render, preserving the
 * monolith's re-render semantics.
 */

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  createContext,
  useContext,
  type Dispatch,
  type ReactElement,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { useNavigate, useSearchParams, type NavigateFunction } from 'react-router-dom';
import { apiClient } from '../../../utils/api';
import { useAuthStore, type Tenant, type User } from '../../../stores/authStore';
import {
  generateDefaultCoverLetter,
  generateCoverLetterForTone,
  type CoverLetterTone,
  getStyleByTone,
} from '../../../data/defaultCoverLetter';
import { toast } from 'react-hot-toast';
import BillingCadenceSelector from '../BillingCadenceSelector';
import {
  convertPriceBetweenCadences,
  parseFrequencyOptions,
  type BillingCadence,
} from '../../../utils/billingCadence';
import { format, isValid, parseISO, addDays } from 'date-fns';
import {
  ArrowUpIcon,
  ArrowDownIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { getBuilderPreviewPreference, setBuilderPreviewPreference } from '../builderPreviewStorage';
import {
  DEFAULT_PRICING_TIERS,
  parseProposalCustomFields,
  type PricingTier,
} from '../../../utils/proposalCustomFields';
import { showAiError } from '../../ai/AiPanel';
import type { AutoFitResult } from '../../ai/AutoFitBanner';
import type { ProposalEmailDraftInput } from '../../ai/ProposalEmailPreviewDialog';
import {
  loadPricingSuggestion,
  clearPricingSuggestion,
} from '../../../utils/pricingSuggestionStorage';
import { AI_COPILOT } from '../../../config/aiCopilot';
import {
  annualEquivalentFor,
  calculateLineItem,
  monthlyEquivalentFor,
  vatAmountFor,
  type BillingFrequency,
} from '@shared/pricingEngine';
import { calculateProposalSummaryBands } from '@shared/proposalSummary';
import { resolveCatalogBillingCycle } from '@shared/serviceBilling';
import {
  type BuildMode,
  type ProposalDraft,
  type ProposalTemplateSummary,
  LEGACY_NEW_DRAFT_KEY,
  proposalDraftKey,
  parseDecimalInput,
  isValidDecimalDraft,
} from '../proposalBuilderDraft';
import {
  coverLetterAddressee,
  formatCurrency,
  type Client,
  type PricingSummary,
  type SelectedService,
  type Service,
} from './shared';
import {
  buildProposalSavePayload,
  buildSelectedServiceLine,
  collectProposalValidationErrors,
  isServiceLineAlreadySelected,
  newSelectedLineId,
} from './proposalBuilderActions';

const BILLING_FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: 'week',
  MONTHLY: 'month',
  QUARTERLY: 'quarter',
  ANNUALLY: 'year',
  ONE_TIME: 'one-time',
};

function periodLabelSentenceCase(freq: string): string {
  switch (freq) {
    case 'WEEKLY':
      return 'Weekly';
    case 'MONTHLY':
      return 'Monthly';
    case 'QUARTERLY':
      return 'Quarterly';
    case 'ANNUALLY':
      return 'Annual';
    case 'ONE_TIME':
      return 'One-time';
    default:
      return 'Monthly';
  }
}

/** Average monthly cash flow (inc VAT) for a recurring line; one-off → 0 */
function recurringMonthlyEquivalentIncVat(s: SelectedService): number {
  return monthlyEquivalentFor(s.grossTotal, s.billingCycle);
}

const formatDueDateLabel = (isoDate?: string): string | null => {
  if (!isoDate) return null;
  const normalized =
    isoDate.includes('T') || isoDate.length < 10 ? isoDate : `${isoDate.slice(0, 10)}T12:00:00`;
  const d = parseISO(normalized);
  if (!isValid(d)) return null;
  return format(d, 'd MMM yyyy');
};

const VAT_RATES = [0, 5, 20];

// Format price with frequency label
const formatPriceWithFrequency = (price: number, frequency: string): string => {
  const formatted = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);

  const label = BILLING_FREQUENCY_LABELS[frequency] || '';
  if (frequency === 'ONE_TIME') {
    return `${formatted} ${label}`;
  }
  return `${formatted}/${label}`;
};

const calculateAnnualEquivalent = (price: number, frequency: string): number =>
  annualEquivalentFor(price, frequency || 'MONTHLY');

// Approximate monthly cash flow (catalog list only — not mixed into proposal totals)
const calculateMonthlyEquivalent = (price: number, frequency: string): number =>
  monthlyEquivalentFor(price, frequency || 'MONTHLY');

// Format price for available services list (shows monthly equivalent for recurring)
const formatPriceForDisplay = (price: number, frequency: string): string => {
  if (frequency === 'ONE_TIME' || frequency === 'ANNUALLY') {
    return formatPriceWithFrequency(price, frequency);
  }
  const monthlyEquivalent = calculateMonthlyEquivalent(price, frequency);
  const formatted = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(monthlyEquivalent);
  return `${formatted}/month`;
};

/**
 * Everything the step components and the builder shell read from the provider.
 * Field-for-field this mirrors what the monolithic ProposalBuilder exposed to its
 * own step-render functions via closure.
 */
export interface ProposalBuilderContextValue {
  // Identity & environment
  proposalId?: string;
  isEditMode: boolean;
  navigate: NavigateFunction;
  tenant: Tenant | null;
  user: User | null;
  todayIso: string;

  // Stepper
  currentStep: number;
  setCurrentStep: Dispatch<SetStateAction<number>>;
  isLoading: boolean;

  // Step 1: client selection
  clients: Client[];
  clientSearch: string;
  setClientSearch: Dispatch<SetStateAction<string>>;
  selectedClient: Client | null;
  selectClient: (client: Client) => void;
  hasResumedDraft: boolean;
  restartProposal: (keepClient: boolean) => void;

  // Build mode & proposal templates
  buildMode: BuildMode;
  selectBuildMode: (mode: BuildMode) => void;
  proposalTemplates: ProposalTemplateSummary[];
  templatesLoading: boolean;
  selectedTemplateId: string | null;
  applyingTemplateId: string | null;
  applyProposalTemplate: (templateId: string) => Promise<void>;
  loadProposalTemplates: () => Promise<void>;
  saveTemplateDialog: { open: boolean; proposalId: string };
  setSaveTemplateDialog: Dispatch<SetStateAction<{ open: boolean; proposalId: string }>>;

  // Step 2: services
  categories: string[];
  selectedCategory: string;
  setSelectedCategory: Dispatch<SetStateAction<string>>;
  serviceSearch: string;
  setServiceSearch: Dispatch<SetStateAction<string>>;
  filteredServices: Service[];
  selectedServices: SelectedService[];
  renderServiceRow: (service: Service) => ReactElement;
  renderSelectedServiceRow: (service: SelectedService) => ReactElement;
  taxServiceLines: { id: string; name: string }[];
  applyContingentFeeToLine: (lineId: string, feeGbp: number, explanation: string) => void;
  summary: PricingSummary;
  reviewMonthlyCostIncVat: number;
  includeVat: boolean;
  goToReviewStep: () => void;

  // Step 3: review & send
  proposalTitle: string;
  setProposalTitle: Dispatch<SetStateAction<string>>;
  coverLetter: string;
  setCoverLetter: Dispatch<SetStateAction<string>>;
  coverLetterLoading: boolean;
  coverLetterTone: CoverLetterTone;
  applyCoverLetterStyle: (tone: CoverLetterTone) => void;
  coverLetterCustomInstruction: string;
  setCoverLetterCustomInstruction: Dispatch<SetStateAction<string>>;
  applyingCoverLetterTweak: boolean;
  applyCoverLetterTweak: (instruction: string) => Promise<void>;
  contractStartDate: string;
  setContractStartDate: Dispatch<SetStateAction<string>>;
  validUntil: string;
  setValidUntil: Dispatch<SetStateAction<string>>;
  defaultExpiryDays: number;
  offerThreePackages: boolean;
  setOfferThreePackages: Dispatch<SetStateAction<boolean>>;
  pricingTiers: PricingTier[];
  setPricingTiers: Dispatch<SetStateAction<PricingTier[]>>;
  requireTwoSigners: boolean;
  setRequireTwoSigners: Dispatch<SetStateAction<boolean>>;
  proposalTerms: string;
  termsLoading: boolean;
  validationErrors: string[];
  saveProposal: () => Promise<void>;
  previewPdf: () => Promise<void>;

  // AI assistance (Clara)
  aiConfigured: boolean;
  aiSuggestLoading: boolean;
  aiSuggestions: any;
  runAiSuggestServices: () => Promise<void>;
  applySingleAiSuggestion: (serviceId: string) => void;
  applyTweakedAiSuggestion: (
    serviceId: string,
    tweaks: { billingFrequency: string; displayPrice: number }
  ) => void;
  aiCoverLoading: boolean;
  aiCoverDraft: string | null;
  setAiCoverDraft: Dispatch<SetStateAction<string | null>>;
  runAiCoverLetter: () => Promise<void>;

  // Clara auto-fit
  autoFitLoading: boolean;
  autoFitResult: AutoFitResult | null;
  setAutoFitResult: Dispatch<SetStateAction<AutoFitResult | null>>;
  autoFitDismissed: boolean;
  setAutoFitDismissed: Dispatch<SetStateAction<boolean>>;
  runAutoFitForClient: (clientId: string) => Promise<void>;
  applyAutoFitSection: (
    section: 'title' | 'services' | 'coverLetter' | 'pricing' | 'validUntil'
  ) => void;
  applyAllAutoFit: () => void;
  applyAutoFitService: (sug: {
    serviceId: string;
    name: string;
    billingFrequency: string;
    displayPrice: number;
  }) => void;
  applyTweakedAutoFitService: (
    sug: { serviceId: string; name: string },
    tweaks: { billingFrequency: string; displayPrice: number }
  ) => void;

  // Live preview & email
  showLivePreviewPane: boolean;
  toggleLivePreviewPane: (next?: boolean) => void;
  showEmailPreview: boolean;
  setShowEmailPreview: Dispatch<SetStateAction<boolean>>;
  emailDraftPayload: ProposalEmailDraftInput | undefined;
  previewServices: {
    name: string;
    description?: string;
    quantity: number;
    displayPrice: number;
    billingCycle: string;
    grossTotal: number;
  }[];
  claraServiceLines: { name: string; billingFrequency: string; displayPrice: number }[];
  showPreviewPane: boolean;
  sideBySidePreview: boolean;
}

const ProposalBuilderContext = createContext<ProposalBuilderContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components -- hook co-located with its provider by design
export function useProposalBuilder(): ProposalBuilderContextValue {
  const ctx = useContext(ProposalBuilderContext);
  if (!ctx) {
    throw new Error('useProposalBuilder must be used within a ProposalBuilderProvider');
  }
  return ctx;
}

interface ProposalBuilderProviderProps {
  proposalId?: string;
  children: ReactNode;
}

export function ProposalBuilderProvider({ proposalId, children }: ProposalBuilderProviderProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedClientId = searchParams.get('clientId');
  const preselectedTemplateId = searchParams.get('template');
  const guidedParam = searchParams.get('guided');
  const manualParam = searchParams.get('manual');
  const fromPricingParam = searchParams.get('fromPricing');
  const { tenant, user } = useAuthStore();
  const isEditMode = Boolean(proposalId);
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Step 1: Client
  const [clients, setClients] = useState<Client[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // Step 2: Services
  const [services, setServices] = useState<Service[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [serviceSearch, setServiceSearch] = useState('');
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([]);
  const [editingService, setEditingService] = useState<string | null>(null);

  // Edit form state
  const [editForm, setEditForm] = useState<{
    displayPrice: number;
    quantity: number;
    discountPercent: number;
    vatRate: number;
    billingCycle: string;
    oneOffDueDate: string;
  }>({
    displayPrice: 0,
    quantity: 1,
    discountPercent: 0,
    vatRate: 20,
    billingCycle: 'MONTHLY',
    oneOffDueDate: '',
  });

  // Step 3: Review
  const [proposalTitle, setProposalTitle] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [coverLetterLoading, setCoverLetterLoading] = useState(false);
  const coverLetterServicesKeyRef = useRef('');
  const [coverLetterTone, setCoverLetterTone] = useState<CoverLetterTone>('PROFESSIONAL');
  const [coverLetterCustomInstruction, setCoverLetterCustomInstruction] = useState('');
  const [applyingCoverLetterTweak, setApplyingCoverLetterTweak] = useState(false);
  const [includeVat, setIncludeVat] = useState(true);

  // Contract & proposal validity
  const [contractStartDate, setContractStartDate] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [defaultExpiryDays, setDefaultExpiryDays] = useState(30);
  const [defaultPaymentTermsDays, setDefaultPaymentTermsDays] = useState(7);
  const [benchmarksOptIn, setBenchmarksOptIn] = useState(false);

  // AI assistance
  const [aiConfigured, setAiConfigured] = useState(false);
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any>(null);
  const [aiCoverLoading, setAiCoverLoading] = useState(false);
  const [aiCoverDraft, setAiCoverDraft] = useState<string | null>(null);
  const [showLivePreviewPane, setShowLivePreviewPane] = useState(() =>
    getBuilderPreviewPreference()
  );

  const toggleLivePreviewPane = useCallback((next?: boolean) => {
    setShowLivePreviewPane((prev) => {
      const value = next ?? !prev;
      setBuilderPreviewPreference(value);
      return value;
    });
  }, []);

  const [buildMode, setBuildMode] = useState<BuildMode>(() => {
    if (manualParam === '1' || manualParam === 'true') return 'manual';
    if (guidedParam === '1' || guidedParam === 'true') return 'clara';
    return 'unset';
  });
  const [proposalTemplates, setProposalTemplates] = useState<ProposalTemplateSummary[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);
  const [saveTemplateDialog, setSaveTemplateDialog] = useState<{
    open: boolean;
    proposalId: string;
  }>({
    open: false,
    proposalId: '',
  });
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [autoFitLoading, setAutoFitLoading] = useState(false);
  const [autoFitResult, setAutoFitResult] = useState<AutoFitResult | null>(null);
  const [autoFitDismissed, setAutoFitDismissed] = useState(
    manualParam === '1' || manualParam === 'true'
  );
  const [editPriceText, setEditPriceText] = useState('');
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [proposalTerms, setProposalTerms] = useState('');
  const [termsLoading, setTermsLoading] = useState(false);
  const [offerThreePackages, setOfferThreePackages] = useState(false);
  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>(DEFAULT_PRICING_TIERS);
  const [requireTwoSigners, setRequireTwoSigners] = useState(false);
  const [hasResumedDraft, setHasResumedDraft] = useState(false);
  const autoFitClientRef = useRef<string | null>(null);
  const preselectedTemplateAppliedRef = useRef(false);
  const pricingSuggestionAppliedRef = useRef(false);
  const activeClientIdRef = useRef<string | null>(null);
  const isHydratingDraftRef = useRef(false);

  const todayIso = format(new Date(), 'yyyy-MM-dd');

  const resolveInitialBuildMode = (): BuildMode => {
    if (manualParam === '1' || manualParam === 'true') return 'manual';
    if (guidedParam === '1' || guidedParam === 'true') return 'clara';
    if (preselectedTemplateId) return 'template';
    return 'unset';
  };

  const captureDraftSnapshot = (): ProposalDraft => ({
    selectedServices,
    proposalTitle,
    coverLetter,
    coverLetterTone,
    currentStep,
    contractStartDate,
    validUntil,
    buildMode,
    selectedTemplateId,
  });

  const applyDraftSnapshot = useCallback((draft: ProposalDraft) => {
    isHydratingDraftRef.current = true;
    setSelectedServices(
      draft.selectedServices?.length ? (draft.selectedServices as SelectedService[]) : []
    );
    setProposalTitle(draft.proposalTitle || '');
    setCoverLetter(draft.coverLetter || '');
    if (draft.coverLetterTone) setCoverLetterTone(draft.coverLetterTone);
    setCurrentStep(draft.currentStep && draft.currentStep >= 1 ? draft.currentStep : 1);
    setContractStartDate(draft.contractStartDate || '');
    if (draft.validUntil) setValidUntil(draft.validUntil);
    setBuildMode(draft.buildMode ?? 'unset');
    setSelectedTemplateId(draft.selectedTemplateId ?? null);
    setAutoFitResult(null);
    setAutoFitLoading(false);
    preselectedTemplateAppliedRef.current =
      Boolean(draft.selectedTemplateId) ||
      draft.buildMode === 'template' ||
      (draft.selectedServices?.length ?? 0) > 0;
    queueMicrotask(() => {
      isHydratingDraftRef.current = false;
    });
  }, []);

  const resetClientProposalState = useCallback(
    (clientId: string) => {
      isHydratingDraftRef.current = true;
      setSelectedServices([]);
      setProposalTitle('');
      setCoverLetter('');
      setCoverLetterTone('PROFESSIONAL');
      setCurrentStep(preselectedClientId && clientId === preselectedClientId ? 2 : 1);
      setContractStartDate('');
      setValidUntil((prev) => prev || format(addDays(new Date(), defaultExpiryDays), 'yyyy-MM-dd'));
      setBuildMode(resolveInitialBuildMode());
      setSelectedTemplateId(preselectedTemplateId);
      setAutoFitDismissed(manualParam === '1' || manualParam === 'true');
      setAutoFitResult(null);
      setAutoFitLoading(false);
      preselectedTemplateAppliedRef.current = false;
      queueMicrotask(() => {
        isHydratingDraftRef.current = false;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolveInitialBuildMode reads the same params already listed
    [defaultExpiryDays, preselectedClientId, preselectedTemplateId, manualParam, guidedParam]
  );

  const selectClient = (client: Client) => {
    if (selectedClient?.id === client.id) return;

    if (!isEditMode && selectedClient?.id) {
      localStorage.setItem(
        proposalDraftKey(undefined, selectedClient.id),
        JSON.stringify(captureDraftSnapshot())
      );
    }

    setSelectedClient(client);
  };

  useEffect(() => {
    loadClients();
    loadServices();
    loadProposalTemplates();
    loadProposalDefaults();
    apiClient
      .getAiStatus()
      .then((res: any) => setAiConfigured(res.data?.configured ?? false))
      .catch(() => setAiConfigured(false));
    if (proposalId) {
      loadExistingProposal(proposalId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalId]);

  // Per-client draft restore — each client gets an isolated in-progress proposal
  useEffect(() => {
    if (isEditMode || !selectedClient) return;
    const clientId = selectedClient.id;
    if (activeClientIdRef.current === clientId) return;
    activeClientIdRef.current = clientId;

    let loaded = false;
    try {
      const saved = localStorage.getItem(proposalDraftKey(undefined, clientId));
      if (saved) {
        applyDraftSnapshot(JSON.parse(saved) as ProposalDraft);
        loaded = true;
      } else {
        const legacy = localStorage.getItem(LEGACY_NEW_DRAFT_KEY);
        if (legacy) {
          const legacyDraft = JSON.parse(legacy) as ProposalDraft & { selectedClient?: Client };
          if (legacyDraft.selectedClient?.id === clientId) {
            const { selectedClient: _omit, ...rest } = legacyDraft;
            applyDraftSnapshot(rest);
            localStorage.removeItem(LEGACY_NEW_DRAFT_KEY);
            loaded = true;
          }
        }
      }
    } catch {
      // ignore corrupt draft
    }

    if (!loaded) {
      resetClientProposalState(clientId);
      setHasResumedDraft(false);
    } else {
      setHasResumedDraft(true);
    }
  }, [isEditMode, selectedClient, applyDraftSnapshot, resetClientProposalState]);

  const restartProposal = useCallback(
    (keepClient: boolean) => {
      const client = selectedClient;
      if (client) {
        localStorage.removeItem(proposalDraftKey(undefined, client.id));
      }
      localStorage.removeItem(LEGACY_NEW_DRAFT_KEY);
      activeClientIdRef.current = null;
      setHasResumedDraft(false);
      setProposalTerms('');
      if (keepClient && client) {
        resetClientProposalState(client.id);
        setSelectedClient(client);
        setCurrentStep(1);
      } else {
        setSelectedClient(null);
        setCurrentStep(1);
        setBuildMode('unset');
        setSelectedServices([]);
        setProposalTitle('');
        setCoverLetter('');
      }
    },
    [selectedClient, resetClientProposalState]
  );

  useEffect(() => {
    if (isEditMode || currentStep < 2 || selectedServices.length === 0) return;
    const ids = selectedServices.map((s) => s.templateId).filter(Boolean);
    if (!ids.length) return;

    let cancelled = false;
    setTermsLoading(true);
    apiClient
      .previewProposalTerms(ids)
      .then((res: any) => {
        if (!cancelled && res.success && res.data?.terms) {
          setProposalTerms(res.data.terms);
        }
      })
      .catch(() => {
        if (!cancelled) setProposalTerms('');
      })
      .finally(() => {
        if (!cancelled) setTermsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isEditMode, currentStep, selectedServices]);

  // Apply pricing calculator suggestions: ?fromPricing=1
  useEffect(() => {
    if (
      isEditMode ||
      fromPricingParam !== '1' ||
      pricingSuggestionAppliedRef.current ||
      services.length === 0
    ) {
      return;
    }

    const suggestion = loadPricingSuggestion();
    if (!suggestion?.services?.length) return;

    pricingSuggestionAppliedRef.current = true;
    const lines: SelectedService[] = [];
    let skipped = 0;

    for (const suggested of suggestion.services) {
      const catalogue = services.find(
        (s) =>
          s.id === suggested.serviceTemplateId ||
          s.name.trim().toLowerCase() === suggested.catalogName.trim().toLowerCase()
      );
      if (!catalogue) {
        skipped += 1;
        continue;
      }

      const price = suggested.suggestedPrice;
      const frequency =
        suggested.billingCycle || catalogue.billingCycle || catalogue.defaultFrequency || 'MONTHLY';
      const annualEquivalent = calculateAnnualEquivalent(price, frequency);
      const vatPercent =
        catalogue.isVatApplicable !== false
          ? catalogue.vatRate === 'REDUCED_5'
            ? 5
            : catalogue.vatRate === 'ZERO' || catalogue.vatRate === 'EXEMPT'
              ? 0
              : 20
          : 0;
      const lineTotal = price;
      const vatAmount = includeVat ? vatAmountFor(lineTotal, vatPercent) : 0;

      lines.push({
        ...catalogue,
        id: newSelectedLineId(),
        templateId: catalogue.id,
        quantity: 1,
        discountPercent: 0,
        displayPrice: price,
        billingCycle: frequency,
        priceAmount: price,
        annualEquivalent,
        lineTotal,
        vatRate: vatPercent,
        vatAmount,
        grossTotal: lineTotal + vatAmount,
        allowedCadences: parseFrequencyOptions(catalogue.frequencyOptions),
        oneOffDueDate: frequency === 'ONE_TIME' ? '' : undefined,
      });
    }

    if (lines.length > 0) {
      setSelectedServices(lines);
      setBuildMode('manual');
      setAutoFitDismissed(true);
      setCurrentStep(preselectedClientId ? 2 : 1);
      if (!proposalTitle.trim()) {
        const entityLabel = suggestion.inputs.entityType.replace(/_/g, ' ').toLowerCase();
        setProposalTitle(`Engagement proposal — ${entityLabel}`);
      }
      toast.success(`Applied ${lines.length} priced service(s) from calculator`);
    }

    if (skipped > 0) {
      toast(
        `${skipped} suggested service(s) not found in your catalogue — add them from UK templates`,
        { icon: 'ℹ️', duration: 6000 }
      );
    }

    clearPricingSuggestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- services.length is the intended trigger; the full array would refire on every edit
  }, [
    isEditMode,
    fromPricingParam,
    services.length,
    preselectedClientId,
    includeVat,
    proposalTitle,
  ]);

  // Deep-link from Templates page: ?template=<id>
  useEffect(() => {
    if (isEditMode || !preselectedTemplateId || preselectedTemplateAppliedRef.current) return;
    setBuildMode('template');
    setSelectedTemplateId(preselectedTemplateId);
  }, [isEditMode, preselectedTemplateId]);

  useEffect(() => {
    if (
      isEditMode ||
      !preselectedTemplateId ||
      services.length === 0 ||
      preselectedTemplateAppliedRef.current
    ) {
      return;
    }
    void applyProposalTemplate(preselectedTemplateId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, preselectedTemplateId, services.length]);

  useEffect(() => {
    if (currentStep >= 3 && getBuilderPreviewPreference()) {
      toggleLivePreviewPane(true);
    }
  }, [currentStep, toggleLivePreviewPane]);

  const loadCoverLetterFromTemplate = async (client: Client, serviceCount?: number) => {
    try {
      const tplRes = (await apiClient.getDefaultCoverLetterTemplate()) as any;
      if (!tplRes?.success || !tplRes.data?.content) return false;

      const tone = (tplRes.data.tone || 'PROFESSIONAL') as CoverLetterTone;
      setCoverLetterTone(tone);

      const previewRes = (await apiClient.previewCoverLetterRaw(tplRes.data.content, {
        clientName: coverLetterAddressee(client),
        companyName: client.name,
        tenantName: tenant?.name || 'Our practice',
        senderName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || undefined,
        senderPosition: user?.jobTitle?.trim() || undefined,
        serviceCount: serviceCount ?? (selectedServices.length || undefined),
      })) as any;

      if (previewRes?.success && previewRes.data?.rendered) {
        setCoverLetter(previewRes.data.rendered);
        return true;
      }
    } catch {
      // fall back to tone presets in UI
    }
    return false;
  };

  // Auto-generate verbose client proposal letter when entering review step
  useEffect(() => {
    if (currentStep !== 3 || !selectedClient || selectedServices.length === 0 || !aiConfigured)
      return;
    void runGenerateClientCoverLetter(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, selectedClient?.id, selectedServices.length, aiConfigured, proposalTitle]);

  const runAutoFitForClient = async (clientId: string) => {
    if (!aiConfigured || isEditMode || proposalId) return;
    autoFitClientRef.current = clientId;
    setAutoFitLoading(true);
    setAutoFitDismissed(false);
    setAutoFitResult(null);
    try {
      const res = (await apiClient.aiAutoFit(clientId)) as any;
      if (autoFitClientRef.current === clientId && res.success) {
        setAutoFitResult(res.data);
      }
    } catch {
      // User-triggered only — avoid error popups unless they asked for suggestions
    } finally {
      if (autoFitClientRef.current === clientId) setAutoFitLoading(false);
    }
  };

  const guidedAutoFitDoneRef = useRef(false);
  useEffect(() => {
    const guided = guidedParam === '1' || guidedParam === 'true';
    if (
      !guided ||
      guidedAutoFitDoneRef.current ||
      buildMode !== 'clara' ||
      !selectedClient ||
      isEditMode ||
      proposalId ||
      !aiConfigured
    ) {
      return;
    }
    guidedAutoFitDoneRef.current = true;
    void runAutoFitForClient(selectedClient.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildMode, selectedClient?.id, guidedParam, aiConfigured, isEditMode, proposalId]);

  // Changing client in Clara mode clears stale suggestions — no background API call (W2.1)
  useEffect(() => {
    if (buildMode !== 'clara') return;
    setAutoFitDismissed(false);
    setAutoFitResult(null);
    setAutoFitLoading(false);
    autoFitClientRef.current = null;
  }, [selectedClient?.id, buildMode]);

  useEffect(() => {
    if (isEditMode || !selectedClient || isHydratingDraftRef.current) return;
    const clientId = selectedClient.id;
    const key = proposalDraftKey(undefined, clientId);
    const timer = setTimeout(() => {
      if (isHydratingDraftRef.current) return;
      localStorage.setItem(key, JSON.stringify(captureDraftSnapshot()));
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- captureDraftSnapshot is recreated each render; deps below cover its inputs
  }, [
    selectedClient,
    selectedServices,
    proposalTitle,
    coverLetter,
    coverLetterTone,
    currentStep,
    contractStartDate,
    validUntil,
    buildMode,
    selectedTemplateId,
    isEditMode,
  ]);

  const loadProposalDefaults = async () => {
    try {
      const response = (await apiClient.getTenantSettings()) as any;
      if (response.success && response.data?.proposals) {
        const proposals = response.data.proposals as {
          defaultExpiryDays?: number;
          defaultPaymentTermsDays?: number;
          benchmarksOptIn?: boolean;
        };
        if (proposals.defaultExpiryDays) {
          const days = proposals.defaultExpiryDays;
          setDefaultExpiryDays(days);
          if (!proposalId) {
            setValidUntil((prev) => {
              if (prev) return prev;
              return format(addDays(new Date(), days), 'yyyy-MM-dd');
            });
          }
        }
        if (proposals.defaultPaymentTermsDays) {
          setDefaultPaymentTermsDays(proposals.defaultPaymentTermsDays);
        }
        setBenchmarksOptIn(proposals.benchmarksOptIn === true);
      }
    } catch {
      // defaults are fine
    }
  };

  const loadProposalTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const res = (await apiClient.getProposalTemplates()) as any;
      if (res.success) setProposalTemplates(res.data || []);
    } catch {
      // templates are optional
    } finally {
      setTemplatesLoading(false);
    }
  };

  const loadClients = async () => {
    try {
      const response = (await apiClient.getClients({ limit: 100 })) as any;
      const list = response.data || [];
      setClients(list);
      if (preselectedClientId && !proposalId) {
        const match = list.find((c: Client) => c.id === preselectedClientId);
        if (match) {
          setSelectedClient(match);
        }
      }
    } catch (error) {
      toast.error('Failed to load clients');
    }
  };

  const loadServices = async () => {
    try {
      const response = (await apiClient.getServices({ limit: 100 })) as any;
      const mappedServices = (response.data || []).map((s: any) => ({
        ...s,
        priceAmount: s.priceAmount || s.basePrice || 0,
        billingCycle: resolveCatalogBillingCycle(s),
        frequencyOptions: s.frequencyOptions,
      }));
      setServices(mappedServices);
    } catch (error) {
      toast.error('Failed to load services');
    }
  };

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set(services.map((s) => s.category).filter(Boolean));
    return ['ALL', ...Array.from(cats)];
  }, [services]);

  // Filter services
  const filteredServices = useMemo(() => {
    return services.filter((s) => {
      const matchesCategory = selectedCategory === 'ALL' || s.category === selectedCategory;
      const matchesSearch = s.name.toLowerCase().includes((serviceSearch || '').toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [services, selectedCategory, serviceSearch]);

  // Helper to compute live preview values for a service being edited
  const getEditingPreview = useCallback(
    (original: SelectedService): SelectedService => {
      const quantity = editForm.quantity || 1;
      const discount = editForm.discountPercent || 0;
      const price = editForm.displayPrice || 0;
      const vatRate = editForm.vatRate || 0;

      const line = calculateLineItem({
        basePrice: price,
        billingFrequency: editForm.billingCycle as BillingFrequency,
        quantity,
        discountPercent: discount,
        vatRate: includeVat ? vatRate : 0,
      });

      return {
        ...original,
        displayPrice: price,
        quantity,
        discountPercent: discount,
        vatRate,
        billingCycle: editForm.billingCycle,
        lineTotal: line.netTotal,
        vatAmount: line.vatAmount,
        grossTotal: line.grossTotal,
        annualEquivalent: line.annualEquivalent,
        oneOffDueDate:
          editForm.billingCycle === 'ONE_TIME' && editForm.oneOffDueDate.trim()
            ? editForm.oneOffDueDate.trim()
            : undefined,
      };
    },
    [editForm, includeVat]
  );

  // Calculate summary (includes live preview of editing service)
  // Totals are per billing period (no blending annual into "monthly investment")
  const summary: PricingSummary = useMemo(() => {
    const servicesForSummary = editingService
      ? selectedServices.map((s) => (s.id === editingService ? getEditingPreview(s) : s))
      : selectedServices;

    return calculateProposalSummaryBands(
      servicesForSummary.map((s) => ({
        billingFrequency: s.billingCycle as BillingFrequency,
        lineTotal: s.lineTotal,
        vatAmount: s.vatAmount,
        grossTotal: s.grossTotal,
      }))
    );
  }, [selectedServices, editingService, getEditingPreview]);

  /** Review step: average monthly equivalent of all recurring lines (inc VAT) */
  const reviewMonthlyCostIncVat = useMemo(() => {
    const servicesForSummary = editingService
      ? selectedServices.map((s) => (s.id === editingService ? getEditingPreview(s) : s))
      : selectedServices;
    return servicesForSummary.reduce((sum, s) => sum + recurringMonthlyEquivalentIncVat(s), 0);
  }, [selectedServices, editingService, getEditingPreview]);

  const recalcLine = (
    price: number,
    quantity: number,
    discountPercent: number,
    vatRate: number,
    billingCycle: string
  ) => {
    const line = calculateLineItem({
      basePrice: price,
      billingFrequency: billingCycle as BillingFrequency,
      quantity,
      discountPercent,
      vatRate: includeVat ? vatRate : 0,
    });
    return {
      lineTotal: line.netTotal,
      vatAmount: line.vatAmount,
      grossTotal: line.grossTotal,
      annualEquivalent: line.annualEquivalent,
    };
  };

  const changeServiceCadence = (id: string, newCadence: BillingCadence) => {
    setSelectedServices((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const newPrice = convertPriceBetweenCadences(s.displayPrice, s.billingCycle, newCadence);
        const totals = recalcLine(newPrice, s.quantity, s.discountPercent, s.vatRate, newCadence);
        return {
          ...s,
          billingCycle: newCadence,
          displayPrice: newPrice,
          priceAmount: newPrice,
          ...totals,
          oneOffDueDate: newCadence === 'ONE_TIME' ? s.oneOffDueDate || '' : undefined,
        };
      })
    );
    if (editingService === id) {
      const svc = selectedServices.find((s) => s.id === id);
      if (svc) {
        const newPrice = convertPriceBetweenCadences(
          svc.displayPrice,
          svc.billingCycle,
          newCadence
        );
        setEditForm((f) => ({
          ...f,
          billingCycle: newCadence,
          displayPrice: newPrice,
          oneOffDueDate: newCadence === 'ONE_TIME' ? f.oneOffDueDate : '',
        }));
      }
    }
  };

  const goToReviewStep = () => {
    setCurrentStep(3);
    if (!coverLetter.trim() && selectedClient && !isEditMode && !proposalId && !aiConfigured) {
      void loadCoverLetterFromTemplate(selectedClient, selectedServices.length);
    }
  };

  /**
   * Apply one of the three professional tones.
   * Autofills names, company, services list, date, etc. so the user sees a ready-to-send letter.
   * The T&Cs, services table and acceptance pages remain tone-neutral.
   */
  const applyCoverLetterStyle = (tone: CoverLetterTone) => {
    if (!selectedClient) {
      toast.error('Select a client first');
      return;
    }
    const generated = generateCoverLetterForTone({
      tone,
      addresseeName: coverLetterAddressee(selectedClient),
      companyName: selectedClient.name,
      practiceName: tenant?.name || 'Our practice',
      senderName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || undefined,
      senderPosition: (user as any)?.jobTitle || undefined,
      services: selectedServices,
    });
    setCoverLetter(generated);
    setCoverLetterTone(tone);
    const style = getStyleByTone(tone);
    toast.success(`Applied ${style?.name || tone} tone`);
  };

  // Add service
  const addServiceWithCadence = (
    service: Service,
    billingFrequency?: string,
    overridePrice?: number
  ) => {
    if (isServiceLineAlreadySelected(selectedServices, service.id)) {
      return false;
    }

    const newService = buildSelectedServiceLine(service, {
      billingFrequency,
      overridePrice,
      includeVat,
    });

    setSelectedServices((prev) => [...prev, newService]);
    return true;
  };

  const addService = (service: Service) => {
    if (selectedServices.find((s) => s.templateId === service.id)) {
      toast.success('Service already added');
      return;
    }
    if (addServiceWithCadence(service)) {
      toast.success(`${service.name} added`);
    }
  };

  const runAiSuggestServices = async () => {
    if (!selectedClient) {
      toast.error('Select a client first');
      return;
    }
    setAiSuggestLoading(true);
    try {
      const res = (await apiClient.aiSuggestServices(selectedClient.id)) as any;
      if (res.success) {
        setAiSuggestions(res.data);
        if (res.data.validUntilDays && !validUntil) {
          setValidUntil(format(addDays(new Date(), res.data.validUntilDays), 'yyyy-MM-dd'));
        }
      }
    } catch (e) {
      showAiError(e);
    } finally {
      setAiSuggestLoading(false);
    }
  };

  const applySingleAiSuggestion = (serviceId: string) => {
    if (!aiSuggestions?.suggestions?.length) return;
    const sug = aiSuggestions.suggestions.find(
      (s: { serviceId: string }) => s.serviceId === serviceId
    );
    if (!sug) return;
    const catalogService = services.find((s) => s.id === sug.serviceId);
    if (!catalogService) return;
    if (addServiceWithCadence(catalogService, sug.billingFrequency, sug.displayPrice)) {
      toast.success(`${sug.name} added`);
    } else {
      toast.success('Service already selected');
    }
    setAiSuggestions((prev: typeof aiSuggestions) => {
      if (!prev?.suggestions?.length) return prev;
      const remaining = prev.suggestions.filter(
        (s: { serviceId: string }) => s.serviceId !== serviceId
      );
      if (!remaining.length) return null;
      return { ...prev, suggestions: remaining };
    });
  };

  const applyTweakedAiSuggestion = (
    serviceId: string,
    tweaks: { billingFrequency: string; displayPrice: number }
  ) => {
    const catalogService = services.find((s) => s.id === serviceId);
    if (!catalogService) return;
    if (addServiceWithCadence(catalogService, tweaks.billingFrequency, tweaks.displayPrice)) {
      const name = aiSuggestions?.suggestions?.find(
        (s: { serviceId: string }) => s.serviceId === serviceId
      )?.name;
      toast.success(name ? `${name} added with your tweaks` : 'Service added with your tweaks');
    }
    setAiSuggestions((prev: typeof aiSuggestions) => {
      if (!prev?.suggestions?.length) return prev;
      const remaining = prev.suggestions.filter(
        (s: { serviceId: string }) => s.serviceId !== serviceId
      );
      if (!remaining.length) return null;
      return { ...prev, suggestions: remaining };
    });
  };

  const applyAutoFitService = (sug: {
    serviceId: string;
    name: string;
    billingFrequency: string;
    displayPrice: number;
  }) => {
    const catalogService = services.find((s) => s.id === sug.serviceId);
    if (!catalogService) return;
    if (addServiceWithCadence(catalogService, sug.billingFrequency, sug.displayPrice)) {
      toast.success(`${sug.name} added`);
    }
  };

  const applyTweakedAutoFitService = (
    sug: { serviceId: string; name: string },
    tweaks: { billingFrequency: string; displayPrice: number }
  ) => {
    const catalogService = services.find((s) => s.id === sug.serviceId);
    if (!catalogService) return;
    if (addServiceWithCadence(catalogService, tweaks.billingFrequency, tweaks.displayPrice)) {
      toast.success(`${sug.name} added with your tweaks`);
    }
  };

  const applyAiSuggestions = () => {
    if (!aiSuggestions?.suggestions?.length) return;
    let added = 0;
    for (const sug of aiSuggestions.suggestions) {
      const catalogService = services.find((s) => s.id === sug.serviceId);
      if (!catalogService) continue;
      if (addServiceWithCadence(catalogService, sug.billingFrequency, sug.displayPrice)) {
        added++;
      }
    }
    toast.success(
      added
        ? `Added ${added} suggested service${added === 1 ? '' : 's'}`
        : 'Services already selected'
    );
    setAiSuggestions(null);
  };

  const runAiCoverLetter = async () => {
    if (!selectedClient) {
      toast.error('Select a client first');
      return;
    }
    if (!coverLetter.trim()) {
      toast.error(
        'Add or load a cover letter first — Clara revises your template, she does not draft from scratch'
      );
      return;
    }
    setAiCoverLoading(true);
    try {
      const serviceSummary =
        selectedServices.map((s) => s.name).join(', ') || 'your selected services';
      const res = (await apiClient.aiCoverLetterRevise(
        coverLetter,
        `Personalise and polish this cover letter for ${selectedClient.name}. Keep UK English and a ${coverLetterTone.toLowerCase()} tone. Reflect these services: ${serviceSummary}.`,
        { clientId: selectedClient.id }
      )) as any;
      if (res.success && res.data?.revisedBody) {
        setCoverLetter(res.data.revisedBody);
        toast.success(`${AI_COPILOT.name} revised your cover letter — review before sending`);
      }
    } catch (e) {
      showAiError(e);
    } finally {
      setAiCoverLoading(false);
    }
  };

  const applyCoverLetterTweak = async (instruction: string) => {
    if (!coverLetter.trim()) return;
    setApplyingCoverLetterTweak(true);
    try {
      const res = (await apiClient.aiCoverLetterRevise(coverLetter, instruction, {
        clientId: selectedClient?.id,
      })) as any;
      if (res.success && res.data?.revisedBody) {
        setCoverLetter(res.data.revisedBody);
        toast.success('Clara updated the cover letter');
      }
    } catch (e) {
      showAiError(e);
    } finally {
      setApplyingCoverLetterTweak(false);
    }
  };

  const runGenerateClientCoverLetter = async (force = false) => {
    if (!selectedClient || selectedServices.length === 0) {
      toast.error('Add at least one service before generating the proposal letter');
      return;
    }
    const servicesKey = selectedServices.map((s) => `${s.id}:${s.billingCycle}`).join('|');
    if (
      !force &&
      coverLetter.trim().length >= 120 &&
      coverLetterServicesKeyRef.current === servicesKey
    ) {
      return;
    }

    setCoverLetterLoading(true);
    try {
      const res = (await apiClient.aiProposalExplanation({
        clientId: selectedClient.id,
        title: proposalTitle.trim() || 'Proposal',
        services: selectedServices.map((s) => ({
          name: s.name,
          description: s.description,
          billingCycle: s.billingCycle,
        })),
        monthlyTotal: reviewMonthlyCostIncVat,
        contractTotal: summary.contractTotalIncVat,
      })) as any;
      if (res?.success && res.data?.explanation) {
        setCoverLetter(res.data.explanation);
        coverLetterServicesKeyRef.current = servicesKey;
        toast.success('Client proposal letter ready — review and edit before sending');
      }
    } catch (e) {
      showAiError(e);
    } finally {
      setCoverLetterLoading(false);
    }
  };

  const applyAutoFitSection = (
    section: 'title' | 'services' | 'coverLetter' | 'pricing' | 'validUntil'
  ) => {
    if (!autoFitResult) return;
    switch (section) {
      case 'title':
        setProposalTitle(autoFitResult.suggestedTitle);
        break;
      case 'services':
        if (autoFitResult.services?.length) {
          let added = 0;
          for (const sug of autoFitResult.services) {
            const catalogService = services.find((s) => s.id === sug.serviceId);
            if (!catalogService) continue;
            if (addServiceWithCadence(catalogService, sug.billingFrequency, sug.displayPrice)) {
              added++;
            }
          }
          if (added) {
            toast.success(`Applied ${added} suggested service${added === 1 ? '' : 's'}`);
          }
        }
        break;
      case 'coverLetter':
        if (autoFitResult.coverLetterDraft) setCoverLetter(autoFitResult.coverLetterDraft);
        if (autoFitResult.coverLetterTone) setCoverLetterTone(autoFitResult.coverLetterTone);
        break;
      case 'validUntil':
        if (autoFitResult.validUntilDays) {
          setValidUntil(format(addDays(new Date(), autoFitResult.validUntilDays), 'yyyy-MM-dd'));
        }
        break;
      case 'pricing':
        if (autoFitResult.pricingNotes) {
          toast(autoFitResult.pricingNotes, { icon: '💡', duration: 5000 });
        }
        break;
    }
  };

  const applyAllAutoFit = () => {
    applyAutoFitSection('title');
    applyAutoFitSection('services');
    applyAutoFitSection('coverLetter');
    applyAutoFitSection('validUntil');
    applyAutoFitSection('pricing');
    toast.success(`${AI_COPILOT.name}'s suggestions applied — review before sending`);
    setAutoFitDismissed(true);
    setAutoFitResult(null);
  };

  const emailDraftPayload: ProposalEmailDraftInput | undefined = useMemo(() => {
    if (!selectedClient) return undefined;
    return {
      clientId: selectedClient.id,
      title: proposalTitle,
      coverLetter,
      validUntil,
      practiceName: tenant?.name,
      senderName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || undefined,
      services: selectedServices.map((s) => ({
        name: s.name,
        billingFrequency: s.billingCycle,
        displayPrice: s.displayPrice,
      })),
    };
  }, [
    selectedClient,
    proposalTitle,
    coverLetter,
    validUntil,
    tenant?.name,
    user,
    selectedServices,
  ]);

  // Start editing service
  const startEdit = (service: SelectedService) => {
    setEditingService(service.id);
    setEditPriceText(String(service.displayPrice));
    setEditForm({
      displayPrice: service.displayPrice,
      quantity: service.quantity,
      discountPercent: service.discountPercent,
      vatRate: service.vatRate,
      billingCycle: service.billingCycle,
      oneOffDueDate: service.oneOffDueDate || '',
    });
  };

  // Save edit
  const saveEdit = (id: string) => {
    setSelectedServices((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;

        const quantity = editForm.quantity || 1;
        const discount = editForm.discountPercent || 0;
        const price = parseDecimalInput(editPriceText, editForm.displayPrice);
        const vatRate = editForm.vatRate || 0;

        // Recalculate
        const line = calculateLineItem({
          basePrice: price,
          billingFrequency: editForm.billingCycle as BillingFrequency,
          quantity,
          discountPercent: discount,
          vatRate: includeVat ? vatRate : 0,
        });

        return {
          ...s,
          displayPrice: price,
          quantity,
          discountPercent: discount,
          vatRate,
          billingCycle: editForm.billingCycle,
          lineTotal: line.netTotal,
          vatAmount: line.vatAmount,
          grossTotal: line.grossTotal,
          annualEquivalent: line.annualEquivalent,
          oneOffDueDate:
            editForm.billingCycle === 'ONE_TIME' && editForm.oneOffDueDate.trim()
              ? editForm.oneOffDueDate.trim()
              : undefined,
        };
      })
    );
    setEditingService(null);
    toast.success('Service updated');
  };

  // Cancel edit
  const cancelEdit = () => {
    setEditingService(null);
  };

  const removeService = (id: string) => {
    setSelectedServices((prev) => prev.filter((s) => s.id !== id));
  };

  const removeServiceByTemplateId = (templateId: string) => {
    const line = selectedServices.find((s) => s.templateId === templateId);
    if (line) removeService(line.id);
  };

  const clearAllServices = () => {
    if (selectedServices.length === 0) return;
    setSelectedServices([]);
    toast.success('All services removed — pick from the catalogue');
  };

  const taxServiceLines = useMemo(
    () =>
      selectedServices.filter((s) => s.category === 'TAX').map((s) => ({ id: s.id, name: s.name })),
    [selectedServices]
  );

  const applyContingentFeeToLine = (lineId: string, feeGbp: number, _explanation: string) => {
    setSelectedServices((prev) =>
      prev.map((s) => {
        if (s.id !== lineId) return s;

        const price = feeGbp;
        const billingCycle = 'ONE_TIME';
        const quantity = 1;
        const discount = 0;
        const grossLineTotal = price * quantity;
        const lineTotal = grossLineTotal;
        const vatAmount = includeVat ? vatAmountFor(lineTotal, s.vatRate) : 0;

        return {
          ...s,
          displayPrice: price,
          priceAmount: price,
          quantity,
          discountPercent: discount,
          billingCycle,
          lineTotal,
          vatAmount,
          grossTotal: lineTotal + vatAmount,
          annualEquivalent: calculateAnnualEquivalent(price, billingCycle),
          oneOffDueDate: s.oneOffDueDate || '',
        };
      })
    );
    if (editingService === lineId) {
      setEditPriceText(String(feeGbp));
      setEditForm((f) => ({
        ...f,
        displayPrice: feeGbp,
        billingCycle: 'ONE_TIME',
        quantity: 1,
        discountPercent: 0,
      }));
    }
  };

  const selectBuildMode = (mode: BuildMode) => {
    setBuildMode(mode);
    if (mode === 'manual') {
      setAutoFitDismissed(true);
      setAutoFitResult(null);
      setAutoFitLoading(false);
      setSelectedTemplateId(null);
    } else if (mode === 'clara') {
      setSelectedTemplateId(null);
      if (selectedClient) {
        void runAutoFitForClient(selectedClient.id);
      } else {
        setAutoFitDismissed(false);
        setAutoFitResult(null);
        setAutoFitLoading(false);
      }
    } else if (mode === 'template') {
      setAutoFitDismissed(true);
      setAutoFitResult(null);
      setAutoFitLoading(false);
    } else if (mode === 'unset') {
      setSelectedTemplateId(null);
    }
  };

  const buildLineFromCatalogue = (
    service: Service,
    billingFrequency: string,
    displayPrice: number,
    quantity: number,
    discountPercent: number,
    snapshot?: { name?: string; description?: string | null }
  ): SelectedService => {
    const annualEquivalent = calculateAnnualEquivalent(displayPrice, billingFrequency);
    const grossLine = displayPrice * quantity;
    const lineTotal = grossLine - grossLine * (discountPercent / 100);
    const vatPercent =
      service.isVatApplicable !== false
        ? service.vatRate === 'REDUCED_5'
          ? 5
          : service.vatRate === 'ZERO' || service.vatRate === 'EXEMPT'
            ? 0
            : 20
        : 0;
    const vatAmount = includeVat ? vatAmountFor(lineTotal, vatPercent) : 0;
    const allowedCadences = parseFrequencyOptions(service.frequencyOptions);

    return {
      ...service,
      id: newSelectedLineId(),
      templateId: service.id,
      name: snapshot?.name?.trim() || service.name,
      description:
        snapshot?.description !== undefined && snapshot?.description !== null
          ? snapshot.description
          : service.description,
      quantity,
      discountPercent,
      displayPrice,
      billingCycle: billingFrequency,
      priceAmount: displayPrice,
      annualEquivalent,
      lineTotal,
      vatRate: vatPercent,
      vatAmount,
      grossTotal: lineTotal + vatAmount,
      allowedCadences,
      oneOffDueDate: billingFrequency === 'ONE_TIME' ? '' : undefined,
    };
  };

  const findCatalogueForTemplateItem = (item: {
    serviceId?: string;
    name?: string;
  }): Service | undefined => {
    if (item.serviceId) {
      const byId = services.find((s) => s.id === item.serviceId);
      if (byId) return byId;
    }
    const needle = (item.name || '').trim().toLowerCase();
    if (!needle) return undefined;
    return services.find((s) => s.name.trim().toLowerCase() === needle);
  };

  const applyProposalTemplate = async (templateId: string) => {
    const isDeepLinkApply = templateId === preselectedTemplateId;
    setApplyingTemplateId(templateId);
    try {
      const res = (await apiClient.getProposalTemplate(templateId)) as any;
      if (!res.success) {
        toast.error('Could not load template');
        if (isDeepLinkApply) preselectedTemplateAppliedRef.current = false;
        return;
      }
      const t = res.data;
      setProposalTitle(t.title || '');
      if (t.coverLetter) setCoverLetter(t.coverLetter);
      const pricing =
        typeof t.defaultPricing === 'object' && t.defaultPricing ? t.defaultPricing : {};
      if (pricing.coverLetterTone) {
        setCoverLetterTone(pricing.coverLetterTone as CoverLetterTone);
      }

      const config = Array.isArray(t.serviceConfig) ? t.serviceConfig : [];
      if (config.length === 0) {
        toast.error('This template has no services configured');
        if (isDeepLinkApply) preselectedTemplateAppliedRef.current = false;
        return;
      }

      const lines: SelectedService[] = [];
      const missing: string[] = [];
      for (const item of config) {
        const catalogue = findCatalogueForTemplateItem(item);
        if (!catalogue) {
          missing.push(item.name || item.serviceId || 'Unknown service');
          continue;
        }
        lines.push(
          buildLineFromCatalogue(
            catalogue,
            item.billingFrequency || catalogue.billingCycle,
            item.displayPrice ?? catalogue.priceAmount,
            item.quantity ?? 1,
            item.discountPercent ?? 0,
            { name: item.name, description: item.description }
          )
        );
      }

      if (lines.length === 0) {
        toast.error(
          'None of the template services are in your catalogue. Add matching services or update the template.'
        );
        if (isDeepLinkApply) preselectedTemplateAppliedRef.current = false;
        return;
      }

      setSelectedServices(lines);
      setSelectedTemplateId(templateId);
      setBuildMode('template');
      setCurrentStep(2);
      await apiClient.recordProposalTemplateUse(templateId);
      if (isDeepLinkApply) preselectedTemplateAppliedRef.current = true;

      if (missing.length > 0) {
        toast(
          `${missing.length} service(s) from this template are no longer in your catalogue — the rest were applied`
        );
      } else {
        toast.success(`Template "${t.name}" applied`);
      }
    } catch {
      toast.error('Failed to apply template');
      if (isDeepLinkApply) preselectedTemplateAppliedRef.current = false;
    } finally {
      setApplyingTemplateId(null);
    }
  };

  const moveService = (id: string, direction: 'up' | 'down') => {
    setSelectedServices((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const next = direction === 'up' ? idx - 1 : idx + 1;
      if (next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy;
    });
  };

  const loadExistingProposal = async (id: string) => {
    try {
      setIsLoading(true);
      const response = (await apiClient.getProposal(id)) as any;
      if (!response.success) return;
      const p = response.data;
      setProposalTitle(p.title || '');
      const legacySummary = (p.proposalSummary || '').trim();
      const letter = (p.coverLetter || '').trim();
      setCoverLetter(
        legacySummary && letter ? `${letter}\n\n${legacySummary}` : letter || legacySummary
      );
      setProposalTerms((p.terms || '').trim());
      coverLetterServicesKeyRef.current = 'loaded';
      if (p.validUntil) {
        setValidUntil(format(new Date(p.validUntil), 'yyyy-MM-dd'));
      }
      if (p.contractStartDate) {
        setContractStartDate(format(new Date(p.contractStartDate), 'yyyy-MM-dd'));
      } else {
        setContractStartDate('');
      }
      // For existing proposals we don't store the originating tone server-side yet.
      // Default to PROFESSIONAL; user can re-apply any of the three above.
      setCoverLetterTone('PROFESSIONAL');
      if (p.client) {
        setSelectedClient({
          id: p.client.id,
          name: p.client.name,
          companyType: p.client.companyType,
          contactEmail: p.client.contactEmail,
          contactName: p.client.contactName,
        });
      }
      const lines: SelectedService[] = (p.services || []).map((svc: any, i: number) => {
        const freq = svc.billingFrequency || svc.frequency || 'MONTHLY';
        const displayPrice = svc.displayPrice ?? svc.unitPrice ?? 0;
        const qty = svc.quantity || 1;
        const discount = svc.discountPercent || 0;
        const grossLine = displayPrice * qty;
        const net = grossLine - grossLine * (discount / 100);
        const vatRate = svc.vatRate ?? 20;
        const vatAmount = svc.vatAmount ?? vatAmountFor(net, vatRate);
        const catalogId = svc.serviceTemplateId || svc.catalogServiceId || null;
        return {
          id: svc.id || `line-${i}`,
          templateId: catalogId || '',
          name: svc.name,
          description: svc.description,
          priceAmount: displayPrice,
          priceDisplayMode: svc.priceDisplayMode || 'PER_MONTH',
          billingCycle: freq,
          category: svc.category || svc.serviceTemplate?.category || 'Custom',
          quantity: qty,
          discountPercent: discount,
          displayPrice,
          annualEquivalent: svc.annualEquivalent ?? calculateAnnualEquivalent(displayPrice, freq),
          lineTotal: svc.lineTotal ?? net,
          vatRate,
          vatAmount,
          grossTotal: svc.grossTotal ?? net + vatAmount,
          allowedCadences: parseFrequencyOptions(
            svc.serviceTemplate?.frequencyOptions || svc.frequencyOptions
          ),
          oneOffDueDate: svc.oneOffDueDate ? String(svc.oneOffDueDate).slice(0, 10) : undefined,
        };
      });
      setSelectedServices(lines);
      setCurrentStep(lines.length > 0 ? 2 : 1);

      const cf = parseProposalCustomFields(p.customFields);
      setOfferThreePackages(Boolean(cf.offerThreePackages));
      if (cf.pricingTiers?.length) {
        setPricingTiers(cf.pricingTiers);
      } else {
        setPricingTiers(DEFAULT_PRICING_TIERS);
      }
      setRequireTwoSigners((cf.requiredSigners ?? 1) >= 2);
    } catch {
      toast.error('Failed to load proposal for editing');
    } finally {
      setIsLoading(false);
    }
  };

  const parseApiError = (error: any): string => {
    const details = error?.response?.data?.error?.details;
    if (Array.isArray(details) && details.length > 0) {
      return details.map((d: any) => d.message || d.path?.join('.')).join('; ');
    }
    return error?.response?.data?.error?.message || error.message || 'Request failed';
  };

  const collectValidationErrors = (): string[] =>
    collectProposalValidationErrors({
      selectedClient,
      selectedServices,
      proposalTitle,
      validUntil,
      todayIso,
      coverLetter,
    });

  const saveProposal = async () => {
    const errors = collectValidationErrors();
    setValidationErrors(errors);
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }

    setIsLoading(true);
    try {
      const proposalData = buildProposalSavePayload({
        selectedClient: selectedClient!,
        selectedServices,
        proposalTitle,
        validUntil,
        contractStartDate,
        coverLetter,
        proposalTerms,
        defaultPaymentTermsDays,
        includeVat,
        offerThreePackages,
        pricingTiers,
        requireTwoSigners,
      });

      const response = isEditMode
        ? await apiClient.updateProposal(proposalId!, proposalData)
        : await apiClient.createProposal(proposalData);

      if (response.success) {
        if (selectedClient) {
          localStorage.removeItem(proposalDraftKey(undefined, selectedClient.id));
        }
        localStorage.removeItem(LEGACY_NEW_DRAFT_KEY);
        toast.success(
          isEditMode ? 'Proposal updated successfully!' : 'Proposal created successfully!'
        );
        const savedId = isEditMode ? proposalId! : response.data.id;
        if (!isEditMode && buildMode === 'manual') {
          setSaveTemplateDialog({ open: true, proposalId: savedId });
        } else {
          navigate(`/proposals/${savedId}`);
        }
      } else {
        toast.error(response.error?.message || 'Failed to save proposal');
      }
    } catch (error: any) {
      toast.error(parseApiError(error));
    } finally {
      setIsLoading(false);
    }
  };

  const previewPdf = async () => {
    if (!isEditMode || !proposalId) {
      toggleLivePreviewPane(true);
      toast('Save the proposal first to download a branded PDF', { icon: 'ℹ️' });
      return;
    }
    try {
      toast.loading('Generating PDF…');
      await apiClient.downloadProposalPdf(proposalId, proposalTitle || undefined);
      toast.dismiss();
      toast.success('PDF downloaded');
    } catch {
      toast.dismiss();
      toast.error('Could not generate PDF — save the proposal and try again');
    }
  };

  const previewServices = useMemo(
    () =>
      selectedServices.map((s) => ({
        name: s.name,
        description: s.description,
        quantity: s.quantity,
        displayPrice: s.displayPrice,
        billingCycle: s.billingCycle,
        grossTotal: s.grossTotal,
      })),
    [selectedServices]
  );

  // Render compact service row
  const renderServiceRow = (service: Service) => {
    const isSelected = selectedServices.some((s) => s.templateId === service.id);

    return (
      <div
        key={service.id}
        data-testid="available-service-row"
        data-service-name={service.name}
        onClick={() => (isSelected ? removeServiceByTemplateId(service.id) : addService(service))}
        className={`flex items-center justify-between gap-2 p-3 rounded-lg border transition-all cursor-pointer ${
          isSelected
            ? 'bg-green-50 border-green-300 dark:bg-green-900/20 dark:border-green-700'
            : 'bg-white border-slate-200 hover:border-primary-300 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:hover:border-primary-600'
        }`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-slate-900 dark:text-white truncate">{service.name}</h3>
            {isSelected && <CheckIcon className="w-4 h-4 text-green-600 flex-shrink-0" />}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-300 dark:text-slate-300 truncate">
            {service.category}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="font-semibold text-primary-600 text-sm">
            {formatPriceForDisplay(service.priceAmount, service.billingCycle)}
          </span>
          <button
            type="button"
            data-testid={isSelected ? 'remove-from-catalogue' : 'add-from-catalogue'}
            onClick={(e) => {
              e.stopPropagation();
              if (isSelected) removeServiceByTemplateId(service.id);
              else addService(service);
            }}
            className={`p-1.5 rounded-lg ${
              isSelected
                ? 'text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30'
                : 'text-primary-600 hover:bg-primary-100 dark:hover:bg-primary-900/30'
            }`}
            title={isSelected ? 'Remove from proposal' : 'Add to proposal'}
          >
            {isSelected ? <TrashIcon className="w-4 h-4" /> : <PlusIcon className="w-4 h-4" />}
          </button>
        </div>
      </div>
    );
  };

  // Render editable selected service row
  const renderSelectedServiceRow = (service: SelectedService) => {
    const isEditing = editingService === service.id;

    if (isEditing) {
      return (
        <div
          key={service.id}
          className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg space-y-2"
        >
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-slate-900 dark:text-white text-sm">{service.name}</h4>
            <div className="flex gap-1">
              <button
                data-testid="save-edit-button"
                onClick={() => saveEdit(service.id)}
                className="p-1 text-green-600 hover:bg-green-100 rounded"
              >
                <CheckIcon className="w-4 h-4" />
              </button>
              <button
                data-testid="cancel-edit-button"
                onClick={cancelEdit}
                className="p-1 text-red-600 hover:bg-red-100 rounded"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            {/* Price */}
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-300 mb-0.5">
                Price (£)
              </label>
              <input
                data-testid="edit-price-input"
                type="text"
                inputMode="decimal"
                value={editPriceText}
                onChange={(e) => {
                  const next = e.target.value;
                  if (!isValidDecimalDraft(next)) return;
                  setEditPriceText(next);
                  setEditForm({
                    ...editForm,
                    displayPrice: parseDecimalInput(next, editForm.displayPrice),
                  });
                }}
                className="w-full px-2 py-1 text-sm border rounded dark:bg-slate-800 dark:border-slate-600"
              />
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-300 mb-0.5">
                Qty
              </label>
              <input
                type="number"
                min={1}
                value={editForm.quantity}
                onChange={(e) => setEditForm({ ...editForm, quantity: Number(e.target.value) })}
                className="w-full px-2 py-1 text-sm border rounded dark:bg-slate-800 dark:border-slate-600"
              />
            </div>

            {/* Discount */}
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-300 mb-0.5">
                Disc %
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={editForm.discountPercent}
                onChange={(e) =>
                  setEditForm({ ...editForm, discountPercent: Number(e.target.value) })
                }
                className="w-full px-2 py-1 text-sm border rounded dark:bg-slate-800 dark:border-slate-600"
              />
            </div>

            {/* VAT Rate */}
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-300 mb-0.5">
                VAT %
              </label>
              <select
                data-testid="edit-vat-select"
                value={editForm.vatRate}
                onChange={(e) => setEditForm({ ...editForm, vatRate: Number(e.target.value) })}
                className="w-full px-2 py-1 text-sm border rounded dark:bg-slate-800 dark:border-slate-600"
              >
                {VAT_RATES.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}%
                  </option>
                ))}
              </select>
            </div>

            {/* Billing cadence */}
            <div className="col-span-3 md:col-span-5">
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-300 mb-1">
                Billing period
              </label>
              <BillingCadenceSelector
                size="sm"
                className="w-full max-w-full"
                value={editForm.billingCycle}
                allowedCadences={selectedServices.find((s) => s.id === service.id)?.allowedCadences}
                onChange={(cadence) => {
                  const newPrice = convertPriceBetweenCadences(
                    editForm.displayPrice,
                    editForm.billingCycle,
                    cadence
                  );
                  setEditForm({
                    ...editForm,
                    billingCycle: cadence,
                    displayPrice: newPrice,
                    oneOffDueDate: cadence === 'ONE_TIME' ? editForm.oneOffDueDate : '',
                  });
                }}
              />
            </div>
          </div>

          {editForm.billingCycle === 'ONE_TIME' && (
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-300 mb-0.5">
                Due date (optional)
              </label>
              <input
                data-testid="edit-one-off-due-date"
                type="date"
                value={editForm.oneOffDueDate}
                onChange={(e) => setEditForm({ ...editForm, oneOffDueDate: e.target.value })}
                className="w-full max-w-xs px-2 py-1 text-sm border rounded dark:bg-slate-800 dark:border-slate-600"
              />
            </div>
          )}

          {/* Live preview */}
          <div className="flex justify-between items-center pt-1 border-t border-amber-200 dark:border-amber-800">
            <span className="text-xs text-slate-500 dark:text-slate-300">Preview (inc. VAT):</span>
            <span className="font-semibold text-primary-600 text-sm">
              {formatCurrency(
                editForm.displayPrice *
                  editForm.quantity *
                  (1 - editForm.discountPercent / 100) *
                  (1 + (includeVat ? editForm.vatRate : 0) / 100)
              )}
              <span className="text-xs text-slate-500 dark:text-slate-300 font-normal ml-1">
                {editForm.billingCycle === 'ONE_TIME'
                  ? ' one-time'
                  : `/${BILLING_FREQUENCY_LABELS[editForm.billingCycle] || 'month'}`}
              </span>
            </span>
          </div>
        </div>
      );
    }

    // Compact view mode
    const dueLabel =
      service.billingCycle === 'ONE_TIME' ? formatDueDateLabel(service.oneOffDueDate) : null;

    return (
      <div
        data-testid="selected-service-row"
        data-service-name={service.name}
        className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors space-y-2"
      >
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-slate-900 dark:text-white text-sm truncate">
              {service.name}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-300 dark:text-slate-300">
              {service.quantity} × {formatCurrency(service.displayPrice)}
              {service.discountPercent > 0 && (
                <span className="text-amber-600"> · −{service.discountPercent}%</span>
              )}
              {service.vatRate !== 20 && (
                <span className="text-blue-600"> · VAT {service.vatRate}%</span>
              )}
            </p>
            {dueLabel && (
              <p className="text-xs text-primary-600 dark:text-primary-400 mt-0.5">
                Due {dueLabel}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 flex-shrink-0 ml-4">
            <div className="text-right">
              <span className="font-semibold text-slate-900 dark:text-white text-sm block tabular-nums">
                {formatCurrency(service.grossTotal)}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-300 dark:text-slate-300">
                {formatPriceWithFrequency(service.displayPrice, service.billingCycle)} inc VAT
              </span>
            </div>

            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => moveService(service.id, 'up')}
                className="p-1.5 text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
                title="Move up"
              >
                <ArrowUpIcon className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => moveService(service.id, 'down')}
                className="p-1.5 text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
                title="Move down"
              >
                <ArrowDownIcon className="w-4 h-4" />
              </button>
              <button
                data-testid="edit-service-button"
                onClick={() => startEdit(service)}
                className="p-1.5 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded"
                title="Edit"
              >
                <PencilIcon className="w-4 h-4" />
              </button>
              <button
                data-testid="remove-service-button"
                onClick={() => removeService(service.id)}
                className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                title="Remove"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/80 dark:border-slate-700/80">
          <span className="text-[10px] uppercase tracking-wide text-slate-400 shrink-0">
            Bill every
          </span>
          <BillingCadenceSelector
            size="sm"
            value={service.billingCycle}
            allowedCadences={service.allowedCadences}
            onChange={(cadence) => changeServiceCadence(service.id, cadence)}
          />
        </div>
      </div>
    );
  };

  const claraServiceLines = selectedServices.map((s) => ({
    name: s.name,
    billingFrequency: s.billingCycle,
    displayPrice: s.displayPrice,
  }));

  const showPreviewPane = Boolean(selectedClient && currentStep >= 2 && showLivePreviewPane);
  /** Services step needs full builder width — preview stacks below instead of squeezing the edit column. */
  const sideBySidePreview = showPreviewPane && currentStep !== 2;

  // Plain object literal, recreated each render — same re-render semantics as the monolith.
  const value: ProposalBuilderContextValue = {
    proposalId,
    isEditMode,
    navigate,
    tenant,
    user,
    todayIso,
    currentStep,
    setCurrentStep,
    isLoading,
    clients,
    clientSearch,
    setClientSearch,
    selectedClient,
    selectClient,
    hasResumedDraft,
    restartProposal,
    buildMode,
    selectBuildMode,
    proposalTemplates,
    templatesLoading,
    selectedTemplateId,
    applyingTemplateId,
    applyProposalTemplate,
    loadProposalTemplates,
    saveTemplateDialog,
    setSaveTemplateDialog,
    categories,
    selectedCategory,
    setSelectedCategory,
    serviceSearch,
    setServiceSearch,
    filteredServices,
    selectedServices,
    renderServiceRow,
    renderSelectedServiceRow,
    taxServiceLines,
    applyContingentFeeToLine,
    summary,
    reviewMonthlyCostIncVat,
    includeVat,
    goToReviewStep,
    proposalTitle,
    setProposalTitle,
    coverLetter,
    setCoverLetter,
    coverLetterLoading,
    coverLetterTone,
    applyCoverLetterStyle,
    coverLetterCustomInstruction,
    setCoverLetterCustomInstruction,
    applyingCoverLetterTweak,
    applyCoverLetterTweak,
    contractStartDate,
    setContractStartDate,
    validUntil,
    setValidUntil,
    defaultExpiryDays,
    offerThreePackages,
    setOfferThreePackages,
    pricingTiers,
    setPricingTiers,
    requireTwoSigners,
    setRequireTwoSigners,
    proposalTerms,
    termsLoading,
    validationErrors,
    saveProposal,
    previewPdf,
    aiConfigured,
    aiSuggestLoading,
    aiSuggestions,
    runAiSuggestServices,
    applySingleAiSuggestion,
    applyTweakedAiSuggestion,
    aiCoverLoading,
    aiCoverDraft,
    setAiCoverDraft,
    runAiCoverLetter,
    autoFitLoading,
    autoFitResult,
    setAutoFitResult,
    autoFitDismissed,
    setAutoFitDismissed,
    runAutoFitForClient,
    applyAutoFitSection,
    applyAllAutoFit,
    applyAutoFitService,
    applyTweakedAutoFitService,
    showLivePreviewPane,
    toggleLivePreviewPane,
    showEmailPreview,
    setShowEmailPreview,
    emailDraftPayload,
    previewServices,
    claraServiceLines,
    showPreviewPane,
    sideBySidePreview,
  };

  return (
    <ProposalBuilderContext.Provider value={value}>{children}</ProposalBuilderContext.Provider>
  );
}
