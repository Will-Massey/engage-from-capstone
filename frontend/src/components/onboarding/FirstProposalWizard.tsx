import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BuildingOffice2Icon,
  CheckIcon,
  DocumentTextIcon,
  PaperAirplaneIcon,
  SparklesIcon,
  UserPlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { format, addDays } from 'date-fns';
import { toast } from 'react-hot-toast';
import { apiClient } from '../../utils/api';
import { useAuthStore } from '../../stores/authStore';
import { AI_COPILOT } from '../../config/aiCopilot';
import {
  generateCoverLetterForTone,
  COVER_LETTER_STYLES,
  type CoverLetterTone,
} from '../../data/defaultCoverLetter';
import ClaraServiceSuggestionCards, {
  type ClaraServiceSuggestion,
} from '../ai/ClaraServiceSuggestionCards';
import AutoFitBanner, { type AutoFitResult } from '../ai/AutoFitBanner';
import ProposalEmailPreviewDialog, {
  type ProposalEmailDraftInput,
} from '../ai/ProposalEmailPreviewDialog';
import { showAiError } from '../ai/AiPanel';
import { dismissFirstProposalWizard } from './firstProposalWizardStorage';

const WIZARD_STEPS = [
  { id: 1, name: 'Pick client' },
  { id: 2, name: 'Build path' },
  { id: 3, name: 'Services' },
  { id: 4, name: 'Title & cover' },
  { id: 5, name: 'Preview & send' },
] as const;

type BuildMode = 'unset' | 'manual' | 'clara' | 'template';

interface WizardClient {
  id: string;
  name: string;
  companyType: string;
  contactEmail: string;
  contactName?: string | null;
  companyNumber?: string | null;
}

interface CatalogService {
  id: string;
  name: string;
  description?: string;
  priceAmount: number;
  billingCycle: string;
  defaultFrequency?: string;
  category: string;
  frequencyOptions?: string;
  isVatApplicable?: boolean;
  vatRate?: string | number;
}

interface SelectedLine {
  templateId: string;
  name: string;
  description?: string;
  displayPrice: number;
  billingCycle: string;
  quantity: number;
  discountPercent: number;
  vatRate: number;
}

interface ProposalTemplateSummary {
  id: string;
  name: string;
  description?: string | null;
  title: string;
  serviceCount: number;
}

interface FirstProposalWizardProps {
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
}

function coverLetterAddressee(client: WizardClient): string {
  const contact = client.contactName?.trim();
  if (contact) {
    const first = contact.split(/\s+/)[0];
    if (first) return first;
  }
  return client.name;
}

function lineVatRate(service: CatalogService): number {
  if (service.isVatApplicable === false) return 0;
  if (service.vatRate === 'REDUCED_5') return 5;
  if (service.vatRate === 'ZERO' || service.vatRate === 'EXEMPT') return 0;
  return 20;
}

function mapCatalogue(raw: any[]): CatalogService[] {
  return raw.map((s) => {
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
    };
  });
}

export default function FirstProposalWizard({ open, onClose, onSent }: FirstProposalWizardProps) {
  const { tenant, user } = useAuthStore();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [clients, setClients] = useState<WizardClient[]>([]);
  const [selectedClient, setSelectedClient] = useState<WizardClient | null>(null);
  const [chPulling, setChPulling] = useState(false);
  const [chConfigured, setChConfigured] = useState(false);

  const [buildMode, setBuildMode] = useState<BuildMode>('unset');
  const [templates, setTemplates] = useState<ProposalTemplateSummary[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);

  const [catalogue, setCatalogue] = useState<CatalogService[]>([]);
  const [selectedLines, setSelectedLines] = useState<SelectedLine[]>([]);
  const [serviceSearch, setServiceSearch] = useState('');

  const [aiConfigured, setAiConfigured] = useState(false);
  const [autoFitLoading, setAutoFitLoading] = useState(false);
  const [autoFitResult, setAutoFitResult] = useState<AutoFitResult | null>(null);
  const [autoFitDismissed, setAutoFitDismissed] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<{
    summary?: string;
    suggestions?: ClaraServiceSuggestion[];
    validUntilDays?: number;
  } | null>(null);
  const [rejectedSuggestionIds, setRejectedSuggestionIds] = useState<Set<string>>(new Set());
  const [suggestLoading, setSuggestLoading] = useState(false);

  const [proposalTitle, setProposalTitle] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [coverLetterTone, setCoverLetterTone] = useState<CoverLetterTone>('PROFESSIONAL');
  const [validUntil, setValidUntil] = useState('');

  const [proposalId, setProposalId] = useState<string | null>(null);
  const [showEmailPreview, setShowEmailPreview] = useState(false);

  const resetWizard = useCallback(() => {
    setStep(1);
    setSelectedClient(null);
    setBuildMode('unset');
    setSelectedTemplateId(null);
    setSelectedLines([]);
    setProposalTitle('');
    setCoverLetter('');
    setCoverLetterTone('PROFESSIONAL');
    setValidUntil('');
    setProposalId(null);
    setAutoFitResult(null);
    setAutoFitDismissed(false);
    setAiSuggestions(null);
    setRejectedSuggestionIds(new Set());
    setServiceSearch('');
  }, []);

  useEffect(() => {
    if (!open) return;
    resetWizard();
    void loadInitialData();
  }, [open, resetWizard]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [clientsRes, servicesRes, templatesRes, aiRes, chRes] = await Promise.all([
        apiClient.getClients({ limit: 100 }) as Promise<any>,
        apiClient.getServices({ limit: 100 }) as Promise<any>,
        apiClient.getProposalTemplates() as Promise<any>,
        apiClient.getAiStatus() as Promise<any>,
        apiClient.getCompaniesHouseStatus() as Promise<any>,
      ]);

      setClients(clientsRes.data || []);
      setCatalogue(mapCatalogue(servicesRes.data || []));
      if (templatesRes.success) setTemplates(templatesRes.data || []);
      setAiConfigured(Boolean(aiRes?.data?.configured ?? aiRes?.configured));
      setChConfigured(Boolean(chRes?.data?.configured ?? chRes?.configured));

      try {
        const settingsRes = (await apiClient.getTenantSettings()) as any;
        const days = settingsRes?.data?.defaultProposalExpiryDays ?? 30;
        setValidUntil(format(addDays(new Date(), days), 'yyyy-MM-dd'));
      } catch {
        setValidUntil(format(addDays(new Date(), 30), 'yyyy-MM-dd'));
      }
    } catch {
      toast.error('Could not load wizard data');
    } finally {
      setLoading(false);
    }
  };

  const enrichFromCompaniesHouse = async () => {
    if (!selectedClient) return;
    setChPulling(true);
    try {
      const res = (await apiClient.enrichClientFromCompaniesHouse(selectedClient.id, {
        searchByName: true,
        fillMissingOnly: true,
      })) as any;
      if (!res.success) {
        toast.error(res.error?.message || 'Companies House lookup failed');
        return;
      }
      if (res.data?.client) {
        setSelectedClient((prev) => (prev ? { ...prev, ...res.data.client } : prev));
        setClients((prev) =>
          prev.map((c) => (c.id === selectedClient.id ? { ...c, ...res.data.client } : c))
        );
      }
      toast.success('Companies House data enriched — Clara can tailor suggestions more accurately');
    } catch (e: any) {
      toast.error(e?.message || 'Companies House lookup failed');
    } finally {
      setChPulling(false);
    }
  };

  const addLine = (
    service: CatalogService,
    billingFrequency?: string,
    overridePrice?: number
  ): boolean => {
    if (selectedLines.some((l) => l.templateId === service.id)) return false;
    const price = overridePrice ?? service.priceAmount ?? 0;
    const billingCycle = billingFrequency || service.billingCycle || 'MONTHLY';
    setSelectedLines((prev) => [
      ...prev,
      {
        templateId: service.id,
        name: service.name,
        description: service.description,
        displayPrice: price,
        billingCycle,
        quantity: 1,
        discountPercent: 0,
        vatRate: lineVatRate(service),
      },
    ]);
    return true;
  };

  const removeLine = (templateId: string) => {
    setSelectedLines((prev) => prev.filter((l) => l.templateId !== templateId));
  };

  const runAutoFit = async (clientId: string) => {
    if (!aiConfigured) return;
    setAutoFitLoading(true);
    setAutoFitResult(null);
    setAutoFitDismissed(false);
    try {
      const res = (await apiClient.aiAutoFit(clientId)) as any;
      if (res.success) {
        setAutoFitResult(res.data);
        if (res.data?.suggestedTitle && !proposalTitle) {
          setProposalTitle(res.data.suggestedTitle);
        }
        if (res.data?.validUntilDays && !validUntil) {
          setValidUntil(format(addDays(new Date(), res.data.validUntilDays), 'yyyy-MM-dd'));
        }
      }
    } catch {
      // optional — fall back to suggest-services
    } finally {
      setAutoFitLoading(false);
    }
  };

  const runSuggestServices = async () => {
    if (!selectedClient || !aiConfigured) return;
    setSuggestLoading(true);
    try {
      const res = (await apiClient.aiSuggestServices(selectedClient.id)) as any;
      if (res.success) {
        setAiSuggestions(res.data);
        if (res.data?.validUntilDays && !validUntil) {
          setValidUntil(format(addDays(new Date(), res.data.validUntilDays), 'yyyy-MM-dd'));
        }
      }
    } catch (e) {
      showAiError(e);
    } finally {
      setSuggestLoading(false);
    }
  };

  const selectBuildMode = (mode: BuildMode) => {
    setBuildMode(mode);
    if (mode === 'clara' && selectedClient) {
      void runAutoFit(selectedClient.id);
      void runSuggestServices();
    }
  };

  const applyTemplate = async (templateId: string) => {
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
        typeof t.defaultPricing === 'object' && t.defaultPricing ? t.defaultPricing : {};
      if (pricing.coverLetterTone) {
        setCoverLetterTone(pricing.coverLetterTone as CoverLetterTone);
      }

      const config = Array.isArray(t.serviceConfig) ? t.serviceConfig : [];
      const lines: SelectedLine[] = [];
      for (const item of config) {
        const cat = catalogue.find((s) => s.id === item.serviceId);
        if (!cat) continue;
        lines.push({
          templateId: cat.id,
          name: item.name || cat.name,
          description: item.description ?? cat.description,
          displayPrice: item.displayPrice ?? cat.priceAmount,
          billingCycle: item.billingFrequency || cat.billingCycle,
          quantity: item.quantity ?? 1,
          discountPercent: item.discountPercent ?? 0,
          vatRate: lineVatRate(cat),
        });
      }
      setSelectedLines(lines);
      setSelectedTemplateId(templateId);
      toast.success('Template applied — tweak anything on the next steps');
    } catch {
      toast.error('Could not apply template');
    } finally {
      setApplyingTemplateId(null);
    }
  };

  const visibleSuggestions = useMemo(() => {
    return (
      aiSuggestions?.suggestions
        ?.filter((s) => !rejectedSuggestionIds.has(s.serviceId))
        .map((s) => {
          const cat = catalogue.find((c) => c.id === s.serviceId);
          return {
            ...s,
            billingFrequency: s.billingFrequency || 'MONTHLY',
            displayPrice: s.displayPrice ?? cat?.priceAmount ?? 0,
            frequencyOptions: cat?.frequencyOptions,
          };
        }) ?? []
    );
  }, [aiSuggestions, rejectedSuggestionIds, catalogue]);

  const acceptSuggestion = (s: ClaraServiceSuggestion) => {
    const cat = catalogue.find((c) => c.id === s.serviceId);
    if (!cat) {
      toast.error('Service no longer in catalogue');
      return;
    }
    if (addLine(cat, s.billingFrequency, s.displayPrice)) {
      toast.success(`${s.name} added`);
    } else {
      toast.success('Service already selected');
    }
    setRejectedSuggestionIds((prev) => new Set([...prev, s.serviceId]));
  };

  const tweakSuggestion = (
    s: ClaraServiceSuggestion,
    tweaks: { billingFrequency: string; displayPrice: number }
  ) => {
    const cat = catalogue.find((c) => c.id === s.serviceId);
    if (!cat) return;
    if (addLine(cat, tweaks.billingFrequency, tweaks.displayPrice)) {
      toast.success(`${s.name} added with your tweaks`);
    }
    setRejectedSuggestionIds((prev) => new Set([...prev, s.serviceId]));
  };

  const rejectSuggestion = (serviceId: string) => {
    setRejectedSuggestionIds((prev) => new Set([...prev, serviceId]));
  };

  const acceptAllSuggestions = () => {
    for (const s of visibleSuggestions) {
      const cat = catalogue.find((c) => c.id === s.serviceId);
      if (cat) addLine(cat, s.billingFrequency, s.displayPrice);
    }
    setRejectedSuggestionIds((prev) => {
      const next = new Set(prev);
      visibleSuggestions.forEach((s) => next.add(s.serviceId));
      return next;
    });
    toast.success('Remaining suggestions added — review fees before sending');
  };

  const applyAutoFitSection = (section: 'title' | 'services' | 'coverLetter' | 'pricing' | 'validUntil') => {
    if (!autoFitResult) return;
    switch (section) {
      case 'title':
        if (autoFitResult.suggestedTitle) setProposalTitle(autoFitResult.suggestedTitle);
        break;
      case 'services':
        if (autoFitResult.services?.length) {
          for (const sug of autoFitResult.services) {
            const cat = catalogue.find((c) => c.id === sug.serviceId);
            if (cat) addLine(cat, sug.billingFrequency, sug.displayPrice);
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

  const filteredCatalogue = useMemo(() => {
    const q = serviceSearch.trim().toLowerCase();
    return catalogue.filter((s) => !q || s.name.toLowerCase().includes(q));
  }, [catalogue, serviceSearch]);

  const ensureCoverLetter = () => {
    if (coverLetter.trim() || !selectedClient) return;
    setCoverLetter(
      generateCoverLetterForTone({
        tone: coverLetterTone,
        addresseeName: coverLetterAddressee(selectedClient),
        companyName: selectedClient.name,
        practiceName: tenant?.name || 'Our practice',
        senderName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || undefined,
        services: selectedLines,
      })
    );
  };

  const createProposalIfNeeded = async (): Promise<string | null> => {
    if (proposalId) return proposalId;
    if (!selectedClient || !proposalTitle.trim() || selectedLines.length === 0) {
      toast.error('Add a client, title, and at least one service');
      return null;
    }

    setSaving(true);
    try {
      ensureCoverLetter();
      const payload = {
        clientId: selectedClient.id,
        title: proposalTitle.trim(),
        services: selectedLines.map((l) => ({
          serviceId: l.templateId,
          name: l.name,
          description: l.description ?? null,
          displayPrice: l.displayPrice,
          billingFrequency: l.billingCycle,
          quantity: l.quantity,
          discountPercent: l.discountPercent,
          vatRate: l.vatRate,
        })),
        ...(validUntil ? { validUntil: `${validUntil}T12:00:00.000Z` } : {}),
        coverLetter: coverLetter.trim(),
      };

      const res = (await apiClient.createProposal(payload)) as any;
      if (res.success) {
        const id = res.data.id as string;
        setProposalId(id);
        return id;
      }
      toast.error(res.error?.message || 'Could not save proposal');
      return null;
    } catch (e: any) {
      toast.error(e?.message || 'Could not save proposal');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = () => {
    dismissFirstProposalWizard(tenant?.id);
    onClose();
  };

  const handleSendComplete = async () => {
    dismissFirstProposalWizard(tenant?.id);
    setShowEmailPreview(false);
    toast.success('Your first proposal is on its way!');
    onSent?.();
    onClose();
  };

  const emailDraft: ProposalEmailDraftInput | undefined = useMemo(() => {
    if (!selectedClient) return undefined;
    return {
      clientId: selectedClient.id,
      title: proposalTitle,
      coverLetter,
      validUntil,
      practiceName: tenant?.name,
      senderName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || undefined,
      services: selectedLines.map((l) => ({
        name: l.name,
        billingFrequency: l.billingCycle,
        displayPrice: l.displayPrice,
      })),
    };
  }, [selectedClient, proposalTitle, coverLetter, validUntil, tenant?.name, user, selectedLines]);

  const canAdvance = (): boolean => {
    switch (step) {
      case 1:
        return Boolean(selectedClient);
      case 2:
        return buildMode !== 'unset' && (buildMode !== 'template' || Boolean(selectedTemplateId));
      case 3:
        return selectedLines.length > 0;
      case 4:
        return proposalTitle.trim().length > 0;
      case 5:
        return true;
      default:
        return false;
    }
  };

  const goNext = async () => {
    if (step === 3 && selectedLines.length === 0) {
      toast.error('Add at least one service');
      return;
    }
    if (step === 4) {
      ensureCoverLetter();
    }
    if (step === 5) {
      const id = await createProposalIfNeeded();
      if (id) setShowEmailPreview(true);
      return;
    }
    setStep((s) => Math.min(5, s + 1));
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-3 sm:p-6">
        <div
          className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm"
          onClick={handleDismiss}
          aria-hidden
        />
        <div
          className="relative w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col glass-tile shadow-2xl animate-fade-in rounded-2xl"
          role="dialog"
          aria-labelledby="first-proposal-wizard-title"
          aria-modal="true"
        >
          <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-5 sm:pt-6 pb-3 border-b border-slate-200/70 dark:border-slate-700/70">
            <div className="min-w-0">
              <p className="text-xs font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wider">
                First proposal wizard
              </p>
              <h2
                id="first-proposal-wizard-title"
                className="mt-1 text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white"
              >
                Create your first proposal in five minutes
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {AI_COPILOT.name} guides each step — you stay in control of every line item.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
              aria-label="Dismiss wizard"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800/80 overflow-x-auto">
            <ol className="flex items-center gap-2 min-w-max">
              {WIZARD_STEPS.map((s, index) => (
                <li key={s.id} className="flex items-center gap-2">
                  <div
                    className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium ${
                      step === s.id
                        ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200'
                        : step > s.id
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] bg-white/60 dark:bg-slate-900/40">
                      {step > s.id ? <CheckIcon className="h-3 w-3" /> : s.id}
                    </span>
                    {s.name}
                  </div>
                  {index < WIZARD_STEPS.length - 1 && (
                    <span className="w-6 h-px bg-slate-200 dark:bg-slate-700" aria-hidden />
                  )}
                </li>
              ))}
            </ol>
          </div>

          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-violet-600" />
              </div>
            ) : (
              <>
                {step === 1 && (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Choose an existing client or add one first. Enriching from Companies House helps{' '}
                      {AI_COPILOT.name} suggest the right services.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Link to="/clients/new" className="btn-secondary text-sm inline-flex items-center gap-1.5">
                        <UserPlusIcon className="h-4 w-4" />
                        Add new client
                      </Link>
                    </div>
                    {clients.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-6 text-center">
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          No clients yet — add one to continue.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {clients.map((client) => (
                          <button
                            key={client.id}
                            type="button"
                            onClick={() => setSelectedClient(client)}
                            className={`text-left p-4 rounded-xl border-2 transition-all ${
                              selectedClient?.id === client.id
                                ? 'border-violet-500 bg-violet-50/80 dark:bg-violet-950/30'
                                : 'border-slate-200 dark:border-slate-700 hover:border-violet-300'
                            }`}
                          >
                            <p className="font-semibold text-slate-900 dark:text-white">{client.name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                              {client.companyType} · {client.contactEmail}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedClient && chConfigured && (
                      <div className="rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/20 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <BuildingOffice2Icon className="h-6 w-6 text-sky-600 dark:text-sky-400 shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-slate-900 dark:text-white">
                              Enrich from Companies House
                            </p>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                              Pull registered office, SIC codes, and filing dates for better AI suggestions.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void enrichFromCompaniesHouse()}
                          disabled={chPulling}
                          className="btn-secondary text-sm shrink-0"
                        >
                          {chPulling ? 'Looking up…' : 'Enrich client'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {step === 2 && selectedClient && (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      How would you like to build the proposal for{' '}
                      <span className="font-medium text-slate-800 dark:text-slate-200">{selectedClient.name}</span>?
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => selectBuildMode('manual')}
                        className={`text-left p-4 rounded-xl border-2 transition-colors ${
                          buildMode === 'manual'
                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                            : 'border-slate-200 dark:border-slate-700 hover:border-primary-300'
                        }`}
                      >
                        <DocumentTextIcon className="h-6 w-6 text-primary-600 mb-2" />
                        <p className="font-semibold text-slate-900 dark:text-white">Build manually</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Pick services from your catalogue and set fees yourself.
                        </p>
                      </button>
                      {templates.length > 0 && (
                        <button
                          type="button"
                          onClick={() => selectBuildMode('template')}
                          className={`text-left p-4 rounded-xl border-2 transition-colors ${
                            buildMode === 'template'
                              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                              : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300'
                          }`}
                        >
                          <DocumentTextIcon className="h-6 w-6 text-emerald-600 mb-2" />
                          <p className="font-semibold text-slate-900 dark:text-white">Use a template</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Start from a saved bundle — adjust anything before sending.
                          </p>
                        </button>
                      )}
                      {aiConfigured && (
                        <button
                          type="button"
                          onClick={() => selectBuildMode('clara')}
                          className={`text-left p-4 rounded-xl border-2 transition-colors ${
                            buildMode === 'clara'
                              ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                              : 'border-slate-200 dark:border-slate-700 hover:border-violet-300'
                          }`}
                        >
                          <SparklesIcon className="h-6 w-6 text-violet-600 mb-2" />
                          <p className="font-semibold text-slate-900 dark:text-white">
                            Start with {AI_COPILOT.name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Optional starter bundle — accept, tweak, or reject each suggestion.
                          </p>
                        </button>
                      )}
                    </div>
                    {buildMode === 'template' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {templates.map((tpl) => (
                          <button
                            key={tpl.id}
                            type="button"
                            disabled={applyingTemplateId === tpl.id}
                            onClick={() => void applyTemplate(tpl.id)}
                            className={`text-left p-3 rounded-xl border-2 ${
                              selectedTemplateId === tpl.id
                                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30'
                                : 'border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            <p className="font-medium text-sm text-slate-900 dark:text-white">{tpl.name}</p>
                            <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                              {tpl.serviceCount} service{tpl.serviceCount === 1 ? '' : 's'}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-5">
                    {buildMode === 'clara' && selectedClient && !autoFitDismissed && (autoFitLoading || autoFitResult) && (
                      <AutoFitBanner
                        clientName={selectedClient.name}
                        result={autoFitResult}
                        loading={autoFitLoading}
                        configured={aiConfigured}
                        onAcceptAll={() => {
                          applyAutoFitSection('title');
                          applyAutoFitSection('services');
                          applyAutoFitSection('coverLetter');
                          applyAutoFitSection('validUntil');
                          setAutoFitDismissed(true);
                          setAutoFitResult(null);
                        }}
                        onAcceptSection={applyAutoFitSection}
                        onDismiss={() => {
                          setAutoFitDismissed(true);
                          setAutoFitResult(null);
                        }}
                        onAcceptService={(s) => acceptSuggestion(s)}
                        onTweakService={(s, tweaks) => tweakSuggestion(s, tweaks)}
                        onRejectService={rejectSuggestion}
                      />
                    )}

                    {(visibleSuggestions.length > 0 || suggestLoading) && (
                      <div className="rounded-2xl border border-violet-200 dark:border-violet-800 bg-violet-50/40 dark:bg-violet-950/20 p-4">
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                            {AI_COPILOT.name} service suggestions
                          </h3>
                          {aiConfigured && (
                            <button
                              type="button"
                              onClick={() => void runSuggestServices()}
                              disabled={suggestLoading}
                              className="text-xs text-violet-700 dark:text-violet-300 hover:underline"
                            >
                              {suggestLoading ? 'Thinking…' : 'Refresh'}
                            </button>
                          )}
                        </div>
                        {aiSuggestions?.summary && (
                          <p className="text-sm text-slate-700 dark:text-slate-200 mb-3">{aiSuggestions.summary}</p>
                        )}
                        <ClaraServiceSuggestionCards
                          suggestions={visibleSuggestions}
                          onAccept={acceptSuggestion}
                          onTweak={tweakSuggestion}
                          onReject={rejectSuggestion}
                          onAcceptAll={acceptAllSuggestions}
                        />
                      </div>
                    )}

                    <div>
                      <input
                        type="search"
                        value={serviceSearch}
                        onChange={(e) => setServiceSearch(e.target.value)}
                        placeholder="Search your service catalogue…"
                        className="input-field w-full mb-3"
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                        {filteredCatalogue.map((service) => {
                          const selected = selectedLines.some((l) => l.templateId === service.id);
                          return (
                            <button
                              key={service.id}
                              type="button"
                              onClick={() => (selected ? removeLine(service.id) : addLine(service))}
                              className={`text-left p-3 rounded-lg border text-sm transition-colors ${
                                selected
                                  ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                                  : 'border-slate-200 dark:border-slate-700 hover:border-violet-300'
                              }`}
                            >
                              <span className="font-medium text-slate-900 dark:text-white">{service.name}</span>
                              <span className="block text-xs text-slate-500 mt-0.5">
                                £{service.priceAmount.toLocaleString('en-GB')} · {service.billingCycle.replace(/_/g, ' ').toLowerCase()}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {selectedLines.length > 0 && (
                      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                          Selected ({selectedLines.length})
                        </p>
                        <ul className="text-sm space-y-1">
                          {selectedLines.map((l) => (
                            <li key={l.templateId} className="flex justify-between gap-2 text-slate-700 dark:text-slate-200">
                              <span>{l.name}</span>
                              <span className="text-slate-500 shrink-0">
                                £{l.displayPrice.toLocaleString('en-GB')}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {step === 4 && selectedClient && (
                  <div className="space-y-4">
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Proposal title</span>
                      <input
                        type="text"
                        value={proposalTitle}
                        onChange={(e) => setProposalTitle(e.target.value)}
                        placeholder="e.g. Annual accounts and corporation tax — 2026/27"
                        className="input-field w-full mt-1"
                      />
                    </label>
                    <div>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Cover letter tone</span>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {COVER_LETTER_STYLES.map((style) => (
                          <button
                            key={style.tone}
                            type="button"
                            onClick={() => {
                              setCoverLetterTone(style.tone);
                              setCoverLetter(
                                generateCoverLetterForTone({
                                  tone: style.tone,
                                  addresseeName: coverLetterAddressee(selectedClient),
                                  companyName: selectedClient.name,
                                  practiceName: tenant?.name || 'Our practice',
                                  senderName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || undefined,
                                  services: selectedLines,
                                })
                              );
                            }}
                            className={`text-xs px-3 py-1.5 rounded-full border ${
                              coverLetterTone === style.tone
                                ? 'border-violet-500 bg-violet-50 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200'
                                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {style.name}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Cover letter</span>
                      <textarea
                        value={coverLetter}
                        onChange={(e) => setCoverLetter(e.target.value)}
                        rows={10}
                        className="input-field w-full mt-1 font-mono text-sm"
                        placeholder="Personalised introduction for your client…"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Valid until</span>
                      <input
                        type="date"
                        value={validUntil}
                        onChange={(e) => setValidUntil(e.target.value)}
                        className="input-field w-full sm:w-48 mt-1"
                      />
                    </label>
                  </div>
                )}

                {step === 5 && (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 p-5">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{proposalTitle}</h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        For {selectedClient?.name} · {selectedLines.length} service
                        {selectedLines.length === 1 ? '' : 's'}
                      </p>
                      <ul className="mt-4 text-sm space-y-2 text-slate-700 dark:text-slate-200">
                        {selectedLines.map((l) => (
                          <li key={l.templateId} className="flex justify-between gap-3">
                            <span>{l.name}</span>
                            <span className="text-slate-500">
                              £{l.displayPrice.toLocaleString('en-GB')} / {l.billingCycle.replace(/_/g, ' ').toLowerCase()}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {validUntil && (
                        <p className="text-xs text-slate-500 mt-4">Valid until {validUntil}</p>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      We&apos;ll save the proposal as a draft, then open the email preview so you can review and send.
                    </p>
                    <button
                      type="button"
                      onClick={() => void goNext()}
                      disabled={saving}
                      className="btn-primary inline-flex items-center gap-2"
                    >
                      <PaperAirplaneIcon className="h-5 w-5" />
                      {saving ? 'Saving…' : 'Preview email & send'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-6 py-4 border-t border-slate-200/70 dark:border-slate-700/70 bg-white/40 dark:bg-slate-900/40">
            <button type="button" onClick={handleDismiss} className="text-sm text-slate-500 hover:text-slate-700">
              Dismiss wizard
            </button>
            <div className="flex gap-2">
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  className="btn-secondary text-sm inline-flex items-center gap-1"
                >
                  <ArrowLeftIcon className="h-4 w-4" />
                  Back
                </button>
              )}
              {step < 5 && (
                <button
                  type="button"
                  onClick={() => void goNext()}
                  disabled={!canAdvance() || loading}
                  className="btn-primary text-sm inline-flex items-center gap-1 disabled:opacity-50"
                >
                  Continue
                  <ArrowRightIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <ProposalEmailPreviewDialog
        open={showEmailPreview}
        onClose={() => setShowEmailPreview(false)}
        proposalId={proposalId || undefined}
        draft={proposalId ? undefined : emailDraft}
        onSend={async (approved) => {
          const id = proposalId || (await createProposalIfNeeded());
          if (!id) return;
          await apiClient.sendProposal(id, approved);
          await handleSendComplete();
        }}
      />
    </>
  );
}