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
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { useAuthStore } from '../../stores/authStore';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const statusConfig: Record<string, { color: string; bg: string; icon: any }> = {
  DRAFT: { color: 'text-gray-600', bg: 'bg-gray-100', icon: PencilIcon },
  SENT: { color: 'text-blue-600', bg: 'bg-blue-100', icon: EnvelopeIcon },
  VIEWED: { color: 'text-blue-600', bg: 'bg-blue-100', icon: EnvelopeIcon },
  ACCEPTED: { color: 'text-green-600', bg: 'bg-green-100', icon: CheckIcon },
  DECLINED: { color: 'text-red-600', bg: 'bg-red-100', icon: XMarkIcon },
  EXPIRED: { color: 'text-gray-600', bg: 'bg-gray-100', icon: XMarkIcon },
};

const ProposalDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { tenant } = useAuthStore();
  const [proposal, setProposal] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadProposal();
    }
  }, [id]);

  const loadProposal = async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.getProposal(id!) as any;
      setProposal(response.data);
    } catch (error) {
      console.error('Failed to load proposal', error);
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
      console.error('Failed to download PDF', error);
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
        <h2 className="text-xl font-semibold text-gray-900">Proposal not found</h2>
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
        className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeftIcon className="h-4 w-4 mr-1" />
        Back to proposals
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-gray-900">{proposal.title}</h1>
            <span className={`badge ${status.bg} ${status.color} flex items-center`}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {proposal.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
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
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Client</h2>
            <div className="flex items-center">
              <div className="p-3 bg-gray-100 rounded-lg">
                <span className="text-xl font-bold text-gray-600">
                  {proposal.client?.name?.charAt(0)}
                </span>
              </div>
              <div className="ml-4">
                <p className="font-medium text-gray-900">{proposal.client?.name}</p>
                <p className="text-sm text-gray-500">{proposal.client?.contactEmail}</p>
              </div>
            </div>
          </div>

          {/* Services */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Services</h2>
            <div className="space-y-4">
              {proposal.services?.map((service: any) => (
                <div
                  key={service.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-900">{service.name}</p>
                    {service.description && (
                      <p className="text-sm text-gray-500">{service.description}</p>
                    )}
                    <p className="text-sm text-gray-500 mt-1">
                      Qty: {service.quantity} • {service.frequency}
                    </p>
                  </div>
                  <p className="font-semibold text-gray-900">
                    £{service.total?.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          {proposal.notes && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Notes</h2>
              <p className="text-gray-600 whitespace-pre-wrap">{proposal.notes}</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Pricing */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Pricing</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium text-gray-900">
                  £{proposal.subtotal?.toLocaleString()}
                </span>
              </div>
              {proposal.discountAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Discount</span>
                  <span className="font-medium text-red-600">
                    -£{proposal.discountAmount?.toLocaleString()}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">VAT (20%)</span>
                <span className="font-medium text-gray-900">
                  £{proposal.vatAmount?.toLocaleString()}
                </span>
              </div>
              <div className="border-t border-gray-200 pt-3">
                <div className="flex justify-between">
                  <span className="font-semibold text-gray-900">Total</span>
                  <span className="font-bold text-xl text-gray-900">
                    £{proposal.total?.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Valid until */}
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Valid Until</h2>
            <p className="text-gray-600">
              {format(new Date(proposal.validUntil), 'dd MMMM yyyy')}
            </p>
          </div>

          {/* Payment terms */}
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Payment Terms</h2>
            <p className="text-gray-600">{proposal.paymentTerms}</p>
            <p className="text-sm text-gray-500 mt-1">
              Frequency: {proposal.paymentFrequency?.toLowerCase()}
            </p>
          </div>

          {/* Created by */}
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Created By</h2>
            <p className="text-gray-600">
              {proposal.createdBy?.firstName} {proposal.createdBy?.lastName}
            </p>
            <p className="text-sm text-gray-500">{proposal.createdBy?.email}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProposalDetail;
