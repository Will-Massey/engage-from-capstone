/**
 * Proposal Builder — compact, editable service selection and pricing.
 *
 * Key features:
 * 1. Compact service selection — more services visible at once
 * 2. Inline editing of price, quantity, discount, and VAT
 * 3. Clear pricing display with edit capability (billing cycles)
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiClient } from '../../utils/api';
import { useAuthStore } from '../../stores/authStore';
import {
  generateDefaultCoverLetter,
  generateCoverLetterForTone,
  COVER_LETTER_STYLES,
  type CoverLetterTone,
  getStyleByTone,
} from '../../data/defaultCoverLetter';
import { toast } from 'react-hot-toast';
import { formatServiceCategory } from '../../utils/serviceCategoryLabels';
import BillingCadenceSelector from './BillingCadenceSelector';
import {
  convertPriceBetweenCadences,
  parseFrequencyOptions,
  type BillingCadence,
} from '../../utils/billingCadence';
import { format, isValid, parseISO, addDays } from 'date-fns';
import {
  ArrowRightIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  CalculatorIcon,
  SparklesIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline';
import ProposalClientPreview from './ProposalClientPreview';
import RegulatoryCheckBanner from './RegulatoryCheckBanner';
import {
  getBuilderPreviewPreference,
  setBuilderPreviewPreference,
} from './builderPreviewStorage';
import { AiDraftPreview, showAiError } from '../ai/AiPanel';
import ProposalHealthCard from '../ai/ProposalHealthCard';
import ProposalBuilderClara from '../ai/ProposalBuilderClara';
import ClientContextCard from '../ai/ClientContextCard';
import AutoFitBanner, { type AutoFitResult } from '../ai/AutoFitBanner';
import ProposalEmailPreviewDialog, { type ProposalEmailDraftInput } from '../ai/ProposalEmailPreviewDialog';
import SaveProposalTemplateDialog from './SaveProposalTemplateDialog';
import {
  loadPricingSuggestion,
  clearPricingSuggestion,
} from '../../utils/pricingSuggestionStorage';
import { AI_COPILOT } from '../../config/aiCopilot';

type BuildMode = 'unset' | 'manual' | 'clara' | 'template';

interface ProposalTemplateSummary {
  id: string;
  name: string;
  description?: string | null;
  title: string;
  serviceCount: number;
  usageCount?: number | null;
  lastUsedAt?: string | null;
}

/** Allow free typing in numeric fields without forcing 0 on empty input */
function parseDecimalInput(value: string, fallback = 0): number {
  if (value === '' || value === '.') return fallback;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function isValidDecimalDraft(value: string): boolean {
  return value === '' || /^[0-9]*\.?[0-9]*$/.test(value);
}

// Types
interface Client {
  id: string;
  name: string;
  companyType: string;
  contactEmail: string;
  contactName?: string | null;
}

interface Service {
  id: string;
  name: string;
  description?: string;
  priceAmount: number;
  priceDisplayMode: 'PER_MONTH' | 'PER_QUARTER' | 'PER_YEAR' | 'ONE_TIME';
  billingCycle: string;
  defaultFrequency?: string;
  category: string;
  frequencyOptions?: string;
  isVatApplicable?: boolean;
  vatRate?: string | number;
}

function newLineId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface SelectedService extends Service {
  /** Unique id per proposal line (for UI/editing — never sent as catalogue serviceId) */
  id: string;
  /** Catalogue template id sent to the API as `serviceId` */
  templateId: string;
  quantity: number;
  discountPercent: number;
  displayPrice: number;
  annualEquivalent: number;
  lineTotal: number;
  vatRate: number;
  vatAmount: number;
  grossTotal: number;
  /** Cadences allowed for this line (from catalog template) */
  allowedCadences: BillingCadence[];
  /** YYYY-MM-DD when billing is ONE_TIME */
  oneOffDueDate?: string;
}

/** Legacy key — all new proposals shared one draft; migrated to per-client keys on load */
const LEGACY_NEW_DRAFT_KEY = 'engage-draft-new';

interface ProposalDraft {
  selectedServices?: SelectedService[];
  proposalTitle?: string;
  coverLetter?: string;
  coverLetterTone?: CoverLetterTone;
  currentStep?: number;
  contractStartDate?: string;
  validUntil?: string;
  buildMode?: BuildMode;
  selectedTemplateId?: string | null;
}

function proposalDraftKey(proposalId: string | undefined, clientId: string | null): string {
  if (proposalId) return `engage-draft-${proposalId}`;
  return clientId ? `engage-draft-new-${clientId}` : LEGACY_NEW_DRAFT_KEY;
}

interface BandTotals {
  subtotal: number;
  vat: number;
  total: number;
  count: number;
}

interface PricingSummary {
  weekly: BandTotals;
  monthly: BandTotals;
  quarterly: BandTotals;
  annually: BandTotals;
  oneTime: BandTotals;
  /** Sum of all line gross totals (matches stored proposal total) */
  contractTotalIncVat: number;
  totalSubtotalExVat: number;
  totalVat: number;
}

const STEPS = [
  { id: 1, name: 'Select Client', description: 'Choose who this proposal is for' },
  { id: 2, name: 'Add Services', description: 'Select and customise services' },
  { id: 3, name: 'Review & Send', description: 'Review and send proposal' },
];

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

/** Monthly / annual / one-time investment bands for proposal summaries */
function InvestmentSummaryBands({ summary }: { summary: PricingSummary }) {
  return (
    <div className="space-y-2">
      {summary.monthly.count > 0 && (
        <div className="flex justify-between items-baseline">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-100">Monthly</span>
          <span className="text-lg font-semibold text-slate-900 dark:text-white tabular-nums">
            {formatCurrency(summary.monthly.total)}
            <span className="text-xs font-normal text-slate-500 ml-1">/month</span>
          </span>
        </div>
      )}
      {summary.annually.count > 0 && (
        <div className="flex justify-between items-baseline">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-100">Annual</span>
          <span className="text-lg font-semibold text-slate-900 dark:text-white tabular-nums">
            {formatCurrency(summary.annually.total)}
            <span className="text-xs font-normal text-slate-500 ml-1">/year</span>
          </span>
        </div>
      )}
      {summary.quarterly.count > 0 && (
        <div className="flex justify-between items-baseline">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-100">Quarterly</span>
          <span className="text-lg font-semibold text-slate-900 dark:text-white tabular-nums">
            {formatCurrency(summary.quarterly.total)}
            <span className="text-xs font-normal text-slate-500 ml-1">/quarter</span>
          </span>
        </div>
      )}
      {summary.weekly.count > 0 && (
        <div className="flex justify-between items-baseline">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-100">Weekly</span>
          <span className="text-lg font-semibold text-slate-900 dark:text-white tabular-nums">
            {formatCurrency(summary.weekly.total)}
            <span className="text-xs font-normal text-slate-500 ml-1">/week</span>
          </span>
        </div>
      )}
      {summary.oneTime.count > 0 && (
        <div className="flex justify-between items-baseline">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-100">One-time</span>
          <span className="text-lg font-semibold text-slate-900 dark:text-white tabular-nums">
            {formatCurrency(summary.oneTime.total)}
          </span>
        </div>
      )}
    </div>
  );
}

/** Average monthly cash flow (inc VAT) for a recurring line; one-off → 0 */
function recurringMonthlyEquivalentIncVat(s: SelectedService): number {
  if (s.billingCycle === 'ONE_TIME') return 0;
  switch (s.billingCycle) {
    case 'WEEKLY':
      return s.grossTotal * (52 / 12);
    case 'MONTHLY':
      return s.grossTotal;
    case 'QUARTERLY':
      return s.grossTotal / 3;
    case 'ANNUALLY':
      return s.grossTotal / 12;
    default:
      return s.grossTotal;
  }
}

function coverLetterAddressee(client: Client): string {
  const n = client.contactName?.trim();
  return n || client.name;
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

// Format currency only
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
};

// Calculate annual equivalent
const calculateAnnualEquivalent = (price: number, frequency: string): number => {
  switch (frequency) {
    case 'MONTHLY':
      return price * 12;
    case 'QUARTERLY':
      return price * 4;
    case 'ANNUALLY':
      return price;
    case 'ONE_TIME':
      return 0;
    case 'WEEKLY':
      return price * 52;
    default:
      return price * 12;
  }
};

// Approximate monthly cash flow (catalog list only — not mixed into proposal totals)
const calculateMonthlyEquivalent = (price: number, frequency: string): number => {
  switch (frequency) {
    case 'MONTHLY':
      return price;
    case 'QUARTERLY':
      return price / 4;
    case 'ANNUALLY':
      return price / 12;
    case 'ONE_TIME':
      return price;
    case 'WEEKLY':
      return (price * 52) / 12;
    default:
      return price;
  }
};

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

interface ProposalBuilderProps {
  proposalId?: string;
}

export default function ProposalBuilder({ proposalId }: ProposalBuilderProps) {
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

  // AI assistance
  const [aiConfigured, setAiConfigured] = useState(false);
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any>(null);
  const [aiCoverLoading, setAiCoverLoading] = useState(false);
  const [aiCoverDraft, setAiCoverDraft] = useState<string | null>(null);
  const [showLivePreviewPane, setShowLivePreviewPane] = useState(() => getBuilderPreviewPreference());

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
  const [saveTemplateDialog, setSaveTemplateDialog] = useState<{ open: boolean; proposalId: string }>({
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
    setSelectedServices(draft.selectedServices?.length ? draft.selectedServices : []);
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
      const vatAmount = includeVat ? Math.round(lineTotal * (vatPercent / 100) * 100) / 100 : 0;

      lines.push({
        ...catalogue,
        id: newLineId(),
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
  }, [isEditMode, fromPricingParam, services.length, preselectedClientId, includeVat, proposalTitle]);

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
      !selectedClient ||
      services.length === 0 ||
      preselectedTemplateAppliedRef.current
    ) {
      return;
    }
    preselectedTemplateAppliedRef.current = true;
    void applyProposalTemplate(preselectedTemplateId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, preselectedTemplateId, selectedClient?.id, services.length]);

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
    if (currentStep !== 3 || !selectedClient || selectedServices.length === 0 || !aiConfigured) return;
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
      const mappedServices = (response.data || []).map((s: any) => {
        const derivedBillingCycle =
          s.billingCycle === 'ONE_TIME' || s.defaultFrequency === 'ONE_TIME'
            ? 'ONE_TIME'
            : s.defaultFrequency && s.defaultFrequency !== 'MONTHLY'
              ? s.defaultFrequency
              : s.billingCycle || 'MONTHLY';
        return {
          ...s,
          priceAmount: s.priceAmount || s.basePrice || 0,
          billingCycle: derivedBillingCycle,
          frequencyOptions: s.frequencyOptions,
        };
      });
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
  const getEditingPreview = useCallback((original: SelectedService): SelectedService => {
    const quantity = editForm.quantity || 1;
    const discount = editForm.discountPercent || 0;
    const price = editForm.displayPrice || 0;
    const vatRate = editForm.vatRate || 0;

    const grossLineTotal = price * quantity;
    const discountAmount = grossLineTotal * (discount / 100);
    const lineTotal = grossLineTotal - discountAmount;
    const vatAmount = includeVat ? Math.round(lineTotal * (vatRate / 100) * 100) / 100 : 0;

    return {
      ...original,
      displayPrice: price,
      quantity,
      discountPercent: discount,
      vatRate,
      billingCycle: editForm.billingCycle,
      lineTotal,
      vatAmount,
      grossTotal: lineTotal + vatAmount,
      annualEquivalent: calculateAnnualEquivalent(price, editForm.billingCycle),
      oneOffDueDate:
        editForm.billingCycle === 'ONE_TIME' && editForm.oneOffDueDate.trim()
          ? editForm.oneOffDueDate.trim()
          : undefined,
    };
  }, [editForm, includeVat]);

  // Calculate summary (includes live preview of editing service)
  // Totals are per billing period (no blending annual into "monthly investment")
  const summary: PricingSummary = useMemo(() => {
    const servicesForSummary = editingService
      ? selectedServices.map((s) => (s.id === editingService ? getEditingPreview(s) : s))
      : selectedServices;

    const calcGroup = (items: SelectedService[]) => ({
      subtotal: items.reduce((sum, s) => sum + s.lineTotal, 0),
      vat: items.reduce((sum, s) => sum + s.vatAmount, 0),
      total: items.reduce((sum, s) => sum + s.grossTotal, 0),
      count: items.length,
    });

    const weekly = servicesForSummary.filter((s) => s.billingCycle === 'WEEKLY');
    const monthly = servicesForSummary.filter((s) => s.billingCycle === 'MONTHLY');
    const quarterly = servicesForSummary.filter((s) => s.billingCycle === 'QUARTERLY');
    const annually = servicesForSummary.filter((s) => s.billingCycle === 'ANNUALLY');
    const oneTime = servicesForSummary.filter((s) => s.billingCycle === 'ONE_TIME');

    const weeklyGroup = calcGroup(weekly);
    const monthlyGroup = calcGroup(monthly);
    const quarterlyGroup = calcGroup(quarterly);
    const annualGroup = calcGroup(annually);
    const oneTimeGroup = calcGroup(oneTime);

    const contractTotalIncVat =
      weeklyGroup.total + monthlyGroup.total + quarterlyGroup.total + annualGroup.total + oneTimeGroup.total;
    const totalSubtotalExVat =
      weeklyGroup.subtotal + monthlyGroup.subtotal + quarterlyGroup.subtotal + annualGroup.subtotal + oneTimeGroup.subtotal;
    const totalVat =
      weeklyGroup.vat + monthlyGroup.vat + quarterlyGroup.vat + annualGroup.vat + oneTimeGroup.vat;

    return {
      weekly: weeklyGroup,
      monthly: monthlyGroup,
      quarterly: quarterlyGroup,
      annually: annualGroup,
      oneTime: oneTimeGroup,
      contractTotalIncVat,
      totalSubtotalExVat,
      totalVat,
    };
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
    const grossLineTotal = price * quantity;
    const discountAmount = grossLineTotal * (discountPercent / 100);
    const lineTotal = grossLineTotal - discountAmount;
    const vatAmount = includeVat ? Math.round(lineTotal * (vatRate / 100) * 100) / 100 : 0;
    return {
      lineTotal,
      vatAmount,
      grossTotal: lineTotal + vatAmount,
      annualEquivalent: calculateAnnualEquivalent(price, billingCycle),
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
        const newPrice = convertPriceBetweenCadences(svc.displayPrice, svc.billingCycle, newCadence);
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
    if (
      !coverLetter.trim() &&
      selectedClient &&
      !isEditMode &&
      !proposalId &&
      !aiConfigured
    ) {
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
    if (selectedServices.find((s) => s.templateId === service.id)) {
      return false;
    }

    const price = overridePrice ?? service.priceAmount ?? 0;
    const frequency = billingFrequency || service.billingCycle || service.defaultFrequency || 'MONTHLY';
    const annualEquivalent = calculateAnnualEquivalent(price, frequency);
    const lineTotal = price;

    const vatPercent =
      service.isVatApplicable !== false
        ? service.vatRate === 'REDUCED_5'
          ? 5
          : service.vatRate === 'ZERO' || service.vatRate === 'EXEMPT'
            ? 0
            : 20
        : 0;
    const vatAmount = includeVat ? Math.round(lineTotal * (vatPercent / 100) * 100) / 100 : 0;

    const allowedCadences = parseFrequencyOptions(service.frequencyOptions);

    const newService: SelectedService = {
      ...service,
      id: newLineId(),
      templateId: service.id,
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
      allowedCadences,
      oneOffDueDate: frequency === 'ONE_TIME' ? '' : undefined,
    };

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
    const sug = aiSuggestions.suggestions.find((s: { serviceId: string }) => s.serviceId === serviceId);
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
      const remaining = prev.suggestions.filter((s: { serviceId: string }) => s.serviceId !== serviceId);
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
      const name = aiSuggestions?.suggestions?.find((s: { serviceId: string }) => s.serviceId === serviceId)?.name;
      toast.success(name ? `${name} added with your tweaks` : 'Service added with your tweaks');
    }
    setAiSuggestions((prev: typeof aiSuggestions) => {
      if (!prev?.suggestions?.length) return prev;
      const remaining = prev.suggestions.filter((s: { serviceId: string }) => s.serviceId !== serviceId);
      if (!remaining.length) return null;
      return { ...prev, suggestions: remaining };
    });
  };

  const applyAutoFitService = (sug: { serviceId: string; name: string; billingFrequency: string; displayPrice: number }) => {
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
    toast.success(added ? `Added ${added} suggested service${added === 1 ? '' : 's'}` : 'Services already selected');
    setAiSuggestions(null);
  };

  const runAiCoverLetter = async () => {
    if (!selectedClient) {
      toast.error('Select a client first');
      return;
    }
    if (!coverLetter.trim()) {
      toast.error('Add or load a cover letter first — Clara revises your template, she does not draft from scratch');
      return;
    }
    setAiCoverLoading(true);
    try {
      const serviceSummary = selectedServices.map((s) => s.name).join(', ') || 'your selected services';
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
      const res = (await apiClient.aiCoverLetterRevise(coverLetter, instruction, { clientId: selectedClient?.id })) as any;
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
    if (!force && coverLetter.trim().length >= 120 && coverLetterServicesKeyRef.current === servicesKey) {
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
  }, [selectedClient, proposalTitle, coverLetter, validUntil, tenant?.name, user, selectedServices]);

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
        const grossLineTotal = price * quantity;
        const discountAmount = grossLineTotal * (discount / 100);
        const lineTotal = grossLineTotal - discountAmount;
        const vatAmount = includeVat ? Math.round(lineTotal * (vatRate / 100) * 100) / 100 : 0;

        return {
          ...s,
          displayPrice: price,
          quantity,
          discountPercent: discount,
          vatRate,
          billingCycle: editForm.billingCycle,
          lineTotal,
          vatAmount,
          grossTotal: lineTotal + vatAmount,
          annualEquivalent: calculateAnnualEquivalent(price, editForm.billingCycle),
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
    const vatAmount = includeVat ? Math.round(lineTotal * (vatPercent / 100) * 100) / 100 : 0;
    const allowedCadences = parseFrequencyOptions(service.frequencyOptions);

    return {
      ...service,
      id: newLineId(),
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

  const applyProposalTemplate = async (templateId: string) => {
    setApplyingTemplateId(templateId);
    try {
      const res = (await apiClient.getProposalTemplate(templateId)) as any;
      if (!res.success) {
        toast.error('Could not load template');
        return;
      }
      const t = res.data;
      setProposalTitle(t.title || '');
      if (t.coverLetter) setCoverLetter(t.coverLetter);
      const pricing =
        typeof t.defaultPricing === 'object' && t.defaultPricing
          ? t.defaultPricing
          : {};
      if (pricing.coverLetterTone) {
        setCoverLetterTone(pricing.coverLetterTone as CoverLetterTone);
      }

      const config = Array.isArray(t.serviceConfig) ? t.serviceConfig : [];
      const lines: SelectedService[] = [];
      const missing: string[] = [];
      for (const item of config) {
        const catalogue = services.find((s) => s.id === item.serviceId);
        if (!catalogue) {
          missing.push(item.name || item.serviceId);
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
      setSelectedServices(lines);
      setSelectedTemplateId(templateId);
      await apiClient.recordProposalTemplateUse(templateId);
      if (missing.length > 0) {
        toast(
          `${missing.length} service(s) from this template are no longer in your catalogue — the rest were applied`
        );
      } else {
        toast.success(`Template "${t.name}" applied`);
      }
    } catch {
      toast.error('Failed to apply template');
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
      setCoverLetter(legacySummary && letter ? `${letter}\n\n${legacySummary}` : letter || legacySummary);
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
        const vatAmount = svc.vatAmount ?? Math.round(net * (vatRate / 100) * 100) / 100;
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
          oneOffDueDate: svc.oneOffDueDate
            ? String(svc.oneOffDueDate).slice(0, 10)
            : undefined,
        };
      });
      setSelectedServices(lines);
      setCurrentStep(lines.length > 0 ? 2 : 1);
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

  const collectValidationErrors = (): string[] => {
    const errors: string[] = [];
    if (!selectedClient) errors.push('Select a client');
    if (selectedServices.length === 0) errors.push('Add at least one service');
    const missingCatalogue = selectedServices.filter((s) => !s.templateId);
    if (missingCatalogue.length > 0) {
      errors.push(
        `${missingCatalogue.length} service line(s) are not linked to your catalogue — remove and re-add them`
      );
    }
    if (!proposalTitle.trim()) errors.push('Enter a proposal title');
    if (!validUntil) errors.push('Set a proposal expiry date');
    if (validUntil && validUntil < todayIso) errors.push('Expiry date must be today or in the future');
    if (coverLetter.trim().length > 0 && coverLetter.trim().length < 80) {
      errors.push('Proposal letter is very short — regenerate with Clara or expand it');
    }
    if (!coverLetter.trim()) {
      errors.push('Generate the client proposal letter before saving');
    }
    return errors;
  };

  const saveProposal = async () => {
    const errors = collectValidationErrors();
    setValidationErrors(errors);
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }

    setIsLoading(true);
    try {
      const servicesData = selectedServices
        .filter((s) => s.templateId)
        .map((s) => ({
          serviceId: s.templateId,
          name: s.name,
          description: s.description ?? null,
          displayPrice: s.displayPrice,
          billingFrequency: s.billingCycle,
          quantity: s.quantity,
          discountPercent: s.discountPercent,
          vatRate: includeVat ? s.vatRate : 0,
          ...(s.billingCycle === 'ONE_TIME' && s.oneOffDueDate?.trim()
            ? { oneOffDueDate: s.oneOffDueDate.trim() }
            : {}),
        }));

      const proposalData = {
        clientId: selectedClient!.id,
        title: proposalTitle,
        services: servicesData,
        ...(validUntil ? { validUntil: `${validUntil}T12:00:00.000Z` } : {}),
        contractStartDate: contractStartDate.trim()
          ? `${contractStartDate.trim()}T12:00:00.000Z`
          : null,
        coverLetter: coverLetter.trim(),
        paymentTerms: `${defaultPaymentTermsDays} day${defaultPaymentTermsDays === 1 ? '' : 's'}`,
        ...(proposalTerms.trim() ? { terms: proposalTerms.trim() } : {}),
      };

      const response = isEditMode
        ? ((await apiClient.updateProposal(proposalId!, proposalData)) as any)
        : ((await apiClient.createProposal(proposalData)) as any);

      if (response.success) {
        if (selectedClient) {
          localStorage.removeItem(proposalDraftKey(undefined, selectedClient.id));
        }
        localStorage.removeItem(LEGACY_NEW_DRAFT_KEY);
        toast.success(isEditMode ? 'Proposal updated successfully!' : 'Proposal created successfully!');
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

  // Render step indicator
  const renderStepIndicator = () => (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
      <div className="flex items-center justify-center flex-1">
      {STEPS.map((step, index) => (
        <div key={step.id} className="flex items-center">
          <div
            className={`flex flex-col items-center ${currentStep >= step.id ? 'cursor-pointer' : ''}`}
            onClick={() => {
              if (currentStep > step.id) setCurrentStep(step.id);
            }}
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors ${
                currentStep === step.id
                  ? 'bg-primary-600 text-white'
                  : currentStep > step.id
                    ? 'bg-green-500 text-white'
                    : 'bg-slate-200 text-slate-500'
              }`}
            >
              {currentStep > step.id ? <CheckIcon className="w-5 h-5" /> : step.id}
            </div>
            <span
              className={`text-xs mt-2 ${currentStep === step.id ? 'text-primary-600 font-medium' : 'text-slate-500'}`}
            >
              {step.name}
            </span>
          </div>
          {index < STEPS.length - 1 && (
            <div
              className={`w-16 h-0.5 mx-2 ${currentStep > step.id ? 'bg-green-500' : 'bg-slate-200'}`}
            />
          )}
        </div>
      ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {!isEditMode && selectedClient && currentStep > 1 && (
          <>
            <button
              type="button"
              data-testid="back-to-step-one"
              onClick={() => setCurrentStep(1)}
              className="btn-secondary text-sm"
            >
              Back to start
            </button>
            <button
              type="button"
              data-testid="restart-proposal"
              onClick={() => restartProposal(true)}
              className="btn-secondary text-sm text-amber-800 border-amber-200 dark:text-amber-200 dark:border-amber-800"
            >
              Restart proposal
            </button>
          </>
        )}
        {selectedClient && currentStep >= 2 && (
          <button
            type="button"
            data-testid="toggle-client-preview-pane"
            onClick={() => toggleLivePreviewPane()}
            className={`btn-secondary text-sm inline-flex items-center gap-2 ${
              showLivePreviewPane ? 'border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300' : ''
            }`}
          >
            {showLivePreviewPane ? (
              <EyeSlashIcon className="h-4 w-4" aria-hidden="true" />
            ) : (
              <EyeIcon className="h-4 w-4" aria-hidden="true" />
            )}
            {showLivePreviewPane ? 'Hide client preview' : 'Show client preview'}
          </button>
        )}
      </div>
    </div>
  );

  // Render Step 1: Client Selection
  const renderClientStep = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Select a Client</h2>

      {!isEditMode && selectedClient && hasResumedDraft && (
        <div
          data-testid="draft-resume-banner"
          className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 p-4 flex flex-wrap items-center justify-between gap-3"
        >
          <p className="text-sm text-amber-900 dark:text-amber-100">
            You have a draft in progress for <strong>{selectedClient.name}</strong>. Continue where you
            left off, go back to change the build approach, or restart from scratch.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary text-sm"
              onClick={() => {
                if (selectedServices.length > 0 && coverLetter.trim()) setCurrentStep(3);
                else if (selectedServices.length > 0) setCurrentStep(2);
                else setCurrentStep(1);
              }}
            >
              Continue draft
            </button>
            <button type="button" className="btn-secondary text-sm" onClick={() => restartProposal(true)}>
              Restart
            </button>
          </div>
        </div>
      )}

      <div className="relative">
        <input
          type="text"
          placeholder="Search clients..."
          value={clientSearch}
          onChange={(e) => setClientSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
        <MagnifyingGlassIcon className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clients
          .filter((c) => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
          .map((client) => (
            <div
              key={client.id}
              data-testid="client-card"
              data-client-name={client.name}
              onClick={() => selectClient(client)}
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                selectedClient?.id === client.id
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-600 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <h3 className="font-semibold text-slate-900 dark:text-white">{client.name}</h3>
              {client.contactName?.trim() && (
                <p className="text-sm text-slate-600 dark:text-slate-300">{client.contactName.trim()}</p>
              )}
              <p className="text-sm text-slate-500 dark:text-slate-400">{client.companyType}</p>
              <p className="text-sm text-slate-400 dark:text-slate-500">{client.contactEmail}</p>
            </div>
          ))}
      </div>

      {selectedClient && buildMode === 'unset' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/50 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            How would you like to build this proposal?
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            You can always add or remove services yourself — Clara suggestions are optional.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              type="button"
              data-testid="build-mode-manual"
              onClick={() => selectBuildMode('manual')}
              className="text-left p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-primary-400 dark:hover:border-primary-600 transition-colors"
            >
              <p className="font-semibold text-slate-900 dark:text-white">Build from scratch</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Pick services from your catalogue, set prices, and shape the proposal yourself.
              </p>
            </button>
            {proposalTemplates.length > 0 && (
              <button
                type="button"
                data-testid="build-mode-template"
                onClick={() => selectBuildMode('template')}
                className="text-left p-4 rounded-xl border-2 border-emerald-200 dark:border-emerald-800 hover:border-emerald-400 dark:hover:border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/20 transition-colors"
              >
                <p className="font-semibold text-slate-900 dark:text-white">Use a saved template</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Start from a named bundle you saved before — adjust anything before sending.
                </p>
              </button>
            )}
            {aiConfigured && (
              <button
                type="button"
                data-testid="build-mode-clara"
                onClick={() => selectBuildMode('clara')}
                className="text-left p-4 rounded-xl border-2 border-violet-200 dark:border-violet-800 hover:border-violet-400 dark:hover:border-violet-600 bg-violet-50/50 dark:bg-violet-950/20 transition-colors"
              >
                <p className="font-semibold text-slate-900 dark:text-white">
                  Start with {AI_COPILOT.name} suggestions
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Optional starter bundle — accept, tweak, add, or remove anything before sending.
                </p>
              </button>
            )}
          </div>
          {!aiConfigured && (
            <button
              type="button"
              onClick={() => selectBuildMode('manual')}
              className="btn-primary text-sm"
            >
              Continue manually
            </button>
          )}
        </div>
      )}

      {selectedClient && buildMode === 'template' && (
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/20 p-4 space-y-3">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Choose a template</h4>
          {templatesLoading ? (
            <p className="text-xs text-slate-500">Loading templates…</p>
          ) : proposalTemplates.length === 0 ? (
            <p className="text-xs text-slate-500">
              No saved templates yet —{' '}
              <Link to="/templates" className="text-emerald-700 dark:text-emerald-400 hover:underline">
                create one in Templates
              </Link>{' '}
              or build from scratch and {AI_COPILOT.name} will offer to save when you finish.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {proposalTemplates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  data-testid="proposal-template-option"
                  disabled={applyingTemplateId === tpl.id}
                  onClick={() => void applyProposalTemplate(tpl.id)}
                  className={`text-left p-3 rounded-xl border-2 transition-colors ${
                    selectedTemplateId === tpl.id
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30'
                      : 'border-slate-200 dark:border-slate-700 hover:border-emerald-400'
                  }`}
                >
                  <p className="font-medium text-slate-900 dark:text-white text-sm">{tpl.name}</p>
                  {tpl.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                      {tpl.description}
                    </p>
                  )}
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                    {tpl.serviceCount} service{tpl.serviceCount === 1 ? '' : 's'}
                    {applyingTemplateId === tpl.id ? ' — applying…' : ''}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedClient && buildMode !== 'unset' && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {buildMode === 'manual'
              ? 'Manual build — add services from your catalogue on the next step.'
              : buildMode === 'template'
                ? selectedTemplateId
                  ? 'Template applied — tweak services and pricing on the next step.'
                  : 'Pick a template above, or change approach.'
                : `${AI_COPILOT.name} may suggest a starter — you stay in control of every line item.`}
            <button
              type="button"
              className="ml-2 text-primary-600 hover:underline"
              onClick={() => selectBuildMode('unset')}
            >
              Change
            </button>
          </p>
          <button
            data-testid="client-continue-button"
            onClick={() => setCurrentStep(2)}
            disabled={buildMode === 'template' && !selectedTemplateId}
            className="btn-primary disabled:opacity-50"
          >
            Continue
            <ArrowRightIcon className="w-5 h-5 ml-2" />
          </button>
        </div>
      )}
    </div>
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
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{service.category}</p>
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
              <button data-testid="cancel-edit-button" onClick={cancelEdit} className="p-1 text-red-600 hover:bg-red-100 rounded">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            {/* Price */}
            <div className="min-w-[5.5rem] flex-[1_1_5.5rem]">
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">Price (£)</label>
              <input
                data-testid="edit-price-input"
                type="text"
                inputMode="decimal"
                value={editPriceText}
                onChange={(e) => {
                  const next = e.target.value;
                  if (!isValidDecimalDraft(next)) return;
                  setEditPriceText(next);
                  setEditForm({ ...editForm, displayPrice: parseDecimalInput(next, editForm.displayPrice) });
                }}
                className="w-full px-2 py-1 text-sm border rounded dark:bg-slate-800 dark:border-slate-600"
              />
            </div>

            {/* Quantity */}
            <div className="min-w-[4rem] flex-[1_1_4rem]">
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">Qty</label>
              <input
                type="number"
                min={1}
                value={editForm.quantity}
                onChange={(e) => setEditForm({ ...editForm, quantity: Number(e.target.value) })}
                className="w-full px-2 py-1 text-sm border rounded dark:bg-slate-800 dark:border-slate-600"
              />
            </div>

            {/* Discount */}
            <div className="min-w-[4.5rem] flex-[1_1_4.5rem]">
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">Disc %</label>
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
            <div className="min-w-[5rem] flex-[1_1_5rem]">
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">VAT %</label>
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
            <div className="w-full min-w-0 flex-[1_1_100%]">
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                Billing period
              </label>
              <BillingCadenceSelector
                size="sm"
                className="w-full max-w-full"
                value={editForm.billingCycle}
                allowedCadences={
                  selectedServices.find((s) => s.id === service.id)?.allowedCadences
                }
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
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">
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
            <span className="text-xs text-slate-500">Preview (inc. VAT):</span>
            <span className="font-semibold text-primary-600 text-sm">
              {formatCurrency(
                editForm.displayPrice *
                  editForm.quantity *
                  (1 - editForm.discountPercent / 100) *
                  (1 + (includeVat ? editForm.vatRate : 0) / 100)
              )}
              <span className="text-xs text-slate-500 font-normal ml-1">
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
    const dueLabel = service.billingCycle === 'ONE_TIME' ? formatDueDateLabel(service.oneOffDueDate) : null;

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
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {service.quantity} × {formatCurrency(service.displayPrice)}
            {service.discountPercent > 0 && (
              <span className="text-amber-600"> · −{service.discountPercent}%</span>
            )}
            {service.vatRate !== 20 && <span className="text-blue-600"> · VAT {service.vatRate}%</span>}
          </p>
          {dueLabel && (
            <p className="text-xs text-primary-600 dark:text-primary-400 mt-0.5">Due {dueLabel}</p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
          <div className="text-right">
            <span className="font-semibold text-slate-900 dark:text-white text-sm block tabular-nums">
              {formatCurrency(service.grossTotal)}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {formatPriceWithFrequency(service.displayPrice, service.billingCycle)} inc VAT
            </span>
          </div>

          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => moveService(service.id, 'up')}
              className="p-1.5 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
              title="Move up"
            >
              <ArrowUpIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => moveService(service.id, 'down')}
              className="p-1.5 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
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
          <span className="text-[10px] uppercase tracking-wide text-slate-400 shrink-0">Bill every</span>
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

  // Render Step 2: Services
  const renderServicesStep = () => (
    <div className="space-y-6">
      {/* Header with search */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Add Services</h2>
        <div className="relative">
          <input
            type="text"
            placeholder="Search services..."
            value={serviceSearch}
            onChange={(e) => setServiceSearch(e.target.value)}
            className="input-field w-full md:w-64 pl-10"
          />
          <MagnifyingGlassIcon className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
        </div>
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
              selectedCategory === cat
                ? 'bg-primary-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {cat === 'ALL' ? 'All categories' : formatServiceCategory(cat)}
          </button>
        ))}
      </div>

      {/* Two-column layout: Available Services | Selected Services */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,1.2fr)] gap-6">
        {/* Available Services - Compact List */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide">
            Available ({filteredServices.length})
          </h3>
          <div className="max-h-[500px] overflow-y-auto space-y-1 pr-1">
            {filteredServices.map(renderServiceRow)}
          </div>
        </div>

        {/* Selected Services */}
        <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide">
              Selected ({selectedServices.length})
            </h3>
            {selectedServices.length > 0 && (
              <button
                type="button"
                onClick={clearAllServices}
                className="text-[10px] text-red-600 hover:underline"
              >
                Clear all
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Click any service on the left to add or remove. Edit price, quantity, and billing per line.
          </p>

          {selectedServices.length === 0 ? (
            <div className="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
              <CalculatorIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Click services from the left to add them</p>
            </div>
          ) : (
            <>
              <div className="max-h-[min(70vh,560px)] overflow-y-auto space-y-2 pr-1">
                {selectedServices.map(renderSelectedServiceRow)}
              </div>

              {/* Investment by billing period */}
              <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-100 dark:border-primary-800 space-y-3 text-sm">
                <InvestmentSummaryBands summary={summary} />
                <div className="flex justify-between items-center pt-2 border-t border-primary-200 dark:border-primary-800 text-sm">
                  <span className="text-slate-600 dark:text-slate-300">Subtotal (ex VAT)</span>
                  <span className="font-medium text-slate-900 dark:text-white tabular-nums">
                    {formatCurrency(summary.totalSubtotalExVat)}
                  </span>
                </div>
                {includeVat && (
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-300">VAT</span>
                    <span className="font-medium text-slate-900 dark:text-white tabular-nums">
                      {formatCurrency(summary.totalVat)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-baseline pt-1">
                  <span className="font-semibold text-slate-900 dark:text-white">Combined total</span>
                  <span className="text-lg font-bold text-primary-600 tabular-nums">
                    {formatCurrency(summary.contractTotalIncVat)}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
        <button data-testid="services-back-button" onClick={() => setCurrentStep(1)} className="btn-secondary">
          <ArrowLeftIcon className="w-5 h-5 mr-2" />
          Back
        </button>
        {selectedServices.length > 0 && (
          <button data-testid="services-continue-button" onClick={goToReviewStep} className="btn-primary">
            Continue
            <ArrowRightIcon className="w-5 h-5 ml-2" />
          </button>
        )}
      </div>
    </div>
  );

  // Render Step 3: Review
  const renderReviewStep = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Review & Send</h2>

      {/* Contract start & proposal validity */}
      <div className="card p-4">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Contract & validity</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Set when the engagement begins and how long this proposal stays open. Annual renewals are
          calculated from the contract start date (or acceptance if left blank).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Contract start date
            </label>
            <input
              data-testid="contract-start-date"
              type="date"
              value={contractStartDate}
              onChange={(e) => setContractStartDate(e.target.value)}
              className="input-field w-full"
            />
            <p className="mt-1 text-xs text-slate-500">Optional — use for future-dated engagements</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Proposal valid until
            </label>
            <input
              data-testid="proposal-valid-until"
              type="date"
              value={validUntil}
              min={todayIso}
              onChange={(e) => setValidUntil(e.target.value)}
              className="input-field w-full"
            />
            <p className="mt-1 text-xs text-slate-500">
              Practice default: {defaultExpiryDays} days (change in Settings → Communications)
            </p>
          </div>
        </div>
      </div>

      {/* Proposal Title */}
      <div className="card p-4 border-2 border-primary-200 dark:border-primary-800 bg-primary-50/30 dark:bg-primary-900/10">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
          Proposal Title *
        </label>
        <input
          data-testid="proposal-title-input"
          type="text"
          value={proposalTitle}
          onChange={(e) => setProposalTitle(e.target.value)}
          placeholder="e.g., Accounting Services 2026"
          className="input-field w-full text-lg font-medium"
        />
      </div>

      {/* Client Summary */}
      <div className="card p-4">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Client</h3>
        <p className="text-slate-700 dark:text-slate-200">{selectedClient?.name}</p>
        {selectedClient?.contactName?.trim() && (
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{selectedClient.contactName.trim()}</p>
        )}
        <p className="text-sm text-slate-500 dark:text-slate-400">{selectedClient?.contactEmail}</p>
      </div>

      {/* Services — editable rows, grouped for clarity */}
      <div className="card p-6">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Services</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Choose each service&apos;s billing period below — prices adjust automatically when you
          change cadence. Use edit for price, quantity, VAT, or one-off due dates.
        </p>

        <div className="space-y-2">
          {selectedServices.map(renderSelectedServiceRow)}
        </div>

        <div className="mt-6 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-600 space-y-3">
          <InvestmentSummaryBands summary={summary} />
        </div>
      </div>

      {/* Client proposal letter — verbose sales prose */}
      <div className="card p-4 border border-primary-100 dark:border-primary-900/40">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Proposal letter for your client
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-xl">
              Persuasive, personal sales prose — introduces each service and its benefits before the fee
              schedule. This is your key differentiator; edit freely after Clara drafts it.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {aiConfigured && (
              <button
                type="button"
                onClick={() => void runGenerateClientCoverLetter(true)}
                disabled={coverLetterLoading || selectedServices.length === 0}
                className="text-xs inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-950/30 disabled:opacity-50"
              >
                <SparklesIcon className={`h-3.5 w-3.5 ${coverLetterLoading ? 'animate-pulse' : ''}`} />
                {coverLetterLoading ? 'Writing…' : coverLetter.trim() ? `Regenerate with ${AI_COPILOT.name}` : `Draft with ${AI_COPILOT.name}`}
              </button>
            )}
            {coverLetter.trim().length >= 20 && aiConfigured && (
              <button
                type="button"
                onClick={runAiCoverLetter}
                disabled={aiCoverLoading || !aiConfigured}
                className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/30 disabled:opacity-50"
                title={AI_COPILOT.reviseWithLabel}
              >
                <SparklesIcon className={`h-3.5 w-3.5 ${aiCoverLoading ? 'animate-pulse' : ''}`} />
                {aiCoverLoading ? 'Revising…' : 'Polish'}
              </button>
            )}
          </div>
        </div>

        {aiCoverDraft && (
          <AiDraftPreview
            content={aiCoverDraft}
            onApply={() => {
              setCoverLetter(aiCoverDraft);
              setAiCoverDraft(null);
              toast.success(`${AI_COPILOT.name}'s letter applied — review before sending`);
            }}
            onDiscard={() => setAiCoverDraft(null)}
            onEdit={() => {
              if (aiCoverDraft) {
                setCoverLetter(aiCoverDraft);
                setAiCoverDraft(null);
                toast('Draft moved to editor — make your changes there');
              }
            }}
            onRegenerate={runAiCoverLetter}
            isStreaming={aiCoverLoading}
            applyLabel="Accept letter"
          />
        )}

        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
          Addressed to {selectedClient ? coverLetterAddressee(selectedClient) : 'your client'} at{' '}
          {selectedClient?.name || 'their business'}.
        </p>

        {coverLetterLoading && !coverLetter.trim() && (
          <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400" aria-busy="true">
            <SparklesIcon className="h-6 w-6 text-primary-500 mx-auto animate-pulse mb-2" />
            {AI_COPILOT.name} is writing your client proposal letter…
          </div>
        )}

        <textarea
          value={coverLetter}
          onChange={(e) => setCoverLetter(e.target.value)}
          rows={20}
          className="input-field w-full text-sm font-sans leading-relaxed min-h-[380px]"
          placeholder={
            aiConfigured
              ? 'Clara will draft a persuasive letter when you reach this step — or click Draft with Clara…'
              : 'Write a persuasive proposal letter for your client…'
          }
          aria-label="Proposal letter for client"
          disabled={coverLetterLoading && !coverLetter.trim()}
        />

        {/* Cheap Clara tweaks for cover letter - max impact, min tokens (edits existing text) */}
        {coverLetter.trim() && aiConfigured && (
          <div className="mt-3">
            <div className="flex items-center gap-2 mb-1.5">
              <SparklesIcon className="h-3.5 w-3.5 text-violet-600" />
              <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Clara quick tweaks (low cost)</span>
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              {['Make warmer', 'Shorter & punchier', 'More formal', 'Add urgency on deadline'].map((label, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => applyCoverLetterTweak(label)}
                  disabled={applyingCoverLetterTweak}
                  className="text-xs px-2 py-0.5 rounded border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/30 disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={coverLetterCustomInstruction}
                onChange={(e) => setCoverLetterCustomInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && coverLetterCustomInstruction.trim()) {
                    applyCoverLetterTweak(coverLetterCustomInstruction.trim());
                    setCoverLetterCustomInstruction('');
                  }
                }}
                placeholder="Or tell Clara what to change..."
                className="input-field flex-1 text-xs py-1"
                disabled={applyingCoverLetterTweak}
              />
              <button
                type="button"
                onClick={() => {
                  if (coverLetterCustomInstruction.trim()) {
                    applyCoverLetterTweak(coverLetterCustomInstruction.trim());
                    setCoverLetterCustomInstruction('');
                  }
                }}
                disabled={applyingCoverLetterTweak || !coverLetterCustomInstruction.trim()}
                className="btn-secondary text-xs px-2 py-1 disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card p-4">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Terms &amp; conditions</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Included in the proposal PDF and client view. Clara can answer questions about these terms.
        </p>
        <div
          className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 max-h-48 overflow-y-auto text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap font-sans proposal-watermark-panel"
        >
          {termsLoading ? (
            <p className="text-slate-500 italic">Preparing terms…</p>
          ) : proposalTerms.trim() ? (
            proposalTerms
          ) : (
            <p className="text-slate-500 italic">Add services to generate terms from your engagement library.</p>
          )}
        </div>
      </div>

      {validationErrors.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 dark:bg-amber-950/20 dark:border-amber-800 p-4">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Before you send</p>
          <ul className="mt-2 text-sm text-amber-800 dark:text-amber-300 list-disc pl-5 space-y-1">
            {validationErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {isEditMode && proposalId && aiConfigured && (
        <ProposalHealthCard proposalId={proposalId} />
      )}

      {!isEditMode && aiConfigured && (
        <div className="glass-tile p-4 border border-violet-200 dark:border-violet-800/50">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            <SparklesIcon className="inline h-4 w-4 text-violet-500 mr-1" />
            {AI_COPILOT.name} tip: After creating the proposal, open it to get a health score and follow-up suggestions.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap justify-between gap-3">
        <button data-testid="review-back-button" onClick={() => setCurrentStep(2)} className="btn-secondary">
          <ArrowLeftIcon className="w-5 h-5 mr-2" />
          Back
        </button>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => toggleLivePreviewPane()} className="btn-secondary text-sm lg:hidden">
            {showLivePreviewPane ? 'Hide preview' : 'Preview for client'}
          </button>
          {aiConfigured && selectedClient && (
            <button
              type="button"
              onClick={() => setShowEmailPreview(true)}
              className="btn-secondary text-sm inline-flex items-center gap-1.5 border-violet-200 dark:border-violet-700 text-violet-700 dark:text-violet-300"
            >
              <SparklesIcon className="h-4 w-4" />
              Preview client email
            </button>
          )}
          {isEditMode ? (
            <button type="button" onClick={previewPdf} className="btn-secondary text-sm">
              Download PDF
            </button>
          ) : (
            <button type="button" onClick={previewPdf} className="btn-secondary text-sm">
              Client preview
            </button>
          )}
          <button data-testid="create-proposal-button" onClick={saveProposal} disabled={isLoading} className="btn-primary">
            {isLoading ? 'Saving...' : isEditMode ? 'Save Changes' : 'Create Proposal'}
            <ArrowRightIcon className="w-5 h-5 ml-2" />
          </button>
        </div>
      </div>
    </div>
  );

  const claraServiceLines = selectedServices.map((s) => ({
    name: s.name,
    billingFrequency: s.billingCycle,
    displayPrice: s.displayPrice,
  }));

  const showPreviewPane = Boolean(selectedClient && currentStep >= 2 && showLivePreviewPane);
  /** Services step needs full builder width — preview stacks below instead of squeezing the edit column. */
  const sideBySidePreview = showPreviewPane && currentStep !== 2;

  return (
    <div className="max-w-7xl mx-auto">
      {renderStepIndicator()}

      {selectedClient &&
        buildMode === 'clara' &&
        !autoFitDismissed &&
        !autoFitLoading &&
        !autoFitResult &&
        aiConfigured && (
          <div className="mb-6 rounded-2xl border border-violet-200 dark:border-violet-800 bg-violet-50/40 dark:bg-violet-950/20 p-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-700 dark:text-slate-200">
              Ask {AI_COPILOT.name} for an optional starter bundle for {selectedClient.name}.
            </p>
            <button
              type="button"
              onClick={() => void runAutoFitForClient(selectedClient.id)}
              className="btn-primary text-sm"
            >
              Get {AI_COPILOT.name} suggestions
            </button>
          </div>
        )}

      {selectedClient && buildMode === 'clara' && !autoFitDismissed && (autoFitLoading || autoFitResult) && (
        <AutoFitBanner
          clientName={selectedClient.name}
          result={autoFitResult}
          loading={autoFitLoading}
          configured={aiConfigured}
          onAcceptAll={applyAllAutoFit}
          onAcceptSection={applyAutoFitSection}
          onDismiss={() => {
            setAutoFitDismissed(true);
            setAutoFitResult(null);
          }}
          onAcceptService={applyAutoFitService}
          onTweakService={applyTweakedAutoFitService}
          onRejectService={() => {}}
        />
      )}

      <div
        className={
          selectedClient && currentStep >= 2
            ? sideBySidePreview
              ? 'grid grid-cols-1 2xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,420px)] gap-6 items-start'
              : showPreviewPane
                ? 'flex flex-col gap-6'
                : 'grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(280px,320px)] gap-6 items-start'
            : ''
        }
      >
        <div
          className={`animate-fade-in space-y-4 ${sideBySidePreview ? 'min-w-0' : 'w-full min-w-[min(100%,42rem)]'}`}
        >
          {selectedClient && currentStep >= 2 && (
            <RegulatoryCheckBanner clientId={selectedClient.id} compact={currentStep === 2} />
          )}
          {selectedClient && currentStep >= 2 && currentStep <= 3 && (
            <ClientContextCard
              clientId={selectedClient.id}
              clientName={selectedClient.name}
              companyType={selectedClient.companyType}
              configured={aiConfigured}
            />
          )}
          {currentStep === 1 && renderClientStep()}
          {currentStep === 2 && renderServicesStep()}
          {currentStep === 3 && renderReviewStep()}
        </div>

        {showPreviewPane && (
          <div
            className={
              sideBySidePreview
                ? 'min-w-0 2xl:sticky 2xl:top-4 order-first 2xl:order-none'
                : 'w-full order-last'
            }
          >
            <ProposalClientPreview
              practiceName={tenant?.name || 'Your practice'}
              practiceLogo={tenant?.logo}
              primaryColor={tenant?.primaryColor}
              clientName={selectedClient.name}
              clientContactName={coverLetterAddressee(selectedClient)}
              preparedByName={`${user?.firstName || ''} ${user?.lastName || ''}`.trim() || undefined}
              preparedByTitle={user?.jobTitle?.trim() || undefined}
              proposalTitle={proposalTitle}
              coverLetter={coverLetter}
              services={previewServices}
              summary={summary}
              validUntil={validUntil}
              terms={proposalTerms}
              showCoverLetter={currentStep >= 3}
              showTerms={currentStep >= 3}
            />
          </div>
        )}

        {selectedClient && currentStep >= 2 && !showLivePreviewPane && (
          <div className="space-y-4 min-w-0 hidden lg:block lg:sticky lg:top-4">
            <ProposalBuilderClara
              step={currentStep}
              clientId={selectedClient.id}
              clientName={selectedClient.name}
              proposalTitle={proposalTitle}
              coverLetter={coverLetter}
              validUntil={validUntil}
              services={claraServiceLines}
              configured={aiConfigured}
              onApplyTitle={setProposalTitle}
              onSuggestServices={runAiSuggestServices}
              suggestLoading={aiSuggestLoading}
              suggestions={aiSuggestions}
              onApplySingleSuggestion={applySingleAiSuggestion}
              onTweakSingleSuggestion={applyTweakedAiSuggestion}
              onDraftCoverLetter={runAiCoverLetter}
              coverLoading={aiCoverLoading}
              terms={proposalTerms}
            />
          </div>
        )}
      </div>

      <ProposalEmailPreviewDialog
        open={showEmailPreview}
        onClose={() => setShowEmailPreview(false)}
        draft={emailDraftPayload}
        previewOnly
      />

      <SaveProposalTemplateDialog
        open={saveTemplateDialog.open}
        proposalId={saveTemplateDialog.proposalId}
        proposalTitle={proposalTitle}
        onClose={() => {
          const id = saveTemplateDialog.proposalId;
          setSaveTemplateDialog({ open: false, proposalId: '' });
          if (id) navigate(`/proposals/${id}`);
        }}
        onSaved={() => void loadProposalTemplates()}
      />
    </div>
  );
}
// TEST COMMENT FOR BUILD
// FORCE REBUILD Sat Apr 11 10:26:46 BST 2026
export const BUILD_TIMESTAMP = 'Sat Apr 11 10:32:40 BST 2026';
