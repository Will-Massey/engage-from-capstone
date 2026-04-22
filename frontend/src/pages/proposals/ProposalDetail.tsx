import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeftIcon,
  PencilIcon,
  EnvelopeIcon,
  CheckIcon,
  XMarkIcon,
  ArrowDownTrayIcon,
  PrinterIcon,
  DocumentTextIcon,
  ClockIcon,
  CalendarIcon,
  UserIcon,
  BuildingOfficeIcon,
  LinkIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { formatCurrency } from '../../utils/formatters';
import { copyTextToClipboard } from '../../utils/clipboard';
import { useAuthStore } from '../../stores/authStore';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { generateTermsAndConditions } from '../../data/defaultTerms';
import { generateDefaultCoverLetter } from '../../data/defaultCoverLetter';
import SignaturePad from '../../components/SignaturePad';
import SkeletonProposalDetail from '../../components/skeleton/SkeletonProposalDetail';

const statusConfig: Record<string, { color: string; bg: string; icon: any; label: string }> = {
  DRAFT: {
    color: 'text-slate-700 dark:text-slate-200',
    bg: 'bg-slate-100 dark:bg-slate-800',
    icon: PencilIcon,
    label: 'Draft',
  },
  SENT: {
    color: 'text-blue-700 dark:text-blue-200',
    bg: 'bg-blue-100 dark:bg-blue-900/40',
    icon: EnvelopeIcon,
    label: 'Sent',
  },
  VIEWED: {
    color: 'text-purple-700 dark:text-purple-200',
    bg: 'bg-purple-100 dark:bg-purple-900/40',
    icon: ClockIcon,
    label: 'Viewed',
  },
  ACCEPTED: {
    color: 'text-green-700 dark:text-green-200',
    bg: 'bg-green-100 dark:bg-green-900/40',
    icon: CheckIcon,
    label: 'Signed',
  },
  DECLINED: {
    color: 'text-red-700 dark:text-red-200',
    bg: 'bg-red-100 dark:bg-red-900/40',
    icon: XMarkIcon,
    label: 'Declined',
  },
  EXPIRED: {
    color: 'text-slate-700 dark:text-slate-200',
    bg: 'bg-slate-100 dark:bg-slate-800',
    icon: ClockIcon,
    label: 'Expired',
  },
};

const frequencyLabels: Record<string, string> = {
  ONE_TIME: 'One-time',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  ANNUALLY: 'Annually',
};

const ProposalDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { tenant } = useAuthStore();
  const [proposal, setProposal] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signatoryName, setSignatoryName] = useState('');
  const [signatoryPosition, setSignatoryPosition] = useState('');
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [copyingLink, setCopyingLink] = useState(false);
  const [coverLetterDraft, setCoverLetterDraft] = useState('');
  const [editingCoverLetter, setEditingCoverLetter] = useState(false);
  const [savingCoverLetter, setSavingCoverLetter] = useState(false);

  useEffect(() => {
    if (id) {
      loadProposal();
      loadCompanySettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (proposal && !editingCoverLetter) {
      setCoverLetterDraft(proposal.coverLetter || '');
    }
  }, [proposal?.id, proposal?.coverLetter, editingCoverLetter]);

  const loadCompanySettings = async () => {
    try {
      const response = (await apiClient.getTenantSettings()) as any;
      if (response.success) {
        setCompanySettings(response.data);
      }
    } catch (error) {
      // Error handled by UI
    }
  };

  const handleSignature = async (signature: string) => {
    setSignatureData(signature);
    try {
      await apiClient.acceptProposal(id!, {
        signature,
        acceptedBy: signatoryName,
        signatoryPosition,
        acceptedAt: new Date().toISOString(),
      });
      toast.success('Proposal accepted with electronic signature');
      setShowSignaturePad(false);
      loadProposal();
    } catch (error) {
      toast.error('Failed to submit signature');
    }
  };

  const generateFullTerms = () => {
    if (!companySettings) return proposal?.terms || '';

    const companyDetails = {
      name: companySettings.branding?.name || tenant?.name || '[Company Name]',
      companyNumber: companySettings.companyRegistration || '[Company Number]',
      address: companySettings.address?.line1
        ? `${companySettings.address.line1}, ${companySettings.address.city}, ${companySettings.address.postcode}`
        : '[Registered Office Address]',
      professionalBody: companySettings.professionalBody || '[Professional Body]',
      insurerName: companySettings.insurerName || '[Insurer Name]',
      governingLaw: companySettings.governingLaw || 'England and Wales',
      fcaAuthorised: companySettings.fcaAuthorised || false,
    };

    return generateTermsAndConditions(companyDetails);
  };

  const handlePrint = () => {
    window.print();
  };

  const loadProposal = async () => {
    try {
      setIsLoading(true);
      const response = (await apiClient.getProposal(id!)) as any;
      setProposal(response.data);
    } catch (error) {
      // Error handled by UI
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    try {
      await apiClient.sendProposal(id!);
      toast.success('Proposal sent successfully');
      loadProposal();
    } catch (error) {
      // Error handled by API interceptor
    }
  };

  const handleAccept = async () => {
    try {
      await apiClient.acceptProposal(id!);
      toast.success('Proposal marked as accepted');
      loadProposal();
    } catch (error) {
      // Error handled by API interceptor
    }
  };

  const downloadPDF = async () => {
    try {
      const blob = await apiClient.downloadProposalPDF(id!);
      if (!blob || blob.size === 0) {
        toast.error('Could not download PDF (empty file). Please try again.');
        return;
      }
      if (
        blob.type &&
        (blob.type.includes('json') ||
          blob.type.startsWith('text/') ||
          blob.type === 'application/problem+json')
      ) {
        toast.error('Could not download PDF. Please sign in again or try later.');
        return;
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `proposal-${proposal.reference}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('PDF download started');
    } catch {
      toast.error('Could not download PDF.');
    }
  };

  const handleCopyClientLink = async () => {
    if (!id || !proposal) return;
    try {
      if (proposal.shareToken) {
        const link = `${window.location.origin}/proposals/view/${proposal.shareToken}`;
        const ok = await copyTextToClipboard(link);
        if (ok) {
          toast.success('Client link copied to clipboard');
        } else {
          toast.error('Could not copy automatically. Copy this link manually: ' + link, {
            duration: 8000,
          });
        }
        return;
      }
      setCopyingLink(true);
      const response = (await apiClient.post(`/proposals/${id}/share`, {
        expiryDays: 30,
      })) as any;
      if (response.success && response.data?.shareUrl) {
        const ok = await copyTextToClipboard(response.data.shareUrl);
        if (ok) {
          toast.success('Client link copied to clipboard');
        } else {
          toast.error(
            'Link created but not copied. Copy manually: ' + response.data.shareUrl,
            { duration: 10000 }
          );
        }
        loadProposal();
      } else {
        toast.error('Failed to generate share link');
      }
    } catch {
      toast.error('Failed to copy client link');
    } finally {
      setCopyingLink(false);
    }
  };

  const handleSaveCoverLetter = async () => {
    if (!id) return;
    try {
      setSavingCoverLetter(true);
      const res = (await apiClient.updateProposal(id, { coverLetter: coverLetterDraft })) as any;
      if (res?.success === false) {
        toast.error(res?.error?.message || 'Could not save cover letter');
        return;
      }
      toast.success('Cover letter saved');
      setEditingCoverLetter(false);
      loadProposal();
    } catch {
      toast.error('Could not save cover letter');
    } finally {
      setSavingCoverLetter(false);
    }
  };

  const handleInsertDefaultCoverLetter = () => {
    if (!proposal) return;
    setCoverLetterDraft(
      generateDefaultCoverLetter({
        addresseeName: (proposal.client?.contactName?.trim() || proposal.client?.name || 'Client').trim(),
        practiceName: tenant?.name || 'Our practice',
        clientBusinessName: proposal.client?.name || undefined,
      })
    );
  };

  // Group services by billing frequency
  const groupedServices = useMemo(() => {
    if (!proposal?.services) return {};

    return proposal.services.reduce((acc: any, service: any) => {
      const freq = service.billingFrequency || service.frequency || 'MONTHLY';
      if (!acc[freq]) acc[freq] = [];
      acc[freq].push(service);
      return acc;
    }, {});
  }, [proposal]);

  // Calculate totals per frequency group
  const groupTotals = useMemo(() => {
    if (!proposal?.services) return {};

    return Object.entries(groupedServices).reduce((acc: any, [freq, services]: [string, any]) => {
      acc[freq] = {
        subtotal: services.reduce((sum: number, s: any) => sum + (s.lineTotal || s.total || 0), 0),
        vatAmount: services.reduce((sum: number, s: any) => sum + (s.vatAmount || 0), 0),
        total: services.reduce((sum: number, s: any) => sum + (s.grossTotal || s.total || 0), 0),
      };
      return acc;
    }, {});
  }, [groupedServices, proposal]);

  // Calculate monthly equivalent and one-off totals cleanly
  const pricingBreakdown = useMemo(() => {
    if (!proposal?.services) {
      return { monthlyExVat: 0, monthlyVat: 0, monthlyIncVat: 0, oneOffExVat: 0, oneOffVat: 0, oneOffIncVat: 0 };
    }

    return proposal.services.reduce(
      (acc: any, s: any) => {
        const freq = s.billingFrequency || s.frequency || 'MONTHLY';
        const lineTotal = s.lineTotal || s.total || 0; // ex VAT
        const vatAmt = s.vatAmount || 0;
        const gross = s.grossTotal || lineTotal + vatAmt;

        if (freq === 'ONE_TIME') {
          acc.oneOffExVat += lineTotal;
          acc.oneOffVat += vatAmt;
          acc.oneOffIncVat += gross;
        } else {
          // Convert to monthly equivalent
          let monthlyFactor = 1;
          if (freq === 'WEEKLY') monthlyFactor = 52 / 12;
          else if (freq === 'QUARTERLY') monthlyFactor = 1 / 3;
          else if (freq === 'ANNUALLY') monthlyFactor = 1 / 12;

          acc.monthlyExVat += lineTotal * monthlyFactor;
          acc.monthlyVat += vatAmt * monthlyFactor;
          acc.monthlyIncVat += gross * monthlyFactor;
        }
        return acc;
      },
      { monthlyExVat: 0, monthlyVat: 0, monthlyIncVat: 0, oneOffExVat: 0, oneOffVat: 0, oneOffIncVat: 0 }
    );
  }, [proposal]);

  // Check if any service has different VAT rate than default
  const hasMixedVatRates = useMemo(() => {
    if (!proposal?.services) return false;
    const defaultVat = proposal.vatRate || 20;
    return proposal.services.some((s: any) => (s.vatRate || 20) !== defaultVat);
  }, [proposal]);

  if (isLoading) {
    return <SkeletonProposalDetail />;
  }

  if (!proposal) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
        <div className="glass-tile p-12 text-center max-w-md">
          <DocumentTextIcon className="mx-auto h-16 w-16 text-slate-300 dark:text-slate-600 mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
            Proposal not found
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            The proposal you're looking for doesn't exist or you don't have access.
          </p>
          <Link to="/proposals" className="btn-primary inline-flex">
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back to proposals
          </Link>
        </div>
      </div>
    );
  }

  const status = statusConfig[proposal.status] || statusConfig.DRAFT;
  const StatusIcon = status.icon;
  const showClientLinkButton = !['DECLINED', 'EXPIRED'].includes(proposal.status);
  const clientOpenCount = typeof proposal.viewCount === 'number' ? proposal.viewCount : 0;
  /** Backend rejects updates once the proposal is signed (ACCEPTED). */
  const canEditCoverLetter = proposal.status !== 'ACCEPTED';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back button */}
      <Link
        to="/proposals"
        className="inline-flex items-center text-sm text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
      >
        <ArrowLeftIcon className="h-4 w-4 mr-1" />
        Back to proposals
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{proposal.title}</h1>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.color}`}
            >
              <StatusIcon className="h-3 w-3 mr-1" />
              {status.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {proposal.reference} • Created {format(new Date(proposal.createdAt), 'dd MMM yyyy')}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={downloadPDF} className="btn-secondary" title="Download PDF">
            <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
            PDF
          </button>

          {showClientLinkButton && (
            <button
              type="button"
              onClick={handleCopyClientLink}
              disabled={copyingLink}
              className="btn-secondary"
              title="Copy a link your client can open (counts opens when they use it)"
            >
              <LinkIcon className="h-4 w-4 mr-2" />
              {copyingLink ? 'Creating…' : 'Copy client link'}
            </button>
          )}

          {proposal.status === 'DRAFT' && (
            <button
              onClick={handleSend}
              className="btn-primary"
              style={{ backgroundColor: tenant?.primaryColor || '#0ea5e9' }}
            >
              <EnvelopeIcon className="h-4 w-4 mr-2" />
              Send
            </button>
          )}

          {proposal.status === 'SENT' && (
            <button onClick={handleAccept} className="btn-primary bg-green-600 hover:bg-green-700">
              <CheckIcon className="h-4 w-4 mr-2" />
              Mark Accepted
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Client info */}
          <div className="glass-tile p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Client</h2>
            <div className="flex items-center">
              <div className="p-3 bg-white/50 dark:bg-slate-800/70 rounded-lg border border-white/10 dark:border-slate-600/40">
                <BuildingOfficeIcon className="h-6 w-6 text-slate-600 dark:text-slate-400" />
              </div>
              <div className="ml-4">
                <p className="font-medium text-slate-900 dark:text-slate-100">{proposal.client?.name}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">{proposal.client?.contactEmail}</p>
                {proposal.client?.companyType && (
                  <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
                    {proposal.client.companyType.replace(/_/g, ' ')}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Services — flat list, user decides frequency per service */}
          <div className="glass-tile p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Services</h2>

            <div className="space-y-3">
              {proposal.services?.map((service: any) => {
                const serviceFreq = service.billingFrequency || service.frequency || 'MONTHLY';
                return (
                  <div
                    key={service.id}
                    className="flex items-start justify-between p-4 bg-white/40 dark:bg-slate-800/70 rounded-lg border border-white/20 dark:border-slate-600/50"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{service.name}</p>
                        {service.vatRate !== 20 && hasMixedVatRates && (
                          <span className="text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 rounded">
                            VAT {service.vatRate}%
                          </span>
                        )}
                      </div>
                      {service.description && (
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                          {service.description}
                        </p>
                      )}
                      {service.discountPercent > 0 && (
                        <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                          {service.discountPercent}% off
                        </p>
                      )}
                      {serviceFreq === 'ONE_TIME' && service.oneOffDueDate && (
                        <p className="text-sm text-primary-600 dark:text-primary-400 mt-1">
                          Due: {format(new Date(service.oneOffDueDate), 'd MMMM yyyy')}
                        </p>
                      )}
                    </div>
                    <div className="text-right ml-4">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {formatCurrency(service.lineTotal || service.total || 0)}
                        <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">
                          ex VAT
                        </span>
                      </p>
                      {(service.vatAmount > 0 || hasMixedVatRates) && (
                        <p className="text-xs text-slate-500 dark:text-slate-300">
                          + {formatCurrency(service.vatAmount || 0)} VAT
                        </p>
                      )}
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {formatCurrency(
                          service.grossTotal ?? (service.total || 0) + (service.vatAmount || 0)
                        )}
                        <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">
                          inc VAT
                        </span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cover Letter */}
          {(proposal.coverLetter || canEditCoverLetter) && (
            <div className="glass-tile p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Cover letter</h2>
                {canEditCoverLetter && !editingCoverLetter && (
                  <button
                    type="button"
                    onClick={() => {
                      setCoverLetterDraft(proposal.coverLetter || '');
                      setEditingCoverLetter(true);
                    }}
                    className="btn-secondary text-sm print:hidden"
                  >
                    <PencilIcon className="h-4 w-4 mr-1.5 inline" />
                    Edit
                  </button>
                )}
              </div>
              {editingCoverLetter ? (
                <div className="space-y-3">
                  <textarea
                    value={coverLetterDraft}
                    onChange={(e) => setCoverLetterDraft(e.target.value)}
                    className="input-field w-full min-h-[220px] text-sm font-sans text-slate-900 dark:text-slate-100"
                    placeholder="Write your cover letter to the client…"
                    aria-label="Cover letter"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleSaveCoverLetter}
                      disabled={savingCoverLetter}
                      className="btn-primary text-sm"
                    >
                      {savingCoverLetter ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCoverLetter(false);
                        setCoverLetterDraft(proposal.coverLetter || '');
                      }}
                      className="btn-secondary text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleInsertDefaultCoverLetter}
                      className="btn-secondary text-sm"
                    >
                      Use template
                    </button>
                  </div>
                </div>
              ) : proposal.coverLetter ? (
                <div className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                  {proposal.coverLetter}
                </div>
              ) : (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  No cover letter yet. Click <strong className="text-slate-800 dark:text-slate-200">Edit</strong>{' '}
                  to add one, or open the proposal builder next time to start from the full default.
                </p>
              )}
            </div>
          )}

          {/* Full Terms & Conditions */}
          <div className="glass-tile p-6 print:break-before-page">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Terms & Conditions
              </h2>
              <button onClick={handlePrint} className="btn-secondary text-sm print:hidden">
                <PrinterIcon className="h-4 w-4 mr-2" />
                Print T&Cs
              </button>
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none text-slate-800 dark:text-slate-200 whitespace-pre-wrap text-sm max-h-96 overflow-y-auto print:max-h-none print:overflow-visible bg-white/40 dark:bg-slate-900/50 border border-white/20 dark:border-slate-600/50 p-4 rounded">
              {generateFullTerms()}
            </div>
          </div>

          {/* Signature Section */}
          {(proposal.status === 'SENT' || proposal.status === 'VIEWED') && (
            <div className="glass-tile p-6 print:hidden">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
                Electronic Signature
              </h2>

              {!showSignaturePad ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    By signing below, you confirm acceptance of the Terms & Conditions and the
                    services outlined in this proposal.
                  </p>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                        Signatory Name
                      </label>
                      <input
                        type="text"
                        value={signatoryName}
                        onChange={(e) => setSignatoryName(e.target.value)}
                        className="mt-1 input-field w-full"
                        placeholder="Full name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                        Position
                      </label>
                      <input
                        type="text"
                        value={signatoryPosition}
                        onChange={(e) => setSignatoryPosition(e.target.value)}
                        className="mt-1 input-field w-full"
                        placeholder="e.g., Director"
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => setShowSignaturePad(true)}
                    disabled={!signatoryName || !signatoryPosition}
                    className="btn-primary w-full"
                  >
                    <DocumentTextIcon className="h-4 w-4 mr-2 inline" />
                    Sign Proposal Electronically
                  </button>

                  {(!signatoryName || !signatoryPosition) && (
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Please enter your name and position to enable signing
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <SignaturePad
                    onSignature={handleSignature}
                    onClear={() => setSignatureData(null)}
                  />
                  <button
                    onClick={() => setShowSignaturePad(false)}
                    className="btn-secondary text-sm"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Display Signature if accepted */}
          {(proposal.status === 'ACCEPTED' || proposal.signature) && (
            <div className="glass-tile p-6 print:break-inside-avoid">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
                Signed by
              </h2>
              <div className="space-y-2">
                {proposal.signature && (
                  <div className="border border-white/20 dark:border-slate-600/50 rounded p-2 bg-white/40 dark:bg-slate-900/50 inline-block">
                    <img
                      src={proposal.signature}
                      alt="Electronic Signature"
                      className="h-16 object-contain"
                    />
                  </div>
                )}
                <p className="text-sm text-slate-800 dark:text-slate-200">
                  <span className="font-medium">Name:</span> {proposal.acceptedBy || signatoryName}
                </p>
                {proposal.signatoryPosition && (
                  <p className="text-sm text-slate-800 dark:text-slate-200">
                    <span className="font-medium">Position:</span> {proposal.signatoryPosition}
                  </p>
                )}
                {proposal.acceptedAt && (
                  <p className="text-sm text-slate-800 dark:text-slate-200">
                    <span className="font-medium">Date:</span>{' '}
                    {format(new Date(proposal.acceptedAt), 'dd MMMM yyyy')}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {proposal.notes && (
            <div className="glass-tile p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Notes</h2>
              <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{proposal.notes}</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Pricing - Monthly cost focus */}
          <div className="glass-tile p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
              Monthly Cost
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
              Recurring fees averaged per month. One-off fees shown separately.
            </p>
            <div className="space-y-3">
              {/* Recurring monthly */}
              <div className="flex justify-between items-baseline">
                <span className="text-slate-600 dark:text-slate-300">Monthly (inc. VAT)</span>
                <span className="font-bold text-xl text-primary-600 tabular-nums">
                  {formatCurrency(pricingBreakdown.monthlyIncVat)}
                </span>
              </div>

              {/* One-off */}
              {pricingBreakdown.oneOffIncVat > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-300">One-off (inc. VAT)</span>
                  <span className="font-medium text-slate-900 dark:text-white tabular-nums">
                    {formatCurrency(pricingBreakdown.oneOffIncVat)}
                  </span>
                </div>
              )}

              <div className="border-t border-white/20 dark:border-slate-600/50 pt-3 space-y-2">
                {/* Monthly breakdown */}
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-300">Monthly subtotal (ex VAT)</span>
                  <span className="font-medium text-slate-900 dark:text-white tabular-nums">
                    {formatCurrency(pricingBreakdown.monthlyExVat)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-300">
                    Monthly VAT {hasMixedVatRates ? '(mixed)' : `(${proposal.vatRate || 20}%)`}
                  </span>
                  <span className="font-medium text-slate-900 dark:text-white tabular-nums">
                    {formatCurrency(pricingBreakdown.monthlyVat)}
                  </span>
                </div>

                {/* One-off breakdown */}
                {pricingBreakdown.oneOffIncVat > 0 && (
                  <>
                    <div className="flex justify-between text-sm pt-1 border-t border-dashed border-white/10 dark:border-slate-600/30">
                      <span className="text-slate-600 dark:text-slate-300">One-off subtotal (ex VAT)</span>
                      <span className="font-medium text-slate-900 dark:text-white tabular-nums">
                        {formatCurrency(pricingBreakdown.oneOffExVat)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-300">One-off VAT</span>
                      <span className="font-medium text-slate-900 dark:text-white tabular-nums">
                        {formatCurrency(pricingBreakdown.oneOffVat)}
                      </span>
                    </div>
                  </>
                )}

                {/* Discount */}
                {proposal.discountAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-300">Discount</span>
                    <span className="font-medium text-red-600 dark:text-red-400 tabular-nums">
                      -{formatCurrency(proposal.discountAmount)}
                    </span>
                  </div>
                )}

                {/* Total */}
                <div className="flex justify-between items-baseline pt-2 border-t border-white/20 dark:border-slate-600/50">
                  <span className="font-semibold text-slate-900 dark:text-white">Monthly cost</span>
                  <span className="font-bold text-2xl text-slate-900 dark:text-white tabular-nums tracking-tight">
                    {formatCurrency(pricingBreakdown.monthlyIncVat)}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                Monthly cost is the average per month across all billing periods. One-off fees are separate.
              </p>
            </div>
          </div>

          {/* Valid until */}
          <div className="glass-tile p-6">
            <div className="flex items-center gap-2 mb-2">
              <CalendarIcon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Valid Until</h2>
            </div>
            <p className="text-slate-700 dark:text-slate-300">
              {format(new Date(proposal.validUntil), 'dd MMMM yyyy')}
            </p>
            {new Date(proposal.validUntil) < new Date() && proposal.status !== 'ACCEPTED' && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">Expired</p>
            )}
          </div>

          {/* Payment terms */}
          <div className="glass-tile p-6">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
              Payment Terms
            </h2>
            <p className="text-slate-700 dark:text-slate-300">{proposal.paymentTerms}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Frequency: {proposal.paymentFrequency?.toLowerCase()}
            </p>
          </div>

          {/* Created by */}
          <div className="glass-tile p-6">
            <div className="flex items-center gap-2 mb-2">
              <UserIcon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Created By</h2>
            </div>
            <p className="text-slate-700 dark:text-slate-300">
              {proposal.createdBy?.firstName} {proposal.createdBy?.lastName}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">{proposal.createdBy?.email}</p>
          </div>

          {/* Client opens (public link only) */}
          {proposal.status !== 'DRAFT' && (
            <div className="glass-tile p-6">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
                Client activity
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Client opened the shared proposal{' '}
                <span className="font-medium text-slate-900 dark:text-slate-100">{clientOpenCount}</span>{' '}
                {clientOpenCount === 1 ? 'time' : 'times'}
                {proposal.lastViewedAt && (
                  <>
                    . Last:{' '}
                    <span className="text-slate-800 dark:text-slate-200">
                      {format(new Date(proposal.lastViewedAt), 'dd MMM yyyy, HH:mm')}
                    </span>
                  </>
                )}
                .
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-3 leading-relaxed">
                Counts and Viewed status update only when the client uses the public link; opening this screen in
                the practice app does not add opens or change status.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-2 leading-relaxed">
                Sending marks the proposal <strong className="text-slate-700 dark:text-slate-300">Sent</strong>.
                When the client opens the <strong className="text-slate-700 dark:text-slate-300">Copy client link</strong>{' '}
                URL, it becomes <strong className="text-slate-700 dark:text-slate-300">Viewed</strong> and each open
                is counted here. When they sign on that page, it shows as{' '}
                <strong className="text-slate-700 dark:text-slate-300">Signed</strong> and the practice owner gets an
                email (when email is configured). About one month before <strong>Valid until</strong>, recurring
                proposals trigger a reminder to the owner; pure one-off proposals do not.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProposalDetail;
