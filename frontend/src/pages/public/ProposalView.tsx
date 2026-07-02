import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../../utils/api';
import { formatCurrency, formatDate } from '../../utils/formatters';
import toast from 'react-hot-toast';
import SignaturePad from '../../components/signature/SignaturePad';
import {
  DocumentTextIcon,
  ExclamationCircleIcon,
  ClockIcon,
  SparklesIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PaperAirplaneIcon,
  CreditCardIcon,
  BuildingLibraryIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';
import { AI_COPILOT } from '../../config/aiCopilot';
import {
  DECLINE_REASONS,
  DECLINE_REASON_LABELS,
  type DeclineReason,
} from '../../constants/declineReasons';
import {
  hasPricingTiers,
  calculateTierTotals,
  findPricingTier,
  type PricingTier,
  type PublicSigningState,
} from '../../utils/proposalCustomFields';

interface PaymentConfig {
  collectPaymentAtSign: boolean;
  paymentRequired: boolean;
  provider: 'adfin' | 'gocardless_stub' | 'none';
  providerConfigured: boolean;
  isStub: boolean;
  methods: { directDebit: boolean; card: boolean };
  paymentStatus: string | null;
  paymentMandateId: string | null;
  checkoutUrl: string | null;
}

interface ProposalCustomFieldsView {
  offerThreePackages?: boolean;
  pricingTiers?: Array<PricingTier & { subtotal?: number; vatAmount?: number; total?: number }>;
  requiredSigners?: number;
  selectedTierId?: string;
  selectedTierLabel?: string;
}

interface ProposalData {
  id: string;
  reference: string;
  title: string;
  status: string;
  validUntil: string;
  subtotal: number;
  vatAmount: number;
  total: number;
  baseSubtotal?: number;
  baseVatAmount?: number;
  baseTotal?: number;
  paymentTerms: string;
  coverLetter?: string;
  terms?: string;
  engagementLetter?: string;
  payment?: PaymentConfig | null;
  customFields?: ProposalCustomFieldsView;
  signing?: PublicSigningState;
  client: {
    name: string;
    contactName?: string;
    companyType: string;
    contactEmail?: string;
  };
  createdBy?: {
    firstName: string;
    lastName: string;
    jobTitle?: string;
  };
  tenant: {
    name: string;
    primaryColor: string;
    logo?: string;
  };
  services: Array<{
    id: string;
    name: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    lineTotal?: number;
    total?: number;
    frequency: string;
    billingFrequency?: string;
    oneOffDueDate?: string | null;
    isOptional: boolean;
  }>;
}

type QaMessage = { role: 'user' | 'assistant'; content: string };

const SIGN_PAGE_FAQS: Array<{ question: string; answer: string }> = [
  {
    question: 'What am I agreeing to when I sign?',
    answer:
      'You confirm you are authorised to accept this proposal on behalf of the client named above, agree to the services and fees shown, and accept the terms and conditions. Your electronic signature is legally valid in the UK.',
  },
  {
    question: 'How long is this proposal valid?',
    answer:
      'The validity date is shown at the top of this page. After that date, the proposal expires and fees or scope may need to be reconfirmed with your accountant.',
  },
  {
    question: 'Can I decline without obligation?',
    answer:
      'Yes. Declining does not create a contract. You may optionally share a reason to help your accountant improve future proposals.',
  },
  {
    question: 'What happens after I accept?',
    answer:
      'Your accountant is notified immediately. You will typically receive a welcome email, AML or ID verification requests, and onboarding steps for your engagement.',
  },
  {
    question: 'Who can I contact for help?',
    answer:
      'For questions about fees, scope, or timing, contact your accountant directly. You can also ask Clara below — answers are based only on this proposal.',
  },
];

function splitCoverLetterParagraphs(...parts: Array<string | undefined>): string[] {
  const text = parts.filter(Boolean).join('\n\n');
  return text
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function QaTypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-violet-500"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

const PublicProposalView = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [proposal, setProposal] = useState<ProposalData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const [signatureData, setSignatureData] = useState<string>('');
  const [signerName, setSignerName] = useState('');
  const [signerRole, setSignerRole] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [authorisedToSign, setAuthorisedToSign] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [declineReasonCategory, setDeclineReasonCategory] = useState<DeclineReason | ''>('');
  const [declineReasonText, setDeclineReasonText] = useState('');
  const [showDecline, setShowDecline] = useState(false);
  const [isAccepted, setIsAccepted] = useState(false);
  const [faqExpanded, setFaqExpanded] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches
  );
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const [qaExpanded, setQaExpanded] = useState(false);
  const [qaMessages, setQaMessages] = useState<QaMessage[]>([]);
  const [qaInput, setQaInput] = useState('');
  const [qaLoading, setQaLoading] = useState(false);
  const [signingSummary, setSigningSummary] = useState<string | null>(null);
  const [signingSummaryLoading, setSigningSummaryLoading] = useState(false);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);
  const [showPaymentStep, setShowPaymentStep] = useState(false);
  const [paymentMethodChoice, setPaymentMethodChoice] = useState<'direct_debit' | 'card' | null>(null);
  const [isSettingUpPayment, setIsSettingUpPayment] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [stubMandateId, setStubMandateId] = useState<string | null>(null);
  const [isCompletingStub, setIsCompletingStub] = useState(false);
  const qaEndRef = useRef<HTMLDivElement>(null);
  const [isMobileSign, setIsMobileSign] = useState(false);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [awaitingAdditionalSigner, setAwaitingAdditionalSigner] = useState(false);
  const [signingState, setSigningState] = useState<PublicSigningState | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const update = () => setIsMobileSign(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const loadProposal = async () => {
      if (!token) return;
      try {
        setIsLoading(true);
        const response = (await apiClient.get(`/proposals/view/${token}`)) as any;
        if (response.success) {
          const data = response.data;
          setProposal(data);
          setIsAccepted(data.status === 'ACCEPTED');
          if (data.signing) {
            setSigningState(data.signing);
            setAwaitingAdditionalSigner(data.signing.awaitingAdditionalSigner);
            if (data.signing.awaitingAdditionalSigner) {
              setTermsAccepted(true);
              setSignerEmail('');
              setSignerName('');
              setSignerRole('');
            }
          }
          if (data.customFields?.selectedTierId) {
            setSelectedTierId(data.customFields.selectedTierId);
          }
          if (data.payment) {
            setPaymentConfig(data.payment);
            const ps = data.payment.paymentStatus;
            setPaymentComplete(['ACTIVE', 'PAID', 'SKIPPED'].includes(ps || ''));
            setShowPaymentStep(
              data.payment.paymentRequired && !['ACTIVE', 'PAID', 'SKIPPED'].includes(ps || '')
            );
          }
          if (data.client?.contactEmail && !data.signing?.awaitingAdditionalSigner) {
            setSignerEmail(data.client.contactEmail);
          }
        } else {
          setError('Proposal not found or link expired');
        }
      } catch (error: any) {
        setError(error.response?.data?.error?.message || 'Failed to load proposal');
      } finally {
        setIsLoading(false);
      }
    };

    loadProposal();
  }, [token]);

  useEffect(() => {
    const loadSigningSummary = async () => {
      if (!token || isAccepted || signingSummary) return;
      try {
        setSigningSummaryLoading(true);
        const response = (await apiClient.get(`/proposals/view/${token}/signing-summary`)) as any;
        if (response.success) {
          setSigningSummary(response.data.summary);
        }
      } catch {
        // Non-blocking — summary is helpful but not required to sign
      } finally {
        setSigningSummaryLoading(false);
      }
    };

    const expired = proposal ? new Date(proposal.validUntil) < new Date() : false;
    if (proposal && !isAccepted && !expired && (termsAccepted || showSignature)) {
      loadSigningSummary();
    }
  }, [token, proposal, isAccepted, termsAccepted, showSignature, signingSummary]);

  useEffect(() => {
    if (qaExpanded) {
      qaEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [qaMessages, qaLoading, qaExpanded]);

  const handleAskQuestion = async () => {
    const text = qaInput.trim();
    if (!text || qaLoading || !token) return;

    const userMessage: QaMessage = { role: 'user', content: text };
    setQaMessages((prev) => [...prev, userMessage]);
    setQaInput('');
    setQaLoading(true);

    try {
      const response = (await apiClient.post(`/proposals/view/${token}/ask`, {
        question: text,
        history: qaMessages.slice(-4),
      })) as any;

      if (response.success) {
        setQaMessages((prev) => [
          ...prev,
          { role: 'assistant', content: response.data.answer },
        ]);
      }
    } catch (error: any) {
      const message =
        error.response?.data?.error?.message ||
        `${AI_COPILOT.name} couldn't answer right now. Please contact ${proposal?.tenant.name || 'the practice'} directly.`;
      setQaMessages((prev) => [...prev, { role: 'assistant', content: message }]);
    } finally {
      setQaLoading(false);
    }
  };

  const tiersEnabled =
    proposal?.customFields && hasPricingTiers(proposal.customFields as any);
  const lockedTierId =
    selectedTierId || proposal?.customFields?.selectedTierId || null;
  const activeTier =
    tiersEnabled && lockedTierId
      ? findPricingTier(proposal!.customFields as any, lockedTierId)
      : undefined;

  const displayTotals = (() => {
    if (!proposal) return { subtotal: 0, vatAmount: 0, total: 0 };
    if (activeTier) {
      const base = {
        subtotal: proposal.baseSubtotal ?? proposal.subtotal,
        vatAmount: proposal.baseVatAmount ?? proposal.vatAmount,
        total: proposal.baseTotal ?? proposal.total,
      };
      return calculateTierTotals(base, activeTier);
    }
    return {
      subtotal: proposal.subtotal,
      vatAmount: proposal.vatAmount,
      total: proposal.total,
    };
  })();

  const handleAccept = async () => {
    if (!termsAccepted) {
      toast.error('Please accept the terms and conditions');
      return;
    }
    if (tiersEnabled && !lockedTierId && !awaitingAdditionalSigner) {
      toast.error('Please select a package before continuing');
      return;
    }
    setShowSignature(true);
  };

  const handleSignatureSave = (signature: string) => {
    setSignatureData(signature);
  };

  const handleSetupPayment = async (method: 'direct_debit' | 'card') => {
    if (!token) return;
    setPaymentMethodChoice(method);
    setIsSettingUpPayment(true);
    try {
      const response = (await apiClient.post(`/proposals/view/${token}/payment/setup`, {
        preferredMethod: method,
      })) as any;

      if (response.success) {
        const { checkoutUrl, isStub, mandateId, provider } = response.data;

        if (provider === 'adfin' && checkoutUrl) {
          window.location.href = checkoutUrl;
          return;
        }

        if (isStub && mandateId) {
          setStubMandateId(mandateId);
          toast('Demo mode: complete the Direct Debit setup below', { icon: '🏦' });
        }
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to set up payment');
    } finally {
      setIsSettingUpPayment(false);
    }
  };

  const handleCompleteStubMandate = async () => {
    if (!token || !stubMandateId) return;
    setIsCompletingStub(true);
    try {
      const response = (await apiClient.post(`/proposals/view/${token}/payment/complete-stub`, {
        mandateId: stubMandateId,
      })) as any;
      if (response.success) {
        setPaymentComplete(true);
        setShowPaymentStep(false);
        setPaymentConfig((prev) => (prev ? { ...prev, paymentStatus: 'ACTIVE' } : prev));
        toast.success('Direct Debit mandate set up successfully');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to complete mandate setup');
    } finally {
      setIsCompletingStub(false);
    }
  };

  const handleSkipPayment = async () => {
    if (!token) return;
    try {
      await apiClient.post(`/proposals/view/${token}/payment/skip`);
      setPaymentComplete(true);
      setShowPaymentStep(false);
      setPaymentConfig((prev) => (prev ? { ...prev, paymentStatus: 'SKIPPED' } : prev));
      toast('You can set up payment with your accountant later', { icon: 'ℹ️' });
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to skip payment setup');
    }
  };

  const handleSubmitSignature = async () => {
    if (!signatureData || !signerName || !signerRole || !signerEmail) {
      toast.error('Please provide your name, role, email, and signature');
      return;
    }
    if (!authorisedToSign) {
      toast.error('Please confirm you are authorised to sign on behalf of the client');
      return;
    }

    // Collect forensic device evidence for signature proof
    const deviceInfo = JSON.stringify({
      platform: navigator.platform,
      screen: `${window.screen.width}x${window.screen.height}`,
      colorDepth: window.screen.colorDepth,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      cores: navigator.hardwareConcurrency || 'unknown',
      touch: 'ontouchstart' in window,
    });

    setIsSubmitting(true);
    try {
      const consentText = `I confirm I am authorised to sign on behalf of ${proposal?.client?.name || 'the client'} and agree to the terms of this proposal.`;

      const isFirstSigner = !awaitingAdditionalSigner;
      const tierToSubmit =
        isFirstSigner && tiersEnabled ? lockedTierId || undefined : undefined;

      const response = (await apiClient.post(`/proposals/view/${token}/sign`, {
        signedBy: signerName,
        signedByRole: signerRole,
        signerEmail,
        signatureData,
        agreementAccepted: termsAccepted,
        authorisedToSign,
        deviceInfo,
        consentText,
        ...(tierToSubmit ? { selectedTierId: tierToSubmit } : {}),
      })) as any;

      if (response.success) {
        setShowSignature(false);
        setSignatureData('');
        setAuthorisedToSign(false);

        if (response.data?.pendingAdditionalSigner) {
          toast.success('Signature recorded — additional signatory required');
          setAwaitingAdditionalSigner(true);
          setSigningState({
            requiredSigners: response.data.requiredSigners ?? 2,
            signaturesReceived: response.data.signaturesReceived ?? 1,
            awaitingAdditionalSigner: true,
            existingSignatures: [
              ...(signingState?.existingSignatures || []),
              {
                signedBy: signerName,
                signedByRole: signerRole,
                signedAt: new Date().toISOString(),
              },
            ],
          });
          setSignerName('');
          setSignerRole('');
          setSignerEmail('');
          if (token) {
            try {
              const refreshed = (await apiClient.get(`/proposals/view/${token}`)) as any;
              if (refreshed.success) {
                setProposal(refreshed.data);
                if (refreshed.data.signing) setSigningState(refreshed.data.signing);
              }
            } catch {
              // Non-blocking
            }
          }
          return;
        }

        toast.success('Proposal accepted successfully');
        setIsAccepted(true);
        setAwaitingAdditionalSigner(false);

        const payment = response.data?.payment;
        if (payment) {
          setPaymentConfig(payment);
          if (payment.paymentRequired) {
            setShowPaymentStep(true);
            toast('Next step: set up payment for your engagement fees', { icon: '💳', duration: 6000 });
          }
        } else if (token) {
          try {
            const cfg = (await apiClient.get(`/proposals/view/${token}/payment/config`)) as any;
            if (cfg.success) {
              setPaymentConfig(cfg.data);
              if (cfg.data.paymentRequired) setShowPaymentStep(true);
            }
          } catch {
            // Non-blocking
          }
        }
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to submit signature');
    } finally {
      setIsSubmitting(false);
    }
  };



  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-8 px-4">
        <div className="max-w-4xl mx-auto space-y-4 animate-pulse">
          <div className="h-24 rounded-xl bg-white dark:bg-slate-800" />
          <div className="h-64 rounded-xl bg-white dark:bg-slate-800" />
          <div className="h-40 rounded-xl bg-white dark:bg-slate-800" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <ExclamationCircleIcon className="mx-auto h-16 w-16 text-red-500" />
          <h2 className="mt-4 text-xl font-semibold text-slate-900 dark:text-white">Proposal Not Available</h2>
          <p className="mt-2 text-slate-700">{error}</p>
          <p className="mt-4 text-sm text-slate-600">
            Please contact the sender if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  if (!proposal) return null;

  const isExpired = new Date(proposal.validUntil) < new Date();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-6 sm:py-8 px-4 sm:px-6 lg:px-8 pb-28 sm:pb-8 [padding-bottom:max(7rem,env(safe-area-inset-bottom))]">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white dark:bg-slate-800 rounded-t-xl shadow-sm p-6 border-b dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Proposal from</p>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{proposal.tenant.name}</h1>
            </div>
            {proposal.tenant.logo && <img src={proposal.tenant.logo} alt="Logo" className="h-12" />}
          </div>
        </div>

        {/* Proposal Content */}
        <div className="bg-white dark:bg-slate-800 shadow-sm rounded-b-xl p-6 space-y-8">
          {/* Status Banner - Enhanced with lifecycle journey tie-in */}
          {isAccepted ? (
            <>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 dark:from-emerald-950/30 dark:to-slate-800"
              >
                <div className="flex items-start gap-4">
                  <div className="mt-1 rounded-full bg-emerald-100 p-2 dark:bg-emerald-900/40">
                    <SparklesIcon className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-emerald-900 dark:text-emerald-200 text-lg">
                      Thank you — Proposal accepted!
                    </p>
                    <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
                      Your automated client onboarding journey has started. Expect a warm welcome email
                      shortly, followed by secure requests for ID/AML verification and next steps.
                    </p>

                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      {[
                        { label: 'Welcome', desc: 'Email sent' },
                        { label: 'AML / ID', desc: 'Verification' },
                        { label: 'Engagement', desc: 'Letter & sign' },
                        { label: 'Onboarding', desc: 'Setup & kickoff' },
                      ].map((s, i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-emerald-100 bg-white/70 px-3 py-2 dark:border-emerald-900/50 dark:bg-emerald-950/20"
                        >
                          <div className="font-medium text-emerald-800 dark:text-emerald-200">{s.label}</div>
                          <div className="text-emerald-600/70 dark:text-emerald-400/70">{s.desc}</div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-[11px] text-emerald-600/80 dark:text-emerald-400/70">
                      All communications are automated and tailored. Your accountant can pause or customise
                      them at any time.
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Post-sign payment mandate collection (W1.3–W1.4) */}
              {showPaymentStep && paymentConfig?.paymentRequired && !paymentComplete && (
                <motion.div
                  data-testid="payment-setup-card"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-6 dark:from-sky-950/30 dark:to-slate-800 dark:border-sky-800"
                >
                  <h3 className="text-lg font-semibold text-sky-900 dark:text-sky-100">
                    Set up payment
                  </h3>
                  <p className="mt-1 text-sm text-sky-800 dark:text-sky-200/90">
                    To complete your engagement with {proposal.tenant.name}, please authorise payment of{' '}
                    <strong>{formatCurrency(proposal.total)}</strong> via Direct Debit or card.
                    {paymentConfig.isStub && (
                      <span className="block mt-1 text-xs text-amber-700 dark:text-amber-300">
                        Demo mode — Adfin is not configured; using a GoCardless-style stub flow.
                      </span>
                    )}
                  </p>

                  {!stubMandateId ? (
                    <div className="mt-4 flex flex-col sm:flex-row gap-3">
                      {paymentConfig.methods.directDebit && (
                        <button
                          type="button"
                          data-testid="setup-direct-debit"
                          onClick={() => handleSetupPayment('direct_debit')}
                          disabled={isSettingUpPayment}
                          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-sky-300 bg-white px-4 py-3 text-sm font-medium text-sky-900 hover:bg-sky-50 disabled:opacity-50 dark:bg-slate-800 dark:border-sky-700 dark:text-sky-100"
                        >
                          <BuildingLibraryIcon className="h-5 w-5" />
                          {isSettingUpPayment && paymentMethodChoice === 'direct_debit'
                            ? 'Setting up…'
                            : 'Set up Direct Debit'}
                        </button>
                      )}
                      {paymentConfig.methods.card && (
                        <button
                          type="button"
                          data-testid="setup-card"
                          onClick={() => handleSetupPayment('card')}
                          disabled={isSettingUpPayment}
                          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-sky-300 bg-white px-4 py-3 text-sm font-medium text-sky-900 hover:bg-sky-50 disabled:opacity-50 dark:bg-slate-800 dark:border-sky-700 dark:text-sky-100"
                        >
                          <CreditCardIcon className="h-5 w-5" />
                          {isSettingUpPayment && paymentMethodChoice === 'card'
                            ? 'Setting up…'
                            : 'Pay by card'}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-dashed border-sky-300 bg-white/80 p-5 dark:bg-slate-900/50 dark:border-sky-700">
                      <p className="text-sm font-medium text-sky-900 dark:text-sky-100">
                        Demo Direct Debit mandate
                      </p>
                      <p className="mt-2 text-sm text-sky-800 dark:text-sky-200/80">
                        In production, you would be redirected to a secure bank authorisation page. For
                        this demo, confirm below to simulate mandate activation.
                      </p>
                      <p className="mt-2 text-xs font-mono text-slate-500 dark:text-slate-400">
                        Mandate ref: {stubMandateId}
                      </p>
                      <button
                        type="button"
                        data-testid="complete-stub-mandate"
                        onClick={handleCompleteStubMandate}
                        disabled={isCompletingStub}
                        className="mt-4 btn-primary w-full sm:w-auto"
                      >
                        {isCompletingStub ? 'Activating…' : 'Confirm Direct Debit (demo)'}
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleSkipPayment}
                    className="mt-4 text-sm text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 underline"
                  >
                    Set up payment later
                  </button>
                </motion.div>
              )}

              {paymentComplete && paymentConfig && paymentConfig.paymentStatus !== 'SKIPPED' && (
                <div
                  data-testid="payment-complete-banner"
                  className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 flex items-center gap-3 dark:border-emerald-800 dark:bg-emerald-950/30"
                >
                  <CheckCircleIcon className="h-5 w-5 text-emerald-600 shrink-0" />
                  <p className="text-sm text-emerald-800 dark:text-emerald-200">
                    Payment mandate active — your accountant can now collect fees as agreed.
                  </p>
                </div>
              )}
            </>
          ) : isExpired ? (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-4 flex items-center">
              <ClockIcon className="h-6 w-6 text-red-600 mr-3" />
              <div>
                <p className="font-medium text-red-900">Proposal Expired</p>
                <p className="text-sm text-red-700">
                  This proposal is no longer valid as of {formatDate(proposal.validUntil)}.
                </p>
              </div>
            </div>
          ) : null}

          {/* Proposal Details */}
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{proposal.title}</h2>
            <p className="text-sm text-slate-600 mt-1">Reference: {proposal.reference}</p>
            <p className="text-sm text-slate-600">Valid until: {formatDate(proposal.validUntil)}</p>
          </div>

          {/* Client */}
          <div className="border-t pt-6 grid sm:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-slate-600 uppercase tracking-wide">
                Prepared For
              </h3>
              {proposal.client.contactName?.trim() && (
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {proposal.client.contactName.trim()}
                </p>
              )}
              <p
                className={`${
                  proposal.client.contactName?.trim() ? 'text-base text-slate-700' : 'mt-1 text-lg font-medium text-slate-900 dark:text-white'
                }`}
              >
                {proposal.client.name}
              </p>
              <p className="text-sm text-slate-600 capitalize">
                {proposal.client.companyType.replace(/_/g, ' ')}
              </p>
            </div>
            {proposal.createdBy && (
              <div>
                <h3 className="text-sm font-medium text-slate-600 uppercase tracking-wide">
                  Prepared By
                </h3>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {[proposal.createdBy.firstName, proposal.createdBy.lastName].filter(Boolean).join(' ')}
                </p>
                {proposal.createdBy.jobTitle && (
                  <p className="text-sm text-slate-600">{proposal.createdBy.jobTitle}</p>
                )}
                {proposal.tenant?.name && (
                  <p className="text-sm text-slate-500 mt-0.5">{proposal.tenant.name}</p>
                )}
              </div>
            )}
          </div>

          {(proposal.coverLetter ||
            (proposal as { proposalSummary?: string }).proposalSummary) && (
            <div className="border-t border-slate-200 dark:border-slate-600 pt-6">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                Cover letter
              </h3>
              <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/60 p-5 space-y-5">
                {splitCoverLetterParagraphs(
                  proposal.coverLetter,
                  (proposal as { proposalSummary?: string }).proposalSummary
                ).map((paragraph, i) => (
                  <p
                    key={i}
                    className="text-sm sm:text-base leading-relaxed text-slate-800 dark:text-slate-100"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Services */}
          <div className="border-t pt-6">
            <h3 className="text-sm font-medium text-slate-600 uppercase tracking-wide">Services</h3>
            <div className="mt-4 space-y-4">
              {proposal.services.map((service) => (
                <div
                  key={service.id}
                  className="flex justify-between items-start p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center">
                      <h4 className="font-medium text-slate-900 dark:text-slate-100">{service.name}</h4>
                      {service.isOptional && (
                        <span className="ml-2 px-2 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-full">
                          Optional
                        </span>
                      )}
                    </div>
                    {service.description && (
                      <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{service.description}</p>
                    )}
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                      {service.quantity} x {formatCurrency(service.unitPrice)} /{' '}
                      {(service.billingFrequency || service.frequency).toLowerCase().replace(/_/g, ' ')}
                    </p>
                    {(service.billingFrequency || service.frequency) === 'ONE_TIME' &&
                      service.oneOffDueDate && (
                        <p className="text-sm text-slate-700 dark:text-slate-200 mt-1">
                          Due: {formatDate(service.oneOffDueDate)}
                        </p>
                      )}
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      {formatCurrency(service.lineTotal || service.total || 0)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Package selection — Bronze / Silver / Gold / Platinum */}
          {!isAccepted && !isExpired && tiersEnabled && !awaitingAdditionalSigner && (
            <div className="border-t pt-6" data-testid="tier-selection-section">
              <h3 className="text-sm font-medium text-slate-600 uppercase tracking-wide">
                Choose your package
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 mb-4">
                Select the option that best fits your needs before signing.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(proposal.customFields?.pricingTiers || []).map((tier) => {
                  const tierTotals =
                    tier.total != null
                      ? {
                          subtotal: tier.subtotal ?? displayTotals.subtotal,
                          vatAmount: tier.vatAmount ?? displayTotals.vatAmount,
                          total: tier.total,
                        }
                      : calculateTierTotals(
                          {
                            subtotal: proposal.baseSubtotal ?? proposal.subtotal,
                            vatAmount: proposal.baseVatAmount ?? proposal.vatAmount,
                            total: proposal.baseTotal ?? proposal.total,
                          },
                          tier
                        );
                  const isSelected = lockedTierId === tier.id;
                  const isLocked = Boolean(proposal.customFields?.selectedTierId);
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      data-testid={`tier-option-${tier.id}`}
                      disabled={isLocked && !isSelected}
                      onClick={() => setSelectedTierId(tier.id)}
                      className={`text-left rounded-xl border p-4 transition-all ${
                        isSelected
                          ? 'border-primary-500 bg-primary-50/60 dark:bg-primary-950/30 ring-2 ring-primary-400/40'
                          : 'border-slate-200 dark:border-slate-600 hover:border-primary-300'
                      } ${isLocked && !isSelected ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <p className="font-semibold text-slate-900 dark:text-white">{tier.label}</p>
                      {tier.description && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                          {tier.description}
                        </p>
                      )}
                      <p className="text-lg font-bold text-primary-600 mt-3 tabular-nums">
                        {formatCurrency(tierTotals.total)}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">inc. VAT</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeTier && (
            <div className="border-t pt-4">
              <p className="text-sm text-primary-700 dark:text-primary-300">
                Selected package: <strong>{activeTier.label}</strong>
              </p>
            </div>
          )}

          {/* Additional signatory required */}
          {awaitingAdditionalSigner && !isAccepted && (
            <div
              className="border-t pt-6"
              data-testid="additional-signatory-banner"
            >
              <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/20 p-5">
                <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  Additional signatory required
                </h3>
                <p className="text-sm text-amber-800 dark:text-amber-100/90 mt-2">
                  The primary signatory has completed their signature. A second authorised person
                  must also sign before this proposal is fully accepted.
                </p>
                {signingState?.existingSignatures?.map((sig, i) => (
                  <p key={i} className="text-xs text-amber-700/80 mt-2">
                    Signed: {sig.signedBy} ({sig.signedByRole})
                  </p>
                ))}
                <button
                  type="button"
                  data-testid="additional-signatory-button"
                  onClick={() => setShowSignature(true)}
                  className="btn-primary mt-4 w-full sm:w-auto"
                >
                  Add second signature
                </button>
              </div>
            </div>
          )}

          {/* Pricing Summary */}
          <div className="border-t border-slate-200 dark:border-slate-600 pt-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-700 dark:text-slate-200">Subtotal</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {formatCurrency(displayTotals.subtotal)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-700 dark:text-slate-200">VAT</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {formatCurrency(displayTotals.vatAmount)}
                </span>
              </div>
              <div className="flex justify-between text-lg font-semibold pt-2 border-t border-slate-200 dark:border-slate-600">
                <span className="text-slate-900 dark:text-slate-100">Total</span>
                <span className="text-slate-900 dark:text-slate-100">
                  {formatCurrency(displayTotals.total)}
                </span>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
              Payment terms: {proposal.paymentTerms}
            </p>
          </div>

          {/* Static FAQs — UK English */}
          {!isAccepted && !isExpired && (
            <div className="border-t pt-6" data-testid="clara-faq-section">
              <button
                type="button"
                data-testid="faq-toggle"
                onClick={() => setFaqExpanded((v) => !v)}
                className="w-full flex items-center justify-between gap-3 text-left group min-h-[44px]"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/40">
                    <SparklesIcon className="h-4 w-4 text-sky-600 dark:text-sky-300" />
                  </span>
                  <div>
                    <h3 className="text-sm font-medium text-slate-900 dark:text-white">
                      Questions? Ask {AI_COPILOT.name}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Common questions about signing this proposal
                    </p>
                  </div>
                </div>
                {faqExpanded ? (
                  <ChevronUpIcon className="h-5 w-5 text-slate-400" />
                ) : (
                  <ChevronDownIcon className="h-5 w-5 text-slate-400" />
                )}
              </button>

              <AnimatePresence initial={false}>
                {faqExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-4 space-y-2">
                      {SIGN_PAGE_FAQS.map((faq, index) => (
                        <div
                          key={faq.question}
                          className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
                        >
                          <button
                            type="button"
                            data-testid={`faq-item-${index}`}
                            onClick={() =>
                              setOpenFaqIndex((current) => (current === index ? null : index))
                            }
                            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-slate-900 dark:text-white min-h-[44px] hover:bg-slate-50 dark:hover:bg-slate-800/50"
                          >
                            <span>{faq.question}</span>
                            {openFaqIndex === index ? (
                              <ChevronUpIcon className="h-4 w-4 shrink-0 text-slate-400" />
                            ) : (
                              <ChevronDownIcon className="h-4 w-4 shrink-0 text-slate-400" />
                            )}
                          </button>
                          {openFaqIndex === index && (
                            <p className="px-4 pb-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                              {faq.answer}
                            </p>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setFaqExpanded(false);
                          setQaExpanded(true);
                        }}
                        className="text-sm text-violet-700 dark:text-violet-300 hover:underline mt-2 min-h-[44px]"
                      >
                        Still have a question? Chat with {AI_COPILOT.name} about this proposal →
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Live Q&A — Clara answers from proposal content only */}
          {!isAccepted && !isExpired && (
            <div className="border-t pt-6">
              <button
                type="button"
                data-testid="qa-toggle"
                onClick={() => setQaExpanded((v) => !v)}
                className="w-full flex items-center justify-between gap-3 text-left group min-h-[44px]"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/40">
                    <SparklesIcon className="h-4 w-4 text-violet-600 dark:text-violet-300" />
                  </span>
                  <div>
                    <h3 className="text-sm font-medium text-slate-900 dark:text-white">
                      Ask {AI_COPILOT.name} about this proposal
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Answers come only from this proposal — not general tax advice
                    </p>
                  </div>
                </div>
                {qaExpanded ? (
                  <ChevronUpIcon className="h-5 w-5 text-slate-400 group-hover:text-slate-600" />
                ) : (
                  <ChevronDownIcon className="h-5 w-5 text-slate-400 group-hover:text-slate-600" />
                )}
              </button>

              <AnimatePresence initial={false}>
                {qaExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-4 rounded-xl border border-violet-200/80 dark:border-violet-800/60 bg-gradient-to-b from-violet-50/80 to-white dark:from-violet-950/20 dark:to-slate-800/50 p-4">
                      {qaMessages.length === 0 && !qaLoading && (
                        <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
                          Not sure about fees, services, or terms? Ask a question and{' '}
                          {AI_COPILOT.name} will explain using only the details in this proposal.
                        </p>
                      )}

                      <div className="space-y-3 max-h-64 overflow-y-auto mb-3">
                        {qaMessages.map((msg, i) => (
                          <div
                            key={i}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                                msg.role === 'user'
                                  ? 'bg-violet-600 text-white rounded-br-md'
                                  : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-violet-100 dark:border-violet-900/50 rounded-bl-md shadow-sm'
                              }`}
                            >
                              {msg.role === 'assistant' && (
                                <span className="block text-[10px] font-medium text-violet-600 dark:text-violet-300 mb-1">
                                  {AI_COPILOT.name}
                                </span>
                              )}
                              {msg.content}
                            </div>
                          </div>
                        ))}
                        {qaLoading && (
                          <div className="flex justify-start">
                            <div className="rounded-2xl rounded-bl-md bg-white dark:bg-slate-800 border border-violet-100 dark:border-violet-900/50 shadow-sm">
                              <QaTypingIndicator />
                            </div>
                          </div>
                        )}
                        <div ref={qaEndRef} />
                      </div>

                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleAskQuestion();
                        }}
                        className="flex gap-2"
                      >
                        <input
                          data-testid="qa-input"
                          type="text"
                          value={qaInput}
                          onChange={(e) => setQaInput(e.target.value)}
                          placeholder="e.g. What is included in the monthly fee?"
                          maxLength={500}
                          className="flex-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                        />
                        <button
                          type="submit"
                          data-testid="qa-submit"
                          disabled={qaLoading || qaInput.trim().length < 3}
                          className="inline-flex items-center justify-center rounded-lg bg-violet-600 px-3 py-2 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
                          aria-label="Send question"
                        >
                          <PaperAirplaneIcon className="h-4 w-4" />
                        </button>
                      </form>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Terms & Conditions */}
          {!isAccepted && !isExpired && (
            <div className="border-t pt-6">
              <h3 className="text-sm font-medium text-slate-600 uppercase tracking-wide">
                Terms & Conditions
              </h3>
              <div
                className="mt-4 rounded-xl border border-slate-200 dark:border-slate-600 max-h-72 overflow-y-auto relative"
                style={{
                  backgroundImage: "url('/images/pdf-page-background.jpg')",
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              >
                <div className="p-4 bg-white/90 dark:bg-slate-900/92 backdrop-blur-[1px] min-h-[12rem]">
                  <pre className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-sans">
                    {proposal.terms || 'Standard terms and conditions apply.'}
                  </pre>
                </div>
              </div>
              <div className="mt-4 flex items-start">
                <input
                  data-testid="terms-checkbox"
                  type="checkbox"
                  id="terms"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-1 h-4 w-4 text-primary-600 rounded"
                />
                <label
                  htmlFor="terms"
                  className="ml-2 text-sm text-slate-800 dark:text-slate-100"
                >
                  I have read and agree to the terms and conditions outlined above.
                </label>
              </div>
            </div>
          )}

          {/* Signing summary — shown before accept / signature step */}
          {!isAccepted && !isExpired && (termsAccepted || showSignature) && (
            <div
              data-testid="signing-summary-card"
              className="border-t pt-6"
            >
              <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/70 p-5">
                <div className="flex items-start gap-3">
                  <DocumentTextIcon className="h-6 w-6 text-primary-600 dark:text-primary-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      What you are agreeing to
                    </h3>
                    {signingSummaryLoading ? (
                      <div className="mt-3 space-y-2 animate-pulse">
                        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-full" />
                        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-5/6" />
                        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-4/6" />
                      </div>
                    ) : signingSummary ? (
                      <p className="mt-2 text-sm text-slate-800 dark:text-slate-100 leading-relaxed">
                        {signingSummary}
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-slate-800 dark:text-slate-100 leading-relaxed">
                        By signing, you confirm you are authorised to accept this proposal on behalf
                        of {proposal.client.name}, agree to the services and recurring fees shown
                        above, and accept the terms and conditions.
                      </p>
                    )}
                    <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
                      Please read this summary carefully before adding your signature.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          {!isAccepted && !isExpired && !showSignature && !showDecline && !awaitingAdditionalSigner && (
            <div className="border-t pt-6 flex flex-col sm:flex-row gap-3">
              <button
                data-testid="accept-proposal-button"
                onClick={handleAccept}
                disabled={!termsAccepted}
                className="flex-1 btn-primary py-3 disabled:opacity-50"
              >
                Accept Proposal
              </button>
              <button
                type="button"
                data-testid="decline-proposal-button"
                onClick={() => setShowDecline(true)}
                className="flex-1 btn-secondary py-3"
              >
                Decline
              </button>
            </div>
          )}

          {showDecline && !isAccepted && (
            <div className="border-t pt-6 space-y-4">
              <div>
                <h3 className="text-lg font-medium text-slate-900 dark:text-white">Decline proposal</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Help us improve — let us know why this proposal isn&apos;t right for you.
                </p>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-2">
                  Main reason <span className="text-red-500">*</span>
                </legend>
                {DECLINE_REASONS.map((reason) => (
                  <label
                    key={reason}
                    data-testid={`decline-reason-${reason.toLowerCase()}`}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      declineReasonCategory === reason
                        ? 'border-primary-500 bg-primary-50/60 dark:bg-primary-950/20'
                        : 'border-slate-200 dark:border-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="declineReason"
                      value={reason}
                      checked={declineReasonCategory === reason}
                      onChange={() => setDeclineReasonCategory(reason)}
                      className="mt-1 h-4 w-4 text-primary-600"
                    />
                    <span className="text-sm text-slate-800 dark:text-slate-100">
                      {DECLINE_REASON_LABELS[reason]}
                    </span>
                  </label>
                ))}
              </fieldset>

              <div>
                <label
                  htmlFor="decline-reason-text"
                  className="block text-sm font-medium text-slate-800 dark:text-slate-200"
                >
                  {declineReasonCategory === 'OTHER' ? (
                    <>
                      Tell us more <span className="text-red-500">*</span>
                    </>
                  ) : (
                    'Additional comments (optional)'
                  )}
                </label>
                <textarea
                  id="decline-reason-text"
                  data-testid="decline-reason-input"
                  value={declineReasonText}
                  onChange={(e) => setDeclineReasonText(e.target.value)}
                  rows={3}
                  className="input-field w-full mt-1"
                  placeholder={
                    declineReasonCategory === 'OTHER'
                      ? 'Please describe your reason…'
                      : 'Any extra detail that might help us…'
                  }
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => {
                    setShowDecline(false);
                    setDeclineReasonCategory('');
                    setDeclineReasonText('');
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="confirm-decline-button"
                  disabled={
                    isDeclining ||
                    !declineReasonCategory ||
                    (declineReasonCategory === 'OTHER' && declineReasonText.trim().length < 3)
                  }
                  className="btn-primary flex-1"
                  onClick={async () => {
                    setIsDeclining(true);
                    try {
                      await apiClient.post(`/proposals/view/${token}/decline`, {
                        declineReason: declineReasonCategory,
                        reason: declineReasonText.trim() || undefined,
                        declinedBy: signerName || undefined,
                      });
                      toast.success('Proposal declined — thank you for your feedback');
                      setShowDecline(false);
                      setDeclineReasonCategory('');
                      setDeclineReasonText('');
                    } catch (err: any) {
                      toast.error(err?.response?.data?.error?.message || 'Failed to decline');
                    } finally {
                      setIsDeclining(false);
                    }
                  }}
                >
                  {isDeclining ? 'Submitting…' : 'Confirm decline'}
                </button>
              </div>
            </div>
          )}

          {/* Signature Pad */}
          {!isAccepted && !isExpired && showSignature && (
            <div className="border-t pt-6">
              <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-4">
                {awaitingAdditionalSigner
                  ? 'Additional signatory — electronic signature'
                  : 'Electronic signature'}
              </h3>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                      Full Name
                    </label>
                    <input
                      data-testid="signer-name-input"
                      type="text"
                      value={signerName}
                      onChange={(e) => setSignerName(e.target.value)}
                      placeholder="John Smith"
                      className="mt-1 input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                      Role/Title
                    </label>
                    <input
                      data-testid="signer-role-input"
                      type="text"
                      value={signerRole}
                      onChange={(e) => setSignerRole(e.target.value)}
                      placeholder="Director"
                      className="mt-1 input-field"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                      Email address
                    </label>
                    <input
                      data-testid="signer-email-input"
                      type="email"
                      value={signerEmail}
                      onChange={(e) => setSignerEmail(e.target.value)}
                      placeholder="director@company.co.uk"
                      className="mt-1 input-field"
                    />
                  </div>
                </div>
                <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-100">
                  <input
                    data-testid="authorised-checkbox"
                    type="checkbox"
                    checked={authorisedToSign}
                    onChange={(e) => setAuthorisedToSign(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded"
                  />
                  <span>
                    I confirm I am authorised to sign on behalf of{' '}
                    <strong>{proposal?.client?.name}</strong> (simple electronic signature).
                  </span>
                </label>
                <SignaturePad onSave={handleSignatureSave} height={isMobileSign ? 168 : 200} />
                {signatureData && (
                  <div className="flex space-x-4">
                    <button
                      onClick={() => setShowSignature(false)}
                      className="flex-1 btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      data-testid="confirm-signature-button"
                      onClick={handleSubmitSignature}
                      disabled={isSubmitting}
                      className="flex-1 btn-primary"
                    >
                      {isSubmitting
                        ? 'Submitting…'
                        : awaitingAdditionalSigner
                          ? 'Confirm second signature'
                          : 'Confirm acceptance'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Mobile sticky accept bar */}
        {!isAccepted && !isExpired && !showSignature && !showDecline && !awaitingAdditionalSigner && (
          <div className="fixed bottom-0 left-0 right-0 z-40 p-4 pt-3 bg-white/95 dark:bg-slate-900/95 border-t border-slate-200 dark:border-slate-700 backdrop-blur-md sm:hidden [padding-bottom:max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={handleAccept}
              disabled={!termsAccepted}
              className="btn-primary w-full py-3.5 text-base min-h-[48px] touch-manipulation"
            >
              {termsAccepted ? 'Review & sign proposal' : 'Accept terms to continue'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicProposalView;
