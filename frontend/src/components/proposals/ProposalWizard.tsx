import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
  PaperAirplaneIcon,
  ExclamationTriangleIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline';
import { format, addDays } from 'date-fns';
import toast from 'react-hot-toast';
import { apiClient } from '../../utils/api';
import { useAuthStore } from '../../stores/authStore';
import { formatCurrency } from '../../utils/formatters';
import { AI_COPILOT } from '../../config/aiCopilot';
import { showAiError } from '../ai/AiPanel';
import type { AutoFitResult } from '../ai/AutoFitBanner';
import WizardClientPreview from './WizardClientPreview';
import CreateClient from '../../pages/clients/CreateClient';

const WIZARD_STEPS = [
  { id: 1, name: 'Client', description: 'Select or create a client' },
  { id: 2, name: 'Services', description: `${AI_COPILOT.name} auto-fit review` },
  { id: 3, name: 'Pricing', description: 'Review fees and compliance' },
  { id: 4, name: 'Email', description: `${AI_COPILOT.name} send preview` },
  { id: 5, name: 'Send', description: 'Create and deliver' },
] as const;

type FitSection = 'title' | 'services' | 'coverLetter' | 'pricing' | 'validUntil';
type SectionDecision = 'pending' | 'accepted' | 'rejected';

interface ClientRow {
  id: string;
  name: string;
  companyType: string;
  contactEmail: string;
  contactName?: string | null;
  companyNumber?: string | null;
  mtditsaStatus?: string;
  turnover?: number | null;
}

interface WizardService {
  serviceId: string;
  name: string;
  displayPrice: number;
  billingFrequency: string;
  rationale?: string;
}

interface RegulatoryAlert {
  code: string;
  title: string;
  message: string;
  severity: string;
  suggestion?: string;
}

interface PricingFlag {
  serviceName: string;
  quotedPrice: number;
  floorPrice: number;
  message: string;
}

const SECTION_LABELS: Record<FitSection, string> = {
  title: 'Proposal title',
  services: 'Service bundle',
  coverLetter: 'Cover letter',
  pricing: 'Pricing notes',
  validUntil: 'Valid until',
};

export default function ProposalWizard() {
  const navigate = useNavigate();
  const { tenant, user } = useAuthStore();

  const [step, setStep] = useState(1);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(null);
  const [showCreateClient, setShowCreateClient] = useState(false);


  const [autoFitLoading, setAutoFitLoading] = useState(false);
  const [autoFitResult, setAutoFitResult] = useState<AutoFitResult | null>(null);
  const [sectionDecisions, setSectionDecisions] = useState<Record<FitSection, SectionDecision>>({
    title: 'pending',
    services: 'pending',
    coverLetter: 'pending',
    pricing: 'pending',
    validUntil: 'pending',
  });

  const [proposalTitle, setProposalTitle] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [validUntil, setValidUntil] = useState(format(addDays(new Date(), 30), 'yyyy-MM-dd'));
  const [pricingNotes, setPricingNotes] = useState('');
  const [wizardServices, setWizardServices] = useState<WizardService[]>([]);

  const [regulatoryAlerts, setRegulatoryAlerts] = useState<RegulatoryAlert[]>([]);
  const [pricingFlags, setPricingFlags] = useState<PricingFlag[]>([]);
  const [pricingSummary, setPricingSummary] = useState('');

  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailStreaming, setEmailStreaming] = useState(false);
  const [emailApproved, setEmailApproved] = useState(false);

  const [proposalId, setProposalId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const [aiConfigured, setAiConfigured] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [clientsRes, aiRes] = await Promise.all([
          apiClient.getClients({ limit: 100 }) as Promise<any>,
          apiClient.getAiStatus() as Promise<any>,
        ]);
        setClients(clientsRes.data || []);
        setAiConfigured(!!aiRes?.data?.configured);
      } catch {
        toast.error('Failed to load wizard data');
      }
    })();
  }, []);

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.contactEmail?.toLowerCase().includes(q) ||
        c.companyNumber?.toLowerCase().includes(q)
    );
  }, [clients, clientSearch]);

  const applyAcceptedSections = useCallback(
    (result: AutoFitResult, decisions: Record<FitSection, SectionDecision>) => {
      if (decisions.title === 'accepted' && result.suggestedTitle) {
        setProposalTitle(result.suggestedTitle);
      }
      if (decisions.services === 'accepted' && result.services?.length) {
        setWizardServices(
          result.services.map((s) => ({
            serviceId: s.serviceId,
            name: s.name,
            displayPrice: s.displayPrice,
            billingFrequency: s.billingFrequency,
            rationale: s.rationale,
          }))
        );
      }
      if (decisions.coverLetter === 'accepted') {
        if (result.coverLetterDraft) setCoverLetter(result.coverLetterDraft);
      }
      if (decisions.pricing === 'accepted' && result.pricingNotes) {
        setPricingNotes(result.pricingNotes);
      }
      if (decisions.validUntil === 'accepted' && result.validUntilDays) {
        setValidUntil(format(addDays(new Date(), result.validUntilDays), 'yyyy-MM-dd'));
      }
    },
    []
  );

  const runAutoFit = async (client: ClientRow) => {
    setAutoFitLoading(true);
    setAutoFitResult(null);
    setSectionDecisions({
      title: 'pending',
      services: 'pending',
      coverLetter: 'pending',
      pricing: 'pending',
      validUntil: 'pending',
    });
    try {
      const res = (await apiClient.aiAutoFit(client.id)) as any;
      if (res.success) {
        setAutoFitResult(res.data);
      }
    } catch (e) {
      showAiError(e);
    } finally {
      setAutoFitLoading(false);
    }
  };

  const selectClient = (client: ClientRow) => {
    setSelectedClient(client);
    setShowCreateClient(false);
    runAutoFit(client);
  };

  const handleClientCreated = (client: any) => {
    setClients((prev) => [client, ...prev]);
    selectClient(client);
    toast.success('Client created — loading Clara suggestions');
  };

  const setSectionDecision = (section: FitSection, decision: 'accepted' | 'rejected') => {
    setSectionDecisions((prev) => ({ ...prev, [section]: decision }));
  };

  const acceptAllSections = () => {
    setSectionDecisions({
      title: 'accepted',
      services: 'accepted',
      coverLetter: 'accepted',
      pricing: 'accepted',
      validUntil: 'accepted',
    });
  };

  const proceedFromServices = () => {
    if (!autoFitResult) {
      toast.error('Wait for Clara to finish, or go back and select a client');
      return;
    }
    const pending = (Object.entries(sectionDecisions) as [FitSection, SectionDecision][]).filter(
      ([, d]) => d === 'pending'
    );
    if (pending.length > 0) {
      toast.error('Accept or reject each section before continuing');
      return;
    }
    applyAcceptedSections(autoFitResult, sectionDecisions);
    setStep(3);
  };

  const loadComplianceChecks = async () => {
    if (!selectedClient || wizardServices.length === 0) return;

    try {
      const pricingRes = (await apiClient.aiPricingAdvisor({
        clientId: selectedClient.id,
        lineItems: wizardServices.map((s) => ({
          serviceId: s.serviceId,
          name: s.name,
          displayPrice: s.displayPrice,
        })),
      })) as any;

      if (pricingRes.success) {
        setPricingFlags(pricingRes.data.flags || []);
        setPricingSummary(pricingRes.data.summary || '');
      }
    } catch {
      // optional
    }

    // Draft-shaped regulatory check via inline evaluation after proposal save;
    // for unsaved wizard, call pricing-advisor only; regulatory alerts shown after create
    setRegulatoryAlerts([]);
    if (selectedClient.mtditsaStatus?.match(/REQUIRED_2026|REQUIRED_2027|MANDATORY/)) {
      const hasMtd = wizardServices.some((s) => /mtd|making tax digital/i.test(s.name));
      if (!hasMtd && !/making tax digital|mtd/i.test(coverLetter)) {
        setRegulatoryAlerts([
          {
            code: 'MTD_CLAUSE_MISSING',
            title: 'MTD clause required',
            message: `${selectedClient.name} requires MTD ITSA compliance. Add an MTD service or clause.`,
            severity: 'warning',
            suggestion: 'Accept the MTD ITSA service from your catalog or ask Clara to add MTD wording.',
          },
        ]);
      }
    }
  };

  useEffect(() => {
    if (step === 3 && selectedClient && wizardServices.length > 0) {
      loadComplianceChecks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, wizardServices.length, selectedClient?.id]);

  const streamEmailDraft = async () => {
    if (!selectedClient) return;
    setEmailStreaming(true);
    setEmailSubject('');
    setEmailBody('');
    setEmailApproved(false);

    const payload = {
      clientId: selectedClient.id,
      title: proposalTitle,
      coverLetter,
      validUntil,
      practiceName: tenant?.name,
      senderName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || undefined,
      services: wizardServices.map((s) => ({
        name: s.name,
        billingFrequency: s.billingFrequency,
        displayPrice: s.displayPrice,
      })),
    };

    try {
      await apiClient.aiStreamProposalEmailDraft(payload, (event) => {
        if (event.subject) setEmailSubject(event.subject);
        if (event.bodyChunk) setEmailBody((prev) => prev + event.bodyChunk);
        if (event.error) throw new Error(event.error);
      });
    } catch (e) {
      showAiError(e);
      try {
        const res = (await apiClient.aiProposalEmailDraft(payload)) as any;
        if (res.success) {
          setEmailSubject(res.data.subject || '');
          setEmailBody(res.data.textBody || res.data.htmlBody || '');
        }
      } catch (fallbackErr) {
        showAiError(fallbackErr);
      }
    } finally {
      setEmailStreaming(false);
    }
  };

  useEffect(() => {
    if (step === 4 && selectedClient && !emailBody && !emailStreaming) {
      streamEmailDraft();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const createProposal = async (): Promise<string | null> => {
    if (!selectedClient || wizardServices.length === 0 || !proposalTitle.trim()) {
      toast.error('Complete client, services, and title first');
      return null;
    }

    setSaving(true);
    try {
      const res = (await apiClient.createProposal({
        clientId: selectedClient.id,
        title: proposalTitle,
        services: wizardServices.map((s) => ({
          serviceId: s.serviceId,
          displayPrice: s.displayPrice,
          billingFrequency: s.billingFrequency,
          quantity: 1,
        })),
        validUntil: `${validUntil}T12:00:00.000Z`,
        coverLetter: coverLetter.trim() || undefined,
      })) as any;

      if (res.success) {
        const id = res.data.id as string;
        setProposalId(id);

        try {
          const fitRes = (await apiClient.getProposalRegulatoryFit(id)) as any;
          if (fitRes.success && fitRes.data?.alerts?.length) {
            setRegulatoryAlerts(fitRes.data.alerts);
          }
        } catch {
          // non-blocking
        }

        return id;
      }
      toast.error(res.error?.message || 'Failed to create proposal');
      return null;
    } catch (e: any) {
      toast.error(e.message || 'Failed to create proposal');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async () => {
    if (!emailApproved) {
      toast.error('Approve the email before sending');
      return;
    }

    setSending(true);
    try {
      let id = proposalId;
      if (!id) {
        id = await createProposal();
        if (!id) return;
      }

      await apiClient.sendProposal(id, {
        subject: emailSubject,
        textBody: emailBody,
        htmlBody: emailBody.replace(/\n/g, '<br>'),
      });

      toast.success('Proposal sent successfully');
      navigate(`/proposals/${id}`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to send proposal');
    } finally {
      setSending(false);
    }
  };

  const updateServicePrice = (serviceId: string, price: number) => {
    setWizardServices((prev) =>
      prev.map((s) => (s.serviceId === serviceId ? { ...s, displayPrice: price } : s))
    );
  };

  const renderSectionCard = (section: FitSection) => {
    if (!autoFitResult) return null;
    const decision = sectionDecisions[section];

    let preview: React.ReactNode = null;
    switch (section) {
      case 'title':
        preview = (
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
            {autoFitResult.suggestedTitle}
          </p>
        );
        break;
      case 'services':
        preview = (
          <ul className="text-xs space-y-1.5 text-slate-600 dark:text-slate-300">
            {autoFitResult.services.map((s) => (
              <li key={s.serviceId}>
                <strong>{s.name}</strong> — {formatCurrency(s.displayPrice)} (
                {s.billingFrequency.replace(/_/g, ' ').toLowerCase()})
                <span className="block text-slate-500">{s.rationale}</span>
              </li>
            ))}
          </ul>
        );
        break;
      case 'coverLetter':
        preview = (
          <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap max-h-28 overflow-y-auto">
            {autoFitResult.coverLetterDraft}
          </p>
        );
        break;
      case 'pricing':
        preview = (
          <p className="text-sm text-slate-700 dark:text-slate-200">{autoFitResult.pricingNotes}</p>
        );
        break;
      case 'validUntil':
        preview = (
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Valid for {autoFitResult.validUntilDays} days
          </p>
        );
        break;
    }

    return (
      <div
        key={section}
        className={`rounded-xl border p-4 transition-colors ${
          decision === 'accepted'
            ? 'border-green-300 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20'
            : decision === 'rejected'
              ? 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 opacity-70'
              : 'border-violet-200 dark:border-violet-800 bg-white/70 dark:bg-slate-900/50'
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">
            {SECTION_LABELS[section]}
          </span>
          {decision !== 'pending' && (
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full ${
                decision === 'accepted'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
                  : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
              }`}
            >
              {decision === 'accepted' ? 'Accepted' : 'Rejected'}
            </span>
          )}
        </div>
        {preview}
        {decision === 'pending' && (
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => setSectionDecision(section, 'accepted')}
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700"
            >
              <CheckIcon className="h-3.5 w-3.5" />
              Accept
            </button>
            <button
              type="button"
              onClick={() => setSectionDecision(section, 'rejected')}
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <XMarkIcon className="h-3.5 w-3.5" />
              Reject
            </button>
          </div>
        )}
      </div>
    );
  };

  const splitPane = (editor: React.ReactNode, previewMode: 'proposal' | 'email' = 'proposal') => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[420px]">
      <div className="space-y-4">{editor}</div>
      <div className="lg:sticky lg:top-4 h-fit min-h-[320px]">
        <WizardClientPreview
          practiceName={tenant?.name || 'Your practice'}
          primaryColor={tenant?.primaryColor}
          clientName={selectedClient?.name || 'Client'}
          proposalTitle={proposalTitle || 'Draft proposal'}
          coverLetter={coverLetter}
          validUntil={validUntil}
          services={wizardServices}
          emailSubject={emailSubject}
          emailBody={emailBody}
          mode={previewMode}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-1 sm:gap-2 flex-wrap">
        {WIZARD_STEPS.map((s, idx) => (
          <div key={s.id} className="flex items-center">
            <button
              type="button"
              onClick={() => s.id < step && setStep(s.id)}
              disabled={s.id > step}
              className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                step === s.id
                  ? 'bg-violet-600 text-white'
                  : s.id < step
                    ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-200 cursor-pointer hover:bg-violet-200'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
                {s.id < step ? <CheckIcon className="h-3 w-3" /> : s.id}
              </span>
              <span className="hidden sm:inline">{s.name}</span>
            </button>
            {idx < WIZARD_STEPS.length - 1 && (
              <div
                className={`w-4 sm:w-8 h-0.5 mx-0.5 ${s.id < step ? 'bg-violet-400' : 'bg-slate-200 dark:bg-slate-700'}`}
              />
            )}
          </div>
        ))}
      </div>

      <div className="glass-tile p-5 sm:p-6">
        {/* Step 1: Client */}
        {step === 1 && (
          <div className="space-y-5 animate-fade-in">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Who is this proposal for?
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Select an existing client or create one with Companies House lookup
              </p>
            </div>

            {!showCreateClient ? (
              <>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="search"
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      placeholder="Search clients by name, email, or company number…"
                      className="input-field w-full pl-9"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCreateClient(true)}
                    className="btn-secondary inline-flex items-center gap-2 shrink-0"
                  >
                    <UserPlusIcon className="h-4 w-4" />
                    New client
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto">
                  {filteredClients.length === 0 ? (
                    <p className="text-sm text-slate-500 col-span-2 py-8 text-center">
                      No clients found — create one to continue
                    </p>
                  ) : (
                    filteredClients.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => selectClient(c)}
                        className={`text-left rounded-xl border p-4 transition-all hover:border-violet-400 hover:shadow-sm ${
                          selectedClient?.id === c.id
                            ? 'border-violet-500 bg-violet-50/50 dark:bg-violet-950/20'
                            : 'border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <p className="font-medium text-slate-900 dark:text-white">{c.name}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {c.companyType?.replace(/_/g, ' ')} • {c.contactEmail}
                        </p>
                        {c.mtditsaStatus && c.mtditsaStatus !== 'NOT_REQUIRED' && (
                          <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                            {c.mtditsaStatus.replace(/_/g, ' ')}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </>
            ) : (
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                <CreateClient
                  onSuccess={handleClientCreated}
                  onCancel={() => setShowCreateClient(false)}
                />
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                disabled={!selectedClient}
                onClick={() => setStep(2)}
                className="btn-primary inline-flex items-center gap-2"
              >
                Continue
                <ArrowRightIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Clara auto-fit */}
        {step === 2 && selectedClient && (
          <div className="space-y-5 animate-fade-in">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-violet-500/15">
                <SparklesIcon
                  className={`h-5 w-5 text-violet-600 dark:text-violet-400 ${autoFitLoading ? 'animate-pulse' : ''}`}
                />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {AI_COPILOT.name}&apos;s suggested proposal for {selectedClient.name}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Accept or reject each section — nothing is applied without your consent
                </p>
              </div>
            </div>

            {autoFitLoading && (
              <div className="text-center py-12 text-slate-500">
                <SparklesIcon className="h-8 w-8 mx-auto mb-3 animate-pulse text-violet-500" />
                {AI_COPILOT.name} is analysing {selectedClient.name}…
              </div>
            )}

            {!autoFitLoading && autoFitResult && (
              <>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={acceptAllSections} className="btn-primary text-sm">
                    Accept all sections
                  </button>
                  <button
                    type="button"
                    onClick={() => runAutoFit(selectedClient)}
                    className="btn-secondary text-sm"
                    disabled={!aiConfigured}
                  >
                    Refresh suggestions
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(Object.keys(SECTION_LABELS) as FitSection[]).map(renderSectionCard)}
                </div>
              </>
            )}

            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="btn-secondary inline-flex items-center gap-2"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                Back
              </button>
              <button
                type="button"
                onClick={proceedFromServices}
                disabled={autoFitLoading || !autoFitResult}
                className="btn-primary inline-flex items-center gap-2"
              >
                Review pricing
                <ArrowRightIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Pricing */}
        {step === 3 && selectedClient && (
          <div className="space-y-4 animate-fade-in">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Review pricing
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Adjust fees and check regulatory fit before drafting the send email
              </p>
            </div>

            {splitPane(
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                    Proposal title
                  </label>
                  <input
                    type="text"
                    value={proposalTitle}
                    onChange={(e) => setProposalTitle(e.target.value)}
                    className="input-field w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                    Valid until
                  </label>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="input-field w-full"
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Services</p>
                  {wizardServices.map((s) => (
                    <div
                      key={s.serviceId}
                      className="flex flex-wrap items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700"
                    >
                      <div className="flex-1 min-w-[140px]">
                        <p className="font-medium text-sm text-slate-900 dark:text-white">{s.name}</p>
                        <p className="text-xs text-slate-500">
                          {s.billingFrequency.replace(/_/g, ' ').toLowerCase()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-slate-500">£</span>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={s.displayPrice}
                          onChange={(e) =>
                            updateServicePrice(s.serviceId, parseFloat(e.target.value) || 0)
                          }
                          className="input-field w-28 tabular-nums"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                    Cover letter
                  </label>
                  <textarea
                    value={coverLetter}
                    onChange={(e) => setCoverLetter(e.target.value)}
                    rows={6}
                    className="input-field w-full font-mono text-sm"
                  />
                </div>

                {pricingNotes && (
                  <p className="text-xs text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/30 p-3 rounded-lg">
                    {pricingNotes}
                  </p>
                )}

                {(regulatoryAlerts.length > 0 || pricingFlags.length > 0) && (
                  <div className="space-y-2">
                    {regulatoryAlerts.map((a) => (
                      <div
                        key={a.code}
                        className="flex gap-2 p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 text-sm"
                      >
                        <ExclamationTriangleIcon className="h-5 w-5 text-amber-500 shrink-0" />
                        <div>
                          <p className="font-medium text-amber-900 dark:text-amber-100">{a.title}</p>
                          <p className="text-amber-800/80 dark:text-amber-200/80 text-xs mt-0.5">
                            {a.message}
                          </p>
                          {a.suggestion && (
                            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                              → {a.suggestion}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                    {pricingFlags.map((f, i) => (
                      <div
                        key={i}
                        className="flex gap-2 p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 text-sm"
                      >
                        <ExclamationTriangleIcon className="h-5 w-5 text-red-500 shrink-0" />
                        <p className="text-red-800 dark:text-red-200 text-xs">{f.message}</p>
                      </div>
                    ))}
                    {pricingSummary && (
                      <p className="text-xs text-slate-500">{pricingSummary}</p>
                    )}
                  </div>
                )}
              </>
            )}

            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="btn-secondary inline-flex items-center gap-2"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                disabled={!proposalTitle.trim() || wizardServices.length === 0}
                className="btn-primary inline-flex items-center gap-2"
              >
                Draft email
                <ArrowRightIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Email */}
        {step === 4 && selectedClient && (
          <div className="space-y-4 animate-fade-in">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                {AI_COPILOT.name} send email
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Review and approve the email your client will receive
              </p>
            </div>

            {splitPane(
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                    Subject
                  </label>
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={(e) => {
                      setEmailSubject(e.target.value);
                      setEmailApproved(false);
                    }}
                    className="input-field w-full"
                    disabled={emailStreaming}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                    Email body
                  </label>
                  <textarea
                    value={emailBody}
                    onChange={(e) => {
                      setEmailBody(e.target.value);
                      setEmailApproved(false);
                    }}
                    rows={14}
                    className="input-field w-full font-mono text-sm"
                    disabled={emailStreaming}
                    placeholder={emailStreaming ? `${AI_COPILOT.name} is drafting…` : ''}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={streamEmailDraft}
                    disabled={emailStreaming}
                    className="btn-secondary text-sm inline-flex items-center gap-2"
                  >
                    <SparklesIcon className="h-4 w-4" />
                    {emailStreaming ? 'Drafting…' : 'Regenerate'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmailApproved(true)}
                    disabled={!emailSubject.trim() || !emailBody.trim() || emailStreaming}
                    className="btn-primary text-sm inline-flex items-center gap-2"
                  >
                    <CheckIcon className="h-4 w-4" />
                    Approve email
                  </button>
                  {emailApproved && (
                    <span className="text-xs text-green-600 dark:text-green-400 self-center">
                      Approved — ready to send
                    </span>
                  )}
                </div>
              </>,
              'email'
            )}

            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="btn-secondary inline-flex items-center gap-2"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep(5)}
                disabled={!emailApproved}
                className="btn-primary inline-flex items-center gap-2"
              >
                Continue to send
                <ArrowRightIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Send */}
        {step === 5 && selectedClient && (
          <div className="space-y-5 animate-fade-in text-center max-w-lg mx-auto py-4">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-950/40 dark:to-indigo-950/30 border border-violet-200 dark:border-violet-800">
              <PaperAirplaneIcon className="h-10 w-10 mx-auto text-violet-600 dark:text-violet-400 mb-3" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Ready to send
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                <strong>{proposalTitle}</strong> for <strong>{selectedClient.name}</strong> will be
                created and emailed to {selectedClient.contactEmail}.
              </p>
              <p className="text-xs text-slate-500 mt-2">
                {wizardServices.length} service{wizardServices.length === 1 ? '' : 's'} • Subject:{' '}
                {emailSubject}
              </p>
            </div>

            {regulatoryAlerts.length > 0 && (
              <div className="text-left p-3 rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-200">
                <strong>Note:</strong> {regulatoryAlerts.length} regulatory alert
                {regulatoryAlerts.length === 1 ? '' : 's'} flagged — review on the proposal detail
                page after sending.
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={() => setStep(4)}
                className="btn-secondary inline-flex items-center justify-center gap-2"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                Back
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || saving}
                className="btn-primary inline-flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700"
              >
                <PaperAirplaneIcon className="h-4 w-4" />
                {sending ? 'Sending…' : 'Create & send proposal'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}