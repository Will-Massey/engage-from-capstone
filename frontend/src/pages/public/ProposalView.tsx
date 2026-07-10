import { useState, useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PaymentConfig } from '../../types/payment';
import {
  calculateTierTotals,
  findPricingTier,
  type ProposalCustomFieldsView,
  type PublicSigningState,
} from '../../utils/proposalCustomFields';
import {
  DECLINE_REASONS,
  DECLINE_REASON_LABELS,
  type DeclineReason,
} from '../../constants/declineReasons';
import { apiClient } from '../../utils/api';
import { appPath } from '../../utils/appBase';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { stripMarkdownHeadings } from '../../utils/termsPlainText';
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
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';
import { AI_COPILOT } from '../../config/aiCopilot';
import {
  buildPublicSignPayload,
  buildSignatureDeviceInfo,
  buildSigningSteps,
  collectSignatureValidationErrors,
  readBrowserDeviceInfo,
  splitCoverLetterParagraphs,
  type SigningStep,
} from './publicSigning';

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

type SigningCostSummary = {
  dueToday: { amount: number; vatAmount: number; label: string } | null;
  recurring: {
    label: string;
    amount: number;
    vatAmount: number;
    periodPhrase: string;
    frequency: string;
  } | null;
};

const TERMS_PANEL_STYLE = {
  backgroundImage: `url('${appPath('/images/pdf-page-background.jpg')}')`,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
} as const;

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
  const [proposal, setProposal] = useState<ProposalData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [engagementLetterAccepted, setEngagementLetterAccepted] = useState(false);
  const [paymentAuthAccepted, setPaymentAuthAccepted] = useState(false);
  const [signingStep, setSigningStep] = useState<SigningStep | null>(null);
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
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [paymentPending, setPaymentPending] = useState(false);
  const [qaExpanded, setQaExpanded] = useState(false);
  const [qaMessages, setQaMessages] = useState<QaMessage[]>([]);
  const [qaInput, setQaInput] = useState('');
  const [qaLoading, setQaLoading] = useState(false);
  const [signingSummary, setSigningSummary] = useState<string | null>(null);
  const [signingCostSummary, setSigningCostSummary] = useState<SigningCostSummary | null>(null);
  const [signingSummaryLoading, setSigningSummaryLoading] = useState(false);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);
  const [showPaymentStep, setShowPaymentStep] = useState(false);
  const [isSettingUpPayment, setIsSettingUpPayment] = useState(false);
  const qaEndRef = useRef<HTMLDivElement>(null);
  const [isMobileSign, setIsMobileSign] = useState(false);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [awaitingAdditionalSigner, setAwaitingAdditionalSigner] = useState(false);
  const [signingState, setSigningState] = useState<PublicSigningState | null>(null);
  const [faqExpanded, setFaqExpanded] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const update = () => setIsMobileSign(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') !== 'success' || !token) return;

    const verifyPaymentReturn = async () => {
      try {
        const response = (await apiClient.get(`/proposals/view/${token}/payment-status`)) as any;
        if (response.success && response.data?.paid) {
          setPaymentComplete(true);
          setShowPaymentStep(false);
          setPaymentPending(false);
          setPaymentConfig((prev) =>
            prev ? { ...prev, paymentStatus: 'COMPLETED', paymentRequired: false } : prev
          );
        }
      } catch {
        // Ignore — proposal load will show authoritative payment status
      } finally {
        params.delete('payment');
        const query = params.toString();
        const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}`;
        window.history.replaceState({}, '', nextUrl);
      }
    };

    void verifyPaymentReturn();
  }, [token]);

  useEffect(() => {
    const loadProposal = async () => {
      if (!token) return;
      try {
        setIsLoading(true);
        const response = (await apiClient.get(`/proposals/view/${token}`)) as any;
        if (response.success) {
          setProposal(response.data);
          if (response.data.signing) {
            setSigningState(response.data.signing);
            setAwaitingAdditionalSigner(Boolean(response.data.signing.awaitingAdditionalSigner));
          }
          if (response.data.customFields?.selectedTierId) {
            setSelectedTierId(response.data.customFields.selectedTierId);
          }
          setIsAccepted(response.data.status === 'ACCEPTED');
          setPaymentComplete(
            response.data.paymentStatus === 'COMPLETED' || response.data.paymentStatus === 'PAID'
          );
          const payment = response.data.payment as PaymentConfig | null | undefined;
          if (payment) {
            setPaymentConfig(payment);
            setPaymentPending(response.data.status === 'ACCEPTED' && payment.paymentRequired);
          } else {
            setPaymentPending(
              response.data.status === 'ACCEPTED' && response.data.paymentStatus === 'PENDING'
            );
          }
          if (response.data.client?.contactEmail) {
            setSignerEmail(response.data.client.contactEmail);
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
          if (response.data.costSummary) {
            setSigningCostSummary(response.data.costSummary);
          }
        }
      } catch {
        // Non-blocking — summary is helpful but not required to sign
      } finally {
        setSigningSummaryLoading(false);
      }
    };

    const expired = proposal ? new Date(proposal.validUntil) < new Date() : false;
    if (proposal && !isAccepted && !expired && signingStep && signingStep !== 'review') {
      loadSigningSummary();
    }
  }, [token, proposal, isAccepted, signingStep, signingSummary]);

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
        setQaMessages((prev) => [...prev, { role: 'assistant', content: response.data.answer }]);
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

  const startSigningFlow = () => {
    setShowDecline(false);
    setSigningStep('review');
  };

  const signingSteps = proposal ? buildSigningSteps(proposal) : [];

  const goToNextStep = () => {
    if (!signingStep || !proposal) return;
    const idx = signingSteps.findIndex((s) => s.id === signingStep);
    if (idx >= 0 && idx < signingSteps.length - 1) {
      setSigningStep(signingSteps[idx + 1].id);
    }
  };

  const goToPrevStep = () => {
    if (!signingStep || signingStep === 'review') {
      setSigningStep(null);
      return;
    }
    const idx = signingSteps.findIndex((s) => s.id === signingStep);
    if (idx > 0) setSigningStep(signingSteps[idx - 1].id);
  };

  const handleSignatureSave = (signature: string) => {
    setSignatureData(signature);
  };

  const handleSetupPayment = async () => {
    if (!token) return;
    if (!paymentAuthAccepted) {
      toast.error('Please accept the payment authorisation first');
      return;
    }
    setIsSettingUpPayment(true);
    try {
      const response = (await apiClient.post(`/proposals/view/${token}/payment/setup`, {
        preferredMethod: 'card',
        paymentAuthAccepted: true,
      })) as any;

      if (response.success) {
        const { checkoutUrl, provider } = response.data;

        if (provider === 'stripe' && checkoutUrl) {
          window.location.href = checkoutUrl;
          return;
        }

        toast.error('Payment checkout is not available right now');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to set up payment');
    } finally {
      setIsSettingUpPayment(false);
    }
  };

  const handleManageBilling = async () => {
    if (!token) return;
    try {
      const response = (await apiClient.post(`/proposals/view/${token}/billing-portal`, {})) as any;
      if (response.success && response.data?.url) {
        window.location.href = response.data.url;
        return;
      }
      toast.error('Billing portal is not available right now');
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to open billing portal');
    }
  };

  const handleSkipPayment = async () => {
    if (!token) return;
    try {
      await apiClient.post(`/proposals/view/${token}/payment/skip`, { acknowledged: true });
      setPaymentComplete(true);
      setPaymentPending(false);
      setSigningStep('confirmation');
      setPaymentConfig((prev) =>
        prev ? { ...prev, paymentStatus: 'SKIPPED', paymentRequired: false } : prev
      );
      toast('You can set up payment with your accountant later', { icon: 'ℹ️' });
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to skip payment setup');
    }
  };

  const handleSubmitSignature = async () => {
    const validationErrors = collectSignatureValidationErrors({
      signatureData,
      signerName,
      signerRole,
      signerEmail,
      authorisedToSign,
    });
    if (validationErrors.length > 0) {
      toast.error(validationErrors[0]);
      return;
    }

    setIsSubmitting(true);
    try {
      const isFirstSigner = !awaitingAdditionalSigner;
      const tierToSubmit = isFirstSigner && tiersEnabled ? lockedTierId || undefined : undefined;
      const hasEngagementLetter = Boolean(proposal?.engagementLetter?.trim());

      const response = (await apiClient.post(
        `/proposals/view/${token}/sign`,
        buildPublicSignPayload({
          signatureData,
          signerName,
          signerRole,
          signerEmail,
          authorisedToSign,
          termsAccepted,
          engagementLetterAccepted,
          hasEngagementLetter,
          clientName: proposal?.client?.name,
          deviceInfo: buildSignatureDeviceInfo(readBrowserDeviceInfo()),
          selectedTierId: tierToSubmit,
        })
      )) as any;

      if (response.success) {
        setIsAccepted(true);
        const payment = response.data?.payment as PaymentConfig | undefined;
        if (payment) {
          setPaymentConfig(payment);
        }

        if (response.data?.paymentRequired && payment?.paymentRequired) {
          setPaymentPending(true);
          setSigningStep('payment');
          toast.success('Proposal accepted — please complete payment');
        } else {
          setSigningStep('confirmation');
          toast.success('Proposal accepted successfully');
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
          <h2 className="mt-4 text-xl font-semibold text-slate-900 dark:text-white">
            Proposal Not Available
          </h2>
          <p className="mt-2 text-slate-700">{error}</p>
          <p className="mt-4 text-sm text-slate-600">
            Please contact the sender if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  if (!proposal) return null;

  const customFields: ProposalCustomFieldsView = proposal.customFields ?? {};
  const tiersEnabled = Boolean(
    customFields.offerThreePackages &&
    customFields.pricingTiers &&
    customFields.pricingTiers.length >= 2
  );
  const lockedTierId = customFields.selectedTierId ?? selectedTierId;
  const baseTotals = {
    subtotal: proposal.baseSubtotal ?? proposal.subtotal,
    vatAmount: proposal.baseVatAmount ?? proposal.vatAmount,
    total: proposal.baseTotal ?? proposal.total,
  };
  const selectedTierForTotals = lockedTierId
    ? findPricingTier(customFields, lockedTierId)
    : undefined;
  const displayTotals = selectedTierForTotals
    ? calculateTierTotals(baseTotals, selectedTierForTotals)
    : baseTotals;
  const activeTierId = isAccepted ? customFields.selectedTierId : lockedTierId;
  const activeTier = activeTierId
    ? (findPricingTier(customFields, activeTierId) ??
      customFields.pricingTiers?.find((t) => t.id === activeTierId))
    : undefined;

  const isExpired = new Date(proposal.validUntil) < new Date();
  const inSigningFlow =
    !!signingStep &&
    signingStep !== 'confirmation' &&
    (!isAccepted || signingStep === 'payment') &&
    !isExpired;
  const currentStepIndex = signingStep ? signingSteps.findIndex((s) => s.id === signingStep) : -1;

  const StepIndicator = () => (
    <div className="mb-6" data-testid="signing-step-indicator">
      <div className="flex items-center justify-between gap-1">
        {signingSteps.map((step, i) => {
          const active = currentStepIndex === i;
          const done = currentStepIndex > i;
          return (
            <div key={step.id} className="flex-1 flex flex-col items-center gap-1">
              <div
                className={`h-2 w-full rounded-full transition-colors ${
                  active
                    ? 'bg-primary-600'
                    : done
                      ? 'bg-emerald-500'
                      : 'bg-slate-200 dark:bg-slate-700'
                }`}
              />
              <span
                className={`text-[10px] sm:text-xs font-medium ${
                  active ? 'text-primary-700 dark:text-primary-300' : 'text-slate-500'
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-6 sm:py-8 px-4 sm:px-6 lg:px-8 pb-28 sm:pb-8 [padding-bottom:max(7rem,env(safe-area-inset-bottom))]">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white dark:bg-slate-800 rounded-t-xl shadow-sm p-6 border-b dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Proposal from</p>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                {proposal.tenant.name}
              </h1>
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
                      Your automated client onboarding journey has started. Expect a warm welcome
                      email shortly, followed by secure requests for ID/AML verification and next
                      steps.
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
                          <div className="font-medium text-emerald-800 dark:text-emerald-200">
                            {s.label}
                          </div>
                          <div className="text-emerald-600/70 dark:text-emerald-400/70">
                            {s.desc}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-[11px] text-emerald-600/80 dark:text-emerald-400/70">
                      All communications are automated and tailored. Your accountant can pause or
                      customise them at any time.
                    </p>

                    {paymentPending && !paymentComplete && paymentConfig?.paymentRequired && (
                      <div className="mt-4 space-y-3">
                        <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                          Payment still pending
                        </p>
                        <label className="flex items-start gap-2 text-sm text-emerald-800 dark:text-emerald-200">
                          <input
                            type="checkbox"
                            checked={paymentAuthAccepted}
                            onChange={(e) => setPaymentAuthAccepted(e.target.checked)}
                            className="mt-1 rounded"
                          />
                          <span>
                            I accept the{' '}
                            <Link to="/legal/client-payment-authorisation" className="underline">
                              Client Payment Authorisation
                            </Link>
                          </span>
                        </label>
                        <button
                          type="button"
                          data-testid="setup-stripe-payment"
                          onClick={handleSetupPayment}
                          disabled={isSettingUpPayment || !paymentAuthAccepted}
                          className="inline-flex items-center gap-2 rounded-xl border border-sky-300 bg-white px-4 py-2.5 text-sm font-medium text-sky-900 hover:bg-sky-50 disabled:opacity-50"
                        >
                          <CreditCardIcon className="h-5 w-5" />
                          {isSettingUpPayment ? 'Opening checkout…' : 'Pay now'}
                        </button>
                        <button
                          type="button"
                          onClick={handleSkipPayment}
                          className="block text-sm text-slate-600 underline"
                        >
                          Set up payment later
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>

              {paymentComplete && paymentConfig && paymentConfig.paymentStatus !== 'SKIPPED' && (
                <div
                  data-testid="payment-complete-banner"
                  className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 flex items-center gap-3 dark:border-emerald-800 dark:bg-emerald-950/30"
                >
                  <CheckCircleIcon className="h-5 w-5 text-emerald-600 shrink-0" />
                  <p className="text-sm text-emerald-800 dark:text-emerald-200 flex-1">
                    Payment received — thank you for completing your engagement fees.
                  </p>
                  {paymentConfig.billingPortalAvailable && (
                    <button
                      type="button"
                      onClick={handleManageBilling}
                      className="text-sm font-medium text-emerald-700 underline shrink-0 dark:text-emerald-300"
                    >
                      Manage billing
                    </button>
                  )}
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
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              {proposal.title}
            </h2>
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
                  proposal.client.contactName?.trim()
                    ? 'text-base text-slate-700'
                    : 'mt-1 text-lg font-medium text-slate-900 dark:text-white'
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
                  {[proposal.createdBy.firstName, proposal.createdBy.lastName]
                    .filter(Boolean)
                    .join(' ')}
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

          {(proposal.coverLetter || (proposal as { proposalSummary?: string }).proposalSummary) && (
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
                      <h4 className="font-medium text-slate-900 dark:text-slate-100">
                        {service.name}
                      </h4>
                      {service.isOptional && (
                        <span className="ml-2 px-2 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-full">
                          Optional
                        </span>
                      )}
                    </div>
                    {service.description && (
                      <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                        {service.description}
                      </p>
                    )}
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                      {service.quantity} x {formatCurrency(service.unitPrice)} /{' '}
                      {(service.billingFrequency || service.frequency)
                        .toLowerCase()
                        .replace(/_/g, ' ')}
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
            <div className="border-t pt-6" data-testid="additional-signatory-banner">
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
                  onClick={() => {
                    setShowDecline(false);
                    setSigningStep('identity');
                  }}
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

          {/* Signing step flow */}
          {signingStep === 'confirmation' && (
            <div className="border-t pt-6 space-y-4" data-testid="signing-flow">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-950/30">
                <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                  {paymentComplete || !paymentConfig?.paymentRequired
                    ? 'All done — thank you!'
                    : 'Proposal signed — payment still pending'}
                </p>
                <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-300">
                  Your accountant has been notified and your onboarding journey will begin shortly.
                </p>
              </div>
            </div>
          )}

          {inSigningFlow && (
            <div className="border-t pt-6 space-y-4" data-testid="signing-flow">
              <StepIndicator />

              {signingStep === 'review' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Review your proposal
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Total engagement value:{' '}
                    <strong className="text-slate-900 dark:text-white">
                      {formatCurrency(proposal.total)}
                    </strong>{' '}
                    · {proposal.services.length} service
                    {proposal.services.length !== 1 ? 's' : ''}
                  </p>
                  <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
                    {proposal.services.map((s) => (
                      <li key={s.id} className="flex justify-between gap-2">
                        <span>{s.name}</span>
                        <span className="font-medium">
                          {formatCurrency(s.lineTotal || s.total || 0)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <button type="button" className="btn-primary w-full py-3" onClick={goToNextStep}>
                    Continue to terms
                  </button>
                </div>
              )}

              {signingStep === 'terms' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Terms &amp; conditions
                  </h3>
                  <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg max-h-48 overflow-y-auto">
                    <pre className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-sans">
                      {proposal.terms || 'Standard terms and conditions apply.'}
                    </pre>
                  </div>
                  <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-200">
                    <input
                      data-testid="terms-checkbox"
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded"
                    />
                    <span>I have read and agree to the terms and conditions.</span>
                  </label>
                  <div className="flex gap-3">
                    <button type="button" className="btn-secondary flex-1" onClick={goToPrevStep}>
                      Back
                    </button>
                    <button
                      type="button"
                      className="btn-primary flex-1"
                      disabled={!termsAccepted}
                      onClick={goToNextStep}
                    >
                      Continue
                    </button>
                  </div>
                </div>
              )}

              {signingStep === 'engagement' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Engagement letter
                  </h3>
                  <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg max-h-64 overflow-y-auto">
                    <pre className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-sans">
                      {proposal.engagementLetter || 'No engagement letter attached.'}
                    </pre>
                  </div>
                  <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-200">
                    <input
                      data-testid="engagement-letter-checkbox"
                      type="checkbox"
                      checked={engagementLetterAccepted}
                      onChange={(e) => setEngagementLetterAccepted(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded"
                    />
                    <span>I have read and accept the engagement letter.</span>
                  </label>
                  <div className="flex gap-3">
                    <button type="button" className="btn-secondary flex-1" onClick={goToPrevStep}>
                      Back
                    </button>
                    <button
                      type="button"
                      className="btn-primary flex-1"
                      disabled={!engagementLetterAccepted}
                      onClick={goToNextStep}
                    >
                      Continue
                    </button>
                  </div>
                </div>
              )}

              {signingStep === 'identity' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Confirm your identity
                  </h3>
                  {signingSummary && (
                    <p className="text-sm text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3">
                      {signingSummary}
                    </p>
                  )}
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-800">Full name</label>
                      <input
                        data-testid="signer-name-input"
                        type="text"
                        value={signerName}
                        onChange={(e) => setSignerName(e.target.value)}
                        placeholder="John Smith"
                        className="mt-1 input-field w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-800">
                        Role / title
                      </label>
                      <input
                        data-testid="signer-role-input"
                        type="text"
                        value={signerRole}
                        onChange={(e) => setSignerRole(e.target.value)}
                        placeholder="Director"
                        className="mt-1 input-field w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-800">
                        Email address
                      </label>
                      <input
                        data-testid="signer-email-input"
                        type="email"
                        value={signerEmail}
                        onChange={(e) => setSignerEmail(e.target.value)}
                        placeholder="director@company.co.uk"
                        className="mt-1 input-field w-full"
                      />
                    </div>
                  </div>
                  <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-200">
                    <input
                      data-testid="authorised-checkbox"
                      type="checkbox"
                      checked={authorisedToSign}
                      onChange={(e) => setAuthorisedToSign(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded"
                    />
                    <span>
                      I confirm I am authorised to sign on behalf of{' '}
                      <strong>{proposal.client.name}</strong>.
                    </span>
                  </label>
                  <div className="flex gap-3">
                    <button type="button" className="btn-secondary flex-1" onClick={goToPrevStep}>
                      Back
                    </button>
                    <button
                      type="button"
                      className="btn-primary flex-1"
                      disabled={!signerName || !signerRole || !signerEmail || !authorisedToSign}
                      onClick={goToNextStep}
                    >
                      Continue to sign
                    </button>
                  </div>
                </div>
              )}

              {signingStep === 'sign' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Add your signature
                  </h3>
                  <SignaturePad onSave={handleSignatureSave} fullWidth height={220} />
                  {signatureData && (
                    <div className="flex gap-3">
                      <button type="button" className="btn-secondary flex-1" onClick={goToPrevStep}>
                        Back
                      </button>
                      <button
                        data-testid="confirm-signature-button"
                        type="button"
                        className="btn-primary flex-1 py-3"
                        disabled={isSubmitting}
                        onClick={handleSubmitSignature}
                      >
                        {isSubmitting ? 'Submitting…' : 'Confirm acceptance'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {signingStep === 'payment' && paymentConfig?.paymentRequired && (
                <div className="space-y-4" data-testid="payment-step">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Complete your payment
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Pay {formatCurrency(proposal.total)} to confirm your engagement with{' '}
                    {proposal.tenant.name}.
                  </p>
                  {paymentConfig.feePreview && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Payment is processed securely by Stripe. Your accountant receives the agreed
                      fee after platform and processing costs.
                    </p>
                  )}
                  <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-200">
                    <input
                      data-testid="payment-auth-checkbox"
                      type="checkbox"
                      checked={paymentAuthAccepted}
                      onChange={(e) => setPaymentAuthAccepted(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded"
                    />
                    <span>
                      I authorise payment as described in the{' '}
                      <Link
                        to="/legal/client-payment-authorisation"
                        target="_blank"
                        className="text-primary-600 hover:underline"
                      >
                        Client Payment Authorisation
                      </Link>
                      .
                    </span>
                  </label>
                  <button
                    type="button"
                    data-testid="setup-stripe-payment"
                    onClick={handleSetupPayment}
                    disabled={isSettingUpPayment || !paymentAuthAccepted}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-sky-300 bg-white px-4 py-3 text-sm font-medium text-sky-900 hover:bg-sky-50 disabled:opacity-50 dark:bg-slate-800 dark:border-sky-700 dark:text-sky-100"
                  >
                    <CreditCardIcon className="h-5 w-5" />
                    {isSettingUpPayment ? 'Opening secure checkout…' : 'Pay securely with Stripe'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSkipPayment}
                    className="w-full text-sm text-slate-600 hover:text-slate-800 dark:text-slate-400 underline"
                  >
                    Set up payment later
                  </button>
                </div>
              )}

              {signingStep !== 'payment' && (
                <button
                  type="button"
                  data-testid="decline-proposal-button"
                  className="w-full text-sm text-slate-500 hover:text-red-600 underline"
                  onClick={() => {
                    setSigningStep(null);
                    setShowDecline(true);
                  }}
                >
                  Decline this proposal
                </button>
              )}
            </div>
          )}

          {/* Terms & Conditions — browse mode (not in step flow) */}
          {!isAccepted && !isExpired && !inSigningFlow && (
            <div className="border-t pt-6">
              <h3 className="text-sm font-medium text-slate-600 uppercase tracking-wide">
                Terms & Conditions
              </h3>
              <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-600 max-h-72 overflow-y-auto">
                <div className="relative min-h-[12rem]" style={TERMS_PANEL_STYLE}>
                  <div className="relative z-10 m-0 rounded-lg bg-white dark:bg-slate-900 p-4 shadow-sm">
                    <div
                      data-testid="proposal-terms-body"
                      className="text-sm leading-relaxed whitespace-pre-wrap font-sans text-slate-900 dark:text-slate-100"
                    >
                      {stripMarkdownHeadings(
                        proposal.terms || 'Standard terms and conditions apply.'
                      )}
                    </div>
                  </div>
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
                <label htmlFor="terms" className="ml-2 text-sm text-slate-800 dark:text-slate-100">
                  I have read and agree to the terms and conditions outlined above.
                </label>
              </div>
            </div>
          )}

          {/* Signing summary — browse mode helper */}
          {!isAccepted && !isExpired && !inSigningFlow && termsAccepted && (
            <div data-testid="signing-summary-card" className="border-t pt-6">
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
                      <>
                        <p className="mt-2 text-sm text-slate-800 dark:text-slate-100 leading-relaxed">
                          {signingSummary}
                        </p>
                        {signingCostSummary &&
                          (signingCostSummary.dueToday || signingCostSummary.recurring) && (
                            <ul className="mt-4 space-y-2 text-sm border-t border-slate-200 dark:border-slate-600 pt-3">
                              {signingCostSummary.dueToday && (
                                <li className="flex justify-between gap-4 text-slate-800 dark:text-slate-100">
                                  <span className="font-medium">Due today</span>
                                  <span className="tabular-nums text-right">
                                    {formatCurrency(signingCostSummary.dueToday.amount)}
                                    <span className="block text-xs font-normal text-slate-600 dark:text-slate-400">
                                      inc. VAT
                                    </span>
                                  </span>
                                </li>
                              )}
                              {signingCostSummary.recurring && (
                                <li className="flex justify-between gap-4 text-slate-800 dark:text-slate-100">
                                  <span className="font-medium">
                                    {signingCostSummary.recurring.label}
                                  </span>
                                  <span className="tabular-nums text-right">
                                    {formatCurrency(signingCostSummary.recurring.amount)}
                                    <span className="block text-xs font-normal text-slate-600 dark:text-slate-400">
                                      {signingCostSummary.recurring.periodPhrase} · inc. VAT
                                    </span>
                                  </span>
                                </li>
                              )}
                            </ul>
                          )}
                      </>
                    ) : signingCostSummary &&
                      (signingCostSummary.dueToday || signingCostSummary.recurring) ? (
                      <ul className="mt-2 space-y-2 text-sm">
                        {signingCostSummary.dueToday && (
                          <li className="text-slate-800 dark:text-slate-100">
                            <span className="font-medium">Due today: </span>
                            {formatCurrency(signingCostSummary.dueToday.amount)} (inc. VAT)
                          </li>
                        )}
                        {signingCostSummary.recurring && (
                          <li className="text-slate-800 dark:text-slate-100">
                            <span className="font-medium">
                              {signingCostSummary.recurring.label}:{' '}
                            </span>
                            {formatCurrency(signingCostSummary.recurring.amount)}{' '}
                            {signingCostSummary.recurring.periodPhrase} (inc. VAT)
                          </li>
                        )}
                      </ul>
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

          {/* Actions — browse mode */}
          {!isAccepted && !isExpired && !inSigningFlow && !showDecline && (
            <div className="border-t pt-6 flex flex-col sm:flex-row gap-3">
              <button
                data-testid="accept-proposal-button"
                onClick={startSigningFlow}
                className="flex-1 btn-primary py-3"
              >
                Review &amp; sign proposal
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
                <h3 className="text-lg font-medium text-slate-900 dark:text-white">
                  Decline proposal
                </h3>
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
                      toast.success('Proposal declined — the practice has been notified');
                      setShowDecline(false);
                      setSigningStep(null);
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
        </div>

        {/* Mobile sticky accept bar */}
        {!isAccepted && !isExpired && !inSigningFlow && !showDecline && (
          <div className="fixed bottom-0 left-0 right-0 z-40 p-4 bg-white/95 dark:bg-slate-900/95 border-t border-slate-200 dark:border-slate-700 backdrop-blur-md sm:hidden">
            <button
              type="button"
              onClick={startSigningFlow}
              className="btn-primary w-full py-3 text-base"
            >
              Review &amp; sign proposal
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicProposalView;
