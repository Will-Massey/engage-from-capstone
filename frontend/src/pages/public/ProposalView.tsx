import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
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
} from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';
import { AI_COPILOT } from '../../config/aiCopilot';
import { openRevolutCheckout } from '../../lib/revolut-checkout';

interface ProposalData {
  id: string;
  reference: string;
  title: string;
  status: string;
  validUntil: string;
  subtotal: number;
  vatAmount: number;
  total: number;
  paymentTerms: string;
  coverLetter?: string;
  terms?: string;
  engagementLetter?: string;
  client: {
    name: string;
    companyType: string;
    contactEmail?: string;
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
type SigningStep = 'review' | 'terms' | 'identity' | 'sign' | 'confirmation';

const SIGNING_STEPS: { id: SigningStep; label: string }[] = [
  { id: 'review', label: 'Review' },
  { id: 'terms', label: 'Terms' },
  { id: 'identity', label: 'Identity' },
  { id: 'sign', label: 'Sign' },
  { id: 'confirmation', label: 'Done' },
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
  const [signingStep, setSigningStep] = useState<SigningStep | null>(null);
  const [signatureData, setSignatureData] = useState<string>('');
  const [signerName, setSignerName] = useState('');
  const [signerRole, setSignerRole] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [authorisedToSign, setAuthorisedToSign] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [showDecline, setShowDecline] = useState(false);
  const [isAccepted, setIsAccepted] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [paymentPending, setPaymentPending] = useState(false);
  const [qaExpanded, setQaExpanded] = useState(false);
  const [qaMessages, setQaMessages] = useState<QaMessage[]>([]);
  const [qaInput, setQaInput] = useState('');
  const [qaLoading, setQaLoading] = useState(false);
  const [signingSummary, setSigningSummary] = useState<string | null>(null);
  const [signingSummaryLoading, setSigningSummaryLoading] = useState(false);
  const qaEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      setPaymentComplete(true);
    }
  }, []);

  useEffect(() => {
    const loadProposal = async () => {
      if (!token) return;
      try {
        setIsLoading(true);
        const response = (await apiClient.get(`/proposals/view/${token}`)) as any;
        if (response.success) {
          setProposal(response.data);
          setIsAccepted(response.data.status === 'ACCEPTED');
          setPaymentComplete(response.data.paymentStatus === 'COMPLETED');
          setPaymentPending(
            response.data.status === 'ACCEPTED' &&
              response.data.paymentStatus === 'PENDING',
          );
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

  const startSigningFlow = () => {
    setShowDecline(false);
    setSigningStep('review');
  };

  const goToNextStep = () => {
    if (!signingStep) return;
    const idx = SIGNING_STEPS.findIndex((s) => s.id === signingStep);
    if (idx < SIGNING_STEPS.length - 2) {
      setSigningStep(SIGNING_STEPS[idx + 1].id);
    }
  };

  const goToPrevStep = () => {
    if (!signingStep || signingStep === 'review') {
      setSigningStep(null);
      return;
    }
    const idx = SIGNING_STEPS.findIndex((s) => s.id === signingStep);
    if (idx > 0) setSigningStep(SIGNING_STEPS[idx - 1].id);
  };

  const handleSignatureSave = (signature: string) => {
    setSignatureData(signature);
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

      const response = (await apiClient.post(`/proposals/view/${token}/sign`, {
        signedBy: signerName,
        signedByRole: signerRole,
        signerEmail,
        signatureData,
        agreementAccepted: termsAccepted,
        authorisedToSign,
        deviceInfo,
        consentText,
      })) as any;

      if (response.success) {
        setIsAccepted(true);
        setSigningStep('confirmation');

        const checkout = response.data?.checkout;
        if (checkout?.token) {
          setPaymentPending(true);
          toast.success('Proposal accepted — complete payment to confirm');
          await openRevolutCheckout({
            token: checkout.token,
            mode: checkout.mode || 'sandbox',
            onSuccess: () => {
              setPaymentComplete(true);
              setPaymentPending(false);
              toast.success('Payment received — thank you');
            },
            onError: (message) => toast.error(message),
            onCancel: () =>
              toast('Payment cancelled — you can pay from the link in your confirmation email'),
          });
        } else {
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
  const inSigningFlow = !!signingStep && !isAccepted && !isExpired;
  const currentStepIndex = signingStep
    ? SIGNING_STEPS.findIndex((s) => s.id === signingStep)
    : -1;

  const StepIndicator = () => (
    <div className="mb-6" data-testid="signing-step-indicator">
      <div className="flex items-center justify-between gap-1">
        {SIGNING_STEPS.slice(0, 4).map((step, i) => {
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-8 px-4 sm:px-6 lg:px-8">
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
        <div className="bg-white dark:bg-slate-800 shadow-sm p-6 space-y-8">
          {/* Status Banner - Enhanced with lifecycle journey tie-in */}
          {isAccepted ? (
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
                    {paymentPending && !paymentComplete
                      ? 'Proposal accepted — payment pending'
                      : 'Thank you — Proposal accepted!'}
                  </p>
                  <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
                    {paymentPending && !paymentComplete
                      ? `Please complete your payment of ${formatCurrency(proposal.total)} to confirm your engagement.`
                      : 'Your automated client onboarding journey has started. Expect a warm welcome email shortly, followed by secure requests for ID/AML verification and next steps.'}
                  </p>

                  {/* Mini journey steps tied to touchpoint automation */}
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    {[
                      { label: 'Welcome', desc: 'Email sent' },
                      { label: 'AML / ID', desc: 'Verification' },
                      { label: 'Engagement', desc: 'Letter & sign' },
                      { label: 'Onboarding', desc: 'Setup & kickoff' },
                    ].map((s, i) => (
                      <div key={i} className="rounded-xl border border-emerald-100 bg-white/70 px-3 py-2 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                        <div className="font-medium text-emerald-800 dark:text-emerald-200">{s.label}</div>
                        <div className="text-emerald-600/70 dark:text-emerald-400/70">{s.desc}</div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] text-emerald-600/80 dark:text-emerald-400/70">
                    All communications are automated and tailored. Your accountant can pause or customise them at any time.
                  </p>
                </div>
              </div>
            </motion.div>
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
          <div className="border-t pt-6">
            <h3 className="text-sm font-medium text-slate-600 uppercase tracking-wide">
              Prepared For
            </h3>
            <p className="mt-1 text-lg font-medium text-slate-900 dark:text-white">{proposal.client.name}</p>
            <p className="text-sm text-slate-600 capitalize">
              {proposal.client.companyType.replace(/_/g, ' ')}
            </p>
          </div>

          {/* Cover Letter */}
          {proposal.coverLetter && (
            <div className="border-t pt-6">
              <h3 className="text-sm font-medium text-slate-600 uppercase tracking-wide">
                Cover Letter
              </h3>
              <div className="mt-2 prose prose-sm max-w-none text-slate-800">
                {proposal.coverLetter.split('\n').map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
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
                  className="flex justify-between items-start p-4 bg-slate-50 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center">
                      <h4 className="font-medium text-slate-900">{service.name}</h4>
                      {service.isOptional && (
                        <span className="ml-2 px-2 py-0.5 text-xs bg-slate-200 text-slate-700 rounded-full">
                          Optional
                        </span>
                      )}
                    </div>
                    {service.description && (
                      <p className="text-sm text-slate-600 mt-1">{service.description}</p>
                    )}
                    <p className="text-sm text-slate-600 mt-1">
                      {service.quantity} x {formatCurrency(service.unitPrice)} /{' '}
                      {(service.billingFrequency || service.frequency).toLowerCase().replace(/_/g, ' ')}
                    </p>
                    {(service.billingFrequency || service.frequency) === 'ONE_TIME' &&
                      service.oneOffDueDate && (
                        <p className="text-sm text-slate-700 mt-1">
                          Due: {formatDate(service.oneOffDueDate)}
                        </p>
                      )}
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-slate-900">{formatCurrency(service.lineTotal || service.total || 0)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pricing Summary */}
          <div className="border-t pt-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-700">Subtotal</span>
                <span className="font-medium">{formatCurrency(proposal.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-700">VAT</span>
                <span className="font-medium">{formatCurrency(proposal.vatAmount)}</span>
              </div>
              <div className="flex justify-between text-lg font-semibold pt-2 border-t">
                <span className="text-slate-900">Total</span>
                <span className="text-slate-900">{formatCurrency(proposal.total)}</span>
              </div>
            </div>
            <p className="text-sm text-slate-600 mt-2">Payment terms: {proposal.paymentTerms}</p>
          </div>

          {/* Questions about this proposal — Clara-style Q&A */}
          {!isAccepted && !isExpired && (
            <div className="border-t pt-6">
              <button
                type="button"
                data-testid="qa-toggle"
                onClick={() => setQaExpanded((v) => !v)}
                className="w-full flex items-center justify-between gap-3 text-left group"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/40">
                    <SparklesIcon className="h-4 w-4 text-violet-600 dark:text-violet-300" />
                  </span>
                  <div>
                    <h3 className="text-sm font-medium text-slate-900 dark:text-white">
                      Questions about this proposal?
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Ask {AI_COPILOT.name} — answers come only from this proposal
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
                        <span className="font-medium">{formatCurrency(s.lineTotal || s.total || 0)}</span>
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
                      <label className="block text-sm font-medium text-slate-800">Role / title</label>
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
                      <label className="block text-sm font-medium text-slate-800">Email address</label>
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
            </div>
          )}

          {/* Terms & Conditions — browse mode (not in step flow) */}
          {!isAccepted && !isExpired && !inSigningFlow && (
            <div className="border-t pt-6">
              <h3 className="text-sm font-medium text-slate-600 uppercase tracking-wide">
                Terms & Conditions
              </h3>
              <div className="mt-4 p-4 bg-slate-50 rounded-lg max-h-60 overflow-y-auto">
                <pre className="text-sm text-slate-800 whitespace-pre-wrap font-sans">
                  {proposal.terms || 'Standard terms and conditions apply.'}
                </pre>
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
                <label htmlFor="terms" className="ml-2 text-sm text-slate-800">
                  I have read and agree to the terms and conditions outlined above.
                </label>
              </div>
            </div>
          )}

          {/* Signing summary — browse mode helper */}
          {!isAccepted && !isExpired && !inSigningFlow && termsAccepted && (
            <div
              data-testid="signing-summary-card"
              className="border-t pt-6"
            >
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-950/20 p-5">
                <div className="flex items-start gap-3">
                  <DocumentTextIcon className="h-6 w-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                      What you are agreeing to
                    </h3>
                    {signingSummaryLoading ? (
                      <div className="mt-3 space-y-2 animate-pulse">
                        <div className="h-3 bg-emerald-200/60 dark:bg-emerald-900/40 rounded w-full" />
                        <div className="h-3 bg-emerald-200/60 dark:bg-emerald-900/40 rounded w-5/6" />
                        <div className="h-3 bg-emerald-200/60 dark:bg-emerald-900/40 rounded w-4/6" />
                      </div>
                    ) : signingSummary ? (
                      <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-100/90 leading-relaxed">
                        {signingSummary}
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-100/90 leading-relaxed">
                        By signing, you confirm you are authorised to accept this proposal on behalf
                        of {proposal.client.name}, agree to the services and fees shown above, and
                        accept the terms and conditions.
                      </p>
                    )}
                    <p className="mt-3 text-xs text-emerald-700/80 dark:text-emerald-400/70">
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
            <div className="border-t pt-6 space-y-3">
              <h3 className="text-lg font-medium text-slate-900 dark:text-white">Decline proposal</h3>
              <textarea
                data-testid="decline-reason-input"
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                rows={3}
                className="input-field w-full"
                placeholder="Please let us know why you are declining…"
              />
              <div className="flex gap-3">
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowDecline(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="confirm-decline-button"
                  disabled={isDeclining || declineReason.trim().length < 3}
                  className="btn-primary flex-1"
                  onClick={async () => {
                    setIsDeclining(true);
                    try {
                      await apiClient.post(`/proposals/view/${token}/decline`, {
                        reason: declineReason.trim(),
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
