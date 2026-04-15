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
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { useAuthStore } from '../../stores/authStore';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { generateTermsAndConditions } from '../../data/defaultTerms';
import SignaturePad from '../../components/SignaturePad';
import SkeletonProposalDetail from '../../components/skeleton/SkeletonProposalDetail';

const statusConfig: Record<string, { color: string; bg: string; icon: any; label: string }> = {
  DRAFT: { color: 'text-slate-700', bg: 'bg-slate-100', icon: PencilIcon, label: 'Draft' },
  SENT: { color: 'text-blue-600', bg: 'bg-blue-100', icon: EnvelopeIcon, label: 'Sent' },
  VIEWED: { color: 'text-purple-600', bg: 'bg-purple-100', icon: ClockIcon, label: 'Viewed' },
  ACCEPTED: { color: 'text-green-600', bg: 'bg-green-100', icon: CheckIcon, label: 'Accepted' },
  DECLINED: { color: 'text-red-600', bg: 'bg-red-100', icon: XMarkIcon, label: 'Declined' },
  EXPIRED: { color: 'text-slate-700', bg: 'bg-slate-100', icon: ClockIcon, label: 'Expired' },
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

  useEffect(() => {
    if (id) {
      loadProposal();
      loadCompanySettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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

      // Record view if proposal is loaded successfully and is in SENT status
      if (response.data && response.data.status === 'SENT') {
        await recordView();
      }
    } catch (error) {
      // Error handled by UI
    } finally {
      setIsLoading(false);
    }
  };

  const recordView = async () => {
    try {
      await apiClient.recordProposalView(id!);
    } catch (error) {
      // Error handled silently - view tracking is non-critical
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
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `proposal-${proposal.reference}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      // Error handled by UI
    }
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
          <DocumentTextIcon className="mx-auto h-16 w-16 text-slate-300 mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Proposal not found</h2>
          <p className="text-slate-600 mb-6">
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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back button */}
      <Link
        to="/proposals"
        className="inline-flex items-center text-sm text-slate-600 hover:text-slate-800 transition-colors"
      >
        <ArrowLeftIcon className="h-4 w-4 mr-1" />
        Back to proposals
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-slate-900">{proposal.title}</h1>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.color}`}
            >
              <StatusIcon className="h-3 w-3 mr-1" />
              {status.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {proposal.reference} • Created {format(new Date(proposal.createdAt), 'dd MMM yyyy')}
          </p>
        </div>

        <div className="flex space-x-2">
          <button onClick={downloadPDF} className="btn-secondary" title="Download PDF">
            <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
            PDF
          </button>

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
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Client</h2>
            <div className="flex items-center">
              <div className="p-3 bg-white/50 rounded-lg">
                <BuildingOfficeIcon className="h-6 w-6 text-slate-600" />
              </div>
              <div className="ml-4">
                <p className="font-medium text-slate-900">{proposal.client?.name}</p>
                <p className="text-sm text-slate-600">{proposal.client?.contactEmail}</p>
                {proposal.client?.companyType && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    {proposal.client.companyType.replace(/_/g, ' ')}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Services - Grouped by billing frequency */}
          <div className="glass-tile p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Services</h2>

            {Object.entries(groupedServices).map(([frequency, services]: [string, any]) => (
              <div key={frequency} className="mb-6 last:mb-0">
                <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">
                  {frequencyLabels[frequency] || frequency} Services
                </h3>
                <div className="space-y-3">
                  {services.map((service: any) => (
                    <div
                      key={service.id}
                      className="flex items-start justify-between p-4 bg-white/40 rounded-lg border border-white/20"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-slate-900">{service.name}</p>
                          {service.vatRate !== 20 && hasMixedVatRates && (
                            <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">
                              VAT {service.vatRate}%
                            </span>
                          )}
                        </div>
                        {service.description && (
                          <p className="text-sm text-slate-600 mt-1">{service.description}</p>
                        )}
                        <p className="text-sm text-slate-500 mt-1">
                          Qty: {service.quantity} • Price: £
                          {(service.displayPrice || service.unitPrice)?.toLocaleString()}/
                          {frequencyLabels[frequency]?.toLowerCase() || 'month'}
                          {service.discountPercent > 0 && (
                            <span className="text-green-600 ml-1">
                              ({service.discountPercent}% off)
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="text-right ml-4">
                        <p className="font-semibold text-slate-900">
                          £{(service.lineTotal || service.total)?.toLocaleString()}
                        </p>
                        {(service.vatAmount > 0 || hasMixedVatRates) && (
                          <p className="text-xs text-slate-500">
                            + £{service.vatAmount?.toLocaleString()} VAT
                          </p>
                        )}
                        <p className="text-sm font-medium text-slate-700">
                          £
                          {(
                            service.grossTotal || service.total + (service.vatAmount || 0)
                          )?.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Group subtotal */}
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/20 text-sm">
                  <span className="text-slate-600">{frequencyLabels[frequency]} Subtotal</span>
                  <div className="text-right">
                    <span className="font-medium text-slate-900">
                      £{groupTotals[frequency]?.total?.toLocaleString()}
                    </span>
                    {groupTotals[frequency]?.vatAmount > 0 && (
                      <p className="text-xs text-slate-500">
                        (inc £{groupTotals[frequency]?.vatAmount?.toLocaleString()} VAT)
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Cover Letter */}
          {proposal.coverLetter && (
            <div className="glass-tile p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Cover Letter</h2>
              <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap">
                {proposal.coverLetter}
              </div>
            </div>
          )}

          {/* Full Terms & Conditions */}
          <div className="glass-tile p-6 print:break-before-page">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Terms & Conditions</h2>
              <button onClick={handlePrint} className="btn-secondary text-sm print:hidden">
                <PrinterIcon className="h-4 w-4 mr-2" />
                Print T&Cs
              </button>
            </div>
            <div className="prose prose-sm max-w-none text-slate-800 whitespace-pre-wrap text-sm max-h-96 overflow-y-auto print:max-h-none print:overflow-visible bg-white/40 border border-white/20 p-4 rounded">
              {generateFullTerms()}
            </div>
          </div>

          {/* Signature Section */}
          {(proposal.status === 'SENT' || proposal.status === 'VIEWED') && (
            <div className="glass-tile p-6 print:hidden">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Electronic Signature</h2>

              {!showSignaturePad ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-700">
                    By signing below, you confirm acceptance of the Terms & Conditions and the
                    services outlined in this proposal.
                  </p>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-800">
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
                      <label className="block text-sm font-medium text-slate-800">Position</label>
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
                    <p className="text-xs text-slate-600">
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
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Accepted By</h2>
              <div className="space-y-2">
                {proposal.signature && (
                  <div className="border border-white/20 rounded p-2 bg-white/40 inline-block">
                    <img
                      src={proposal.signature}
                      alt="Electronic Signature"
                      className="h-16 object-contain"
                    />
                  </div>
                )}
                <p className="text-sm text-slate-800">
                  <span className="font-medium">Name:</span> {proposal.acceptedBy || signatoryName}
                </p>
                {proposal.signatoryPosition && (
                  <p className="text-sm text-slate-800">
                    <span className="font-medium">Position:</span> {proposal.signatoryPosition}
                  </p>
                )}
                {proposal.acceptedAt && (
                  <p className="text-sm text-slate-800">
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
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Notes</h2>
              <p className="text-slate-700 whitespace-pre-wrap">{proposal.notes}</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Pricing - Grouped by billing frequency */}
          <div className="glass-tile p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Investment Summary</h2>
            <div className="space-y-4">
              {/* Show totals by frequency */}
              {Object.entries(groupTotals).map(([freq, totals]: [string, any]) => (
                <div key={freq} className="flex justify-between text-sm">
                  <span className="text-slate-600">{frequencyLabels[freq]} Total</span>
                  <span className="font-medium text-slate-900">
                    £{totals.total?.toLocaleString()}
                  </span>
                </div>
              ))}

              {/* Discount */}
              {proposal.discountAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Discount</span>
                  <span className="font-medium text-red-600">
                    -£{proposal.discountAmount?.toLocaleString()}
                  </span>
                </div>
              )}

              {/* VAT */}
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">
                  VAT {hasMixedVatRates ? '(Mixed rates)' : `(${proposal.vatRate || 20}%)`}
                </span>
                <span className="font-medium text-slate-900">
                  £{proposal.vatAmount?.toLocaleString()}
                </span>
              </div>

              {/* Grand Total */}
              <div className="border-t border-white/20 pt-3">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-slate-900">Total Investment</span>
                  <span className="font-bold text-2xl text-slate-900">
                    £{proposal.total?.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Annual equivalent note */}
              {groupTotals.MONTHLY && (
                <p className="text-xs text-slate-500 text-center">
                  Equivalent to £{(groupTotals.MONTHLY.total * 12).toLocaleString()}/year
                </p>
              )}
            </div>
          </div>

          {/* Valid until */}
          <div className="glass-tile p-6">
            <div className="flex items-center gap-2 mb-2">
              <CalendarIcon className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-900">Valid Until</h2>
            </div>
            <p className="text-slate-700">
              {format(new Date(proposal.validUntil), 'dd MMMM yyyy')}
            </p>
            {new Date(proposal.validUntil) < new Date() && proposal.status !== 'ACCEPTED' && (
              <p className="text-xs text-red-600 mt-1">Expired</p>
            )}
          </div>

          {/* Payment terms */}
          <div className="glass-tile p-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-2">Payment Terms</h2>
            <p className="text-slate-700">{proposal.paymentTerms}</p>
            <p className="text-sm text-slate-600 mt-1">
              Frequency: {proposal.paymentFrequency?.toLowerCase()}
            </p>
          </div>

          {/* Created by */}
          <div className="glass-tile p-6">
            <div className="flex items-center gap-2 mb-2">
              <UserIcon className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-900">Created By</h2>
            </div>
            <p className="text-slate-700">
              {proposal.createdBy?.firstName} {proposal.createdBy?.lastName}
            </p>
            <p className="text-sm text-slate-600">{proposal.createdBy?.email}</p>
          </div>

          {/* View stats (if available) */}
          {proposal.viewCount > 0 && (
            <div className="glass-tile p-6">
              <h2 className="text-sm font-semibold text-slate-900 mb-2">Activity</h2>
              <p className="text-sm text-slate-600">
                Viewed {proposal.viewCount} {proposal.viewCount === 1 ? 'time' : 'times'}
              </p>
              {proposal.lastViewedAt && (
                <p className="text-xs text-slate-500 mt-1">
                  Last viewed {format(new Date(proposal.lastViewedAt), 'dd MMM yyyy')}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProposalDetail;
