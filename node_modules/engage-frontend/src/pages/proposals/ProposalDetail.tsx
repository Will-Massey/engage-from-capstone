import { useEffect, useState } from 'react';
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
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { useAuthStore } from '../../stores/authStore';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { generateTermsAndConditions } from '../../data/defaultTerms';
import SignaturePad from '../../components/SignaturePad';

const statusConfig: Record<string, { color: string; bg: string; icon: any }> = {
  DRAFT: { color: 'text-slate-700', bg: 'bg-slate-100', icon: PencilIcon },
  SENT: { color: 'text-blue-600', bg: 'bg-blue-100', icon: EnvelopeIcon },
  VIEWED: { color: 'text-blue-600', bg: 'bg-blue-100', icon: EnvelopeIcon },
  ACCEPTED: { color: 'text-green-600', bg: 'bg-green-100', icon: CheckIcon },
  DECLINED: { color: 'text-red-600', bg: 'bg-red-100', icon: XMarkIcon },
  EXPIRED: { color: 'text-slate-700', bg: 'bg-slate-100', icon: XMarkIcon },
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
  }, [id]);

  const loadCompanySettings = async () => {
    try {
      const response = await apiClient.getTenantSettings() as any;
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
      const response = await apiClient.getProposal(id!) as any;
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
      const blob = await apiClient.downloadProposalPDF(id!) as Blob;
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold text-slate-900">Proposal not found</h2>
        <Link to="/proposals" className="mt-4 text-primary-600 hover:text-primary-500">
          Back to proposals
        </Link>
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
        className="inline-flex items-center text-sm text-slate-600 hover:text-slate-800"
      >
        <ArrowLeftIcon className="h-4 w-4 mr-1" />
        Back to proposals
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-slate-900">{proposal.title}</h1>
            <span className={`badge ${status.bg} ${status.color} flex items-center`}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {proposal.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {proposal.reference} • Created {format(new Date(proposal.createdAt), 'dd MMM yyyy')}
          </p>
        </div>

        <div className="flex space-x-2">
          <button
            onClick={downloadPDF}
            className="btn-secondary"
            title="Download PDF"
          >
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
            <button
              onClick={handleAccept}
              className="btn-primary bg-green-600 hover:bg-green-700"
            >
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
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Client</h2>
            <div className="flex items-center">
              <div className="p-3 bg-slate-100 rounded-lg">
                <span className="text-xl font-bold text-slate-700">
                  {proposal.client?.name?.charAt(0)}
                </span>
              </div>
              <div className="ml-4">
                <p className="font-medium text-slate-900">{proposal.client?.name}</p>
                <p className="text-sm text-slate-600">{proposal.client?.contactEmail}</p>
              </div>
            </div>
          </div>

          {/* Services */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Services</h2>
            <div className="space-y-4">
              {proposal.services?.map((service: any) => (
                <div
                  key={service.id}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-slate-900">{service.name}</p>
                    {service.description && (
                      <p className="text-sm text-slate-600">{service.description}</p>
                    )}
                    <p className="text-sm text-slate-600 mt-1">
                      Qty: {service.quantity} • {service.frequency}
                    </p>
                  </div>
                  <p className="font-semibold text-slate-900">
                    £{service.total?.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Cover Letter */}
          {proposal.coverLetter && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Cover Letter</h2>
              <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap">
                {proposal.coverLetter}
              </div>
            </div>
          )}

          {/* Full Terms & Conditions */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 print:break-before-page">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Terms & Conditions</h2>
              <button
                onClick={handlePrint}
                className="btn-secondary text-sm print:hidden"
              >
                <PrinterIcon className="h-4 w-4 mr-2" />
                Print T&Cs
              </button>
            </div>
            <div className="prose prose-sm max-w-none text-slate-800 whitespace-pre-wrap text-sm max-h-96 overflow-y-auto print:max-h-none print:overflow-visible border border-slate-200 p-4 rounded bg-slate-50 print:bg-white">
              {generateFullTerms()}
            </div>
          </div>

          {/* Signature Section */}
          {(proposal.status === 'SENT' || proposal.status === 'VIEWED') && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 print:hidden">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Electronic Signature</h2>
              
              {!showSignaturePad ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-700">
                    By signing below, you confirm acceptance of the Terms & Conditions and the services outlined in this proposal.
                  </p>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-800">Signatory Name</label>
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
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 print:break-inside-avoid">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Accepted By</h2>
              <div className="space-y-2">
                {proposal.signature && (
                  <div className="border border-slate-200 rounded p-2 bg-white inline-block">
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
                    <span className="font-medium">Date:</span> {format(new Date(proposal.acceptedAt), 'dd MMMM yyyy')}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {proposal.notes && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Notes</h2>
              <p className="text-slate-700 whitespace-pre-wrap">{proposal.notes}</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Pricing */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Pricing</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-700">Subtotal</span>
                <span className="font-medium text-slate-900">
                  £{proposal.subtotal?.toLocaleString()}
                </span>
              </div>
              {proposal.discountAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-700">Discount</span>
                  <span className="font-medium text-red-600">
                    -£{proposal.discountAmount?.toLocaleString()}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-slate-700">VAT (20%)</span>
                <span className="font-medium text-slate-900">
                  £{proposal.vatAmount?.toLocaleString()}
                </span>
              </div>
              <div className="border-t border-slate-200 pt-3">
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-900">Total</span>
                  <span className="font-bold text-xl text-slate-900">
                    £{proposal.total?.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Valid until */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-2">Valid Until</h2>
            <p className="text-slate-700">
              {format(new Date(proposal.validUntil), 'dd MMMM yyyy')}
            </p>
          </div>

          {/* Payment terms */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-2">Payment Terms</h2>
            <p className="text-slate-700">{proposal.paymentTerms}</p>
            <p className="text-sm text-slate-600 mt-1">
              Frequency: {proposal.paymentFrequency?.toLowerCase()}
            </p>
          </div>

          {/* Created by */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-2">Created By</h2>
            <p className="text-slate-700">
              {proposal.createdBy?.firstName} {proposal.createdBy?.lastName}
            </p>
            <p className="text-sm text-slate-600">{proposal.createdBy?.email}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProposalDetail;
