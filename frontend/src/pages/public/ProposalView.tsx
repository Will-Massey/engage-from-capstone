import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../../utils/api';
import toast from 'react-hot-toast';
import SignaturePad from '../../components/signature/SignaturePad';
import {
  DocumentTextIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

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
    total: number;
    frequency: string;
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAccepted, setIsAccepted] = useState(false);

  useEffect(() => {
    if (token) {
      loadProposal();
    }
  }, [token]);

  const loadProposal = async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.get(`/proposals/view/${token}`) as any;
      if (response.success) {
        setProposal(response.data);
        setIsAccepted(response.data.status === 'ACCEPTED');
      } else {
        setError('Proposal not found or link expired');
      }
    } catch (error: any) {
      setError(error.response?.data?.error?.message || 'Failed to load proposal');
    } finally {
      setIsLoading(false);
    }
  };

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
    if (!signatureData || !signerName || !signerRole) {
      toast.error('Please provide your name, role, and signature');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiClient.post(`/proposals/view/${token}/sign`, {
        signedBy: signerName,
        signedByRole: signerRole,
        signatureData,
        agreementAccepted: termsAccepted,
      }) as any;

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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <ExclamationCircleIcon className="mx-auto h-16 w-16 text-red-500" />
          <h2 className="mt-4 text-xl font-semibold text-gray-900">Proposal Not Available</h2>
          <p className="mt-2 text-gray-600">{error}</p>
          <p className="mt-4 text-sm text-gray-500">
            Please contact the sender if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  if (!proposal) return null;

  const isExpired = new Date(proposal.validUntil) < new Date();

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-t-xl shadow-sm p-6 border-b">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Proposal from</p>
              <h1 className="text-2xl font-bold text-gray-900">{proposal.tenant.name}</h1>
            </div>
            {proposal.tenant.logo && (
              <img src={proposal.tenant.logo} alt="Logo" className="h-12" />
            )}
          </div>
        </div>

        {/* Proposal Content */}
        <div className="bg-white shadow-sm p-6 space-y-8">
          {/* Status Banner */}
          {isAccepted ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center">
              <CheckCircleIcon className="h-6 w-6 text-green-600 mr-3" />
              <div>
                <p className="font-medium text-green-900">Proposal Accepted</p>
                <p className="text-sm text-green-700">
                  This proposal has been accepted and is now binding.
                </p>
              </div>
            </div>
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
            <h2 className="text-xl font-semibold text-gray-900">{proposal.title}</h2>
            <p className="text-sm text-gray-500 mt-1">Reference: {proposal.reference}</p>
            <p className="text-sm text-gray-500">
              Valid until: {formatDate(proposal.validUntil)}
            </p>
          </div>

          {/* Client */}
          <div className="border-t pt-6">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Prepared For</h3>
            <p className="mt-1 text-lg font-medium text-gray-900">{proposal.client.name}</p>
            <p className="text-sm text-gray-500 capitalize">
              {proposal.client.companyType.replace(/_/g, ' ')}
            </p>
          </div>

          {/* Cover Letter */}
          {proposal.coverLetter && (
            <div className="border-t pt-6">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Cover Letter</h3>
              <div className="mt-2 prose prose-sm max-w-none text-gray-700">
                {proposal.coverLetter.split('\n').map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>
            </div>
          )}

          {/* Services */}
          <div className="border-t pt-6">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Services</h3>
            <div className="mt-4 space-y-4">
              {proposal.services.map((service) => (
                <div
                  key={service.id}
                  className="flex justify-between items-start p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center">
                      <h4 className="font-medium text-gray-900">{service.name}</h4>
                      {service.isOptional && (
                        <span className="ml-2 px-2 py-0.5 text-xs bg-gray-200 text-gray-600 rounded-full">
                          Optional
                        </span>
                      )}
                    </div>
                    {service.description && (
                      <p className="text-sm text-gray-500 mt-1">{service.description}</p>
                    )}
                    <p className="text-sm text-gray-500 mt-1">
                      {service.quantity} x {formatCurrency(service.unitPrice)} /{' '}
                      {service.frequency.toLowerCase()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">{formatCurrency(service.total)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pricing Summary */}
          <div className="border-t pt-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium">{formatCurrency(proposal.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">VAT</span>
                <span className="font-medium">{formatCurrency(proposal.vatAmount)}</span>
              </div>
              <div className="flex justify-between text-lg font-semibold pt-2 border-t">
                <span className="text-gray-900">Total</span>
                <span className="text-gray-900">{formatCurrency(proposal.total)}</span>
              </div>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Payment terms: {proposal.paymentTerms}
            </p>
          </div>

          {/* Terms & Conditions */}
          {!isAccepted && !isExpired && (
            <div className="border-t pt-6">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                Terms & Conditions
              </h3>
              <div className="mt-4 p-4 bg-gray-50 rounded-lg max-h-60 overflow-y-auto">
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
                  {proposal.terms || 'Standard terms and conditions apply.'}
                </pre>
              </div>
              <div className="mt-4 flex items-start">
                <input
                  type="checkbox"
                  id="terms"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-1 h-4 w-4 text-primary-600 rounded"
                />
                <label htmlFor="terms" className="ml-2 text-sm text-gray-700">
                  I have read and agree to the terms and conditions outlined above.
                </label>
              </div>
            </div>
          )}

          {/* Actions */}
          {!isAccepted && !isExpired && !showSignature && (
            <div className="border-t pt-6 flex space-x-4">
              <button
                onClick={handleAccept}
                disabled={!termsAccepted}
                className="flex-1 btn-primary py-3 disabled:opacity-50"
              >
                Accept Proposal
              </button>
            </div>
          )}

          {/* Signature Pad */}
          {!isAccepted && !isExpired && showSignature && (
            <div className="border-t pt-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Electronic Signature</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Full Name</label>
                    <input
                      type="text"
                      value={signerName}
                      onChange={(e) => setSignerName(e.target.value)}
                      placeholder="John Smith"
                      className="mt-1 input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Role/Title</label>
                    <input
                      type="text"
                      value={signerRole}
                      onChange={(e) => setSignerRole(e.target.value)}
                      placeholder="Director"
                      className="mt-1 input-field"
                    />
                  </div>
                </div>
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

        {/* Footer */}
        <div className="bg-gray-100 rounded-b-xl p-4 text-center text-sm text-gray-500">
          Powered by Engage by Capstone • Professional Proposal Platform
        </div>
      </div>
    </div>
  );
};

export default PublicProposalView;
