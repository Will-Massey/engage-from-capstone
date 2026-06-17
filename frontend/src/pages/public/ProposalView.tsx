import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../../utils/api';
import { formatCurrency, formatDate } from '../../utils/formatters';
import toast from 'react-hot-toast';
import SignaturePad from '../../components/signature/SignaturePad';
import {
  DocumentTextIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon,
  SparklesIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';

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
  const [declineReason, setDeclineReason] = useState('');
  const [showDecline, setShowDecline] = useState(false);
  const [isAccepted, setIsAccepted] = useState(false);

  useEffect(() => {
    const loadProposal = async () => {
      if (!token) return;
      try {
        setIsLoading(true);
        const response = (await apiClient.get(`/proposals/view/${token}`)) as any;
        if (response.success) {
          setProposal(response.data);
          setIsAccepted(response.data.status === 'ACCEPTED');
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

  const handleAccept = async () => {
    if (!termsAccepted) {
      toast.error('Please accept the terms and conditions');
      return;
    }
    setShowSignature(true);
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
        toast.success('Proposal accepted successfully');
        setIsAccepted(true);
        setShowSignature(false);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to submit signature');
    } finally {
      setIsSubmitting(false);
    }
  };



  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <ExclamationCircleIcon className="mx-auto h-16 w-16 text-red-500" />
          <h2 className="mt-4 text-xl font-semibold text-slate-900">Proposal Not Available</h2>
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
                  <p className="font-semibold text-emerald-900 dark:text-emerald-200 text-lg">Thank you — Proposal accepted!</p>
                  <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
                    Your automated client onboarding journey has started. Expect a warm welcome email shortly, followed by secure requests for ID/AML verification and next steps.
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
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center">
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
            <h2 className="text-xl font-semibold text-slate-900">{proposal.title}</h2>
            <p className="text-sm text-slate-600 mt-1">Reference: {proposal.reference}</p>
            <p className="text-sm text-slate-600">Valid until: {formatDate(proposal.validUntil)}</p>
          </div>

          {/* Client */}
          <div className="border-t pt-6">
            <h3 className="text-sm font-medium text-slate-600 uppercase tracking-wide">
              Prepared For
            </h3>
            <p className="mt-1 text-lg font-medium text-slate-900">{proposal.client.name}</p>
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

          {/* Terms & Conditions */}
          {!isAccepted && !isExpired && (
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

          {/* Actions */}
          {!isAccepted && !isExpired && !showSignature && !showDecline && (
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
            <div className="border-t pt-6 space-y-3">
              <h3 className="text-lg font-medium text-slate-900">Decline proposal</h3>
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
                      toast.success('Proposal declined');
                      setShowDecline(false);
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
              <h3 className="text-lg font-medium text-slate-900 mb-4">Electronic Signature</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-800">Full Name</label>
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
                    <label className="block text-sm font-medium text-slate-800">Role/Title</label>
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
                    <label className="block text-sm font-medium text-slate-800">Email address</label>
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
                <label className="flex items-start gap-2 text-sm text-slate-800">
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
                <SignaturePad onSave={handleSignatureSave} />
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
                      {isSubmitting ? 'Submitting...' : 'Confirm Acceptance'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default PublicProposalView;
