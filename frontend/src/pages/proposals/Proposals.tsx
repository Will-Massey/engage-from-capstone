// Cache-bust: 2026-03-03T09:00:00Z - Force rebuild v6
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowDownTrayIcon,
  EyeIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  ClockIcon,
  LinkIcon,
  EnvelopeIcon,
  PencilIcon,
  DocumentDuplicateIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { useAuthStore } from '../../stores/authStore';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

// Prevent tree-shaking
const _iconRefs = [DocumentTextIcon, CheckCircleIcon, ClockIcon];
// Icons loaded successfully

const statusColors: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  SENT: 'bg-blue-100 text-blue-700',
  VIEWED: 'bg-purple-100 text-purple-700',
  ACCEPTED: 'bg-green-100 text-green-700',
  DECLINED: 'bg-red-100 text-red-700',
  EXPIRED: 'bg-orange-100 text-orange-700',
};

const statusLabels: Record<string, string> = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  VIEWED: 'Viewed',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  EXPIRED: 'Expired',
};

const Proposals = () => {
  const { tenant } = useAuthStore();
  const [proposals, setProposals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });

  useEffect(() => {
    loadProposals();
  }, [meta.page, statusFilter]);

  const loadProposals = async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.getProposals({
        page: meta.page,
        limit: 20,
        status: statusFilter || undefined,
        search: searchQuery || undefined,
      }) as any;

      setProposals(response.data || []);
      setMeta(response.meta || { page: 1, totalPages: 1, total: 0 });
    } catch (error) {
      // Error handled by UI
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setMeta({ ...meta, page: 1 });
    loadProposals();
  };

  const downloadPDF = async (id: string, reference: string) => {
    try {
      toast.loading('Generating PDF...');
      const blob = await apiClient.downloadProposalPDF(id) as Blob;
      toast.dismiss();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `proposal-${reference}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('PDF downloaded');
    } catch (error) {
      toast.dismiss();
      toast.error('Failed to download PDF');
    }
  };

  const sendProposalEmail = async (id: string) => {
    try {
      await apiClient.post(`/proposals/${id}/email`, {});
      toast.success('Proposal sent via email');
      loadProposals();
    } catch (error) {
      toast.error('Failed to send proposal');
    }
  };

  const copyProposalLink = (shareToken: string) => {
    const link = `${window.location.origin}/proposals/view/${shareToken}`;
    navigator.clipboard.writeText(link);
    toast.success('Proposal link copied to clipboard');
  };
  
  const generateShareLink = async (proposal: any) => {
    try {
      const response = await apiClient.post(`/proposals/${proposal.id}/share`, { expiryDays: 30 }) as any;
      if (response.success) {
        const shareUrl = response.data.shareUrl;
        navigator.clipboard.writeText(shareUrl);
        toast.success('Shareable link copied!');
        loadProposals();
      }
    } catch (error) {
      toast.error('Failed to generate share link');
    }
  };

  const duplicateProposal = async (proposal: any) => {
    try {
      const response = await apiClient.createProposal({
        clientId: proposal.clientId,
        title: `${proposal.title} (Copy)`,
        coverLetter: proposal.coverLetter,
        terms: proposal.terms,
        services: proposal.services.map((s: any) => ({
          serviceId: s.serviceTemplateId,
          quantity: s.quantity,
          unitPrice: s.unitPrice,
          billingFrequency: s.frequency,
          discountPercent: s.discountPercent,
          description: s.description,
        })),
      }) as any;
      
      if (response.success) {
        toast.success('Proposal duplicated');
        loadProposals();
      }
    } catch (error) {
      toast.error('Failed to duplicate proposal');
    }
  };

  const checkExpired = (validUntil: string) => {
    return new Date(validUntil) < new Date();
  };

  const formatViewCount = (count: number) => {
    if (count === 0) return 'Not viewed';
    if (count === 1) return '1 view';
    return `${count} views`;
  };

  // Calculate days until renewal
  const getDaysUntilRenewal = (renewalDate: string) => {
    if (!renewalDate) return null;
    const days = Math.ceil((new Date(renewalDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  // Create renewal proposal
  const createRenewal = async (proposalId: string) => {
    try {
      const response = await apiClient.post(`/proposals/${proposalId}/create-renewal`, {}) as any;
      if (response.success) {
        toast.success('Renewal proposal created');
        loadProposals();
      }
    } catch (error) {
      toast.error('Failed to create renewal');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Proposals</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Manage your client proposals and track their status
          </p>
        </div>
        <Link
          to="/proposals/new"
          className="btn-primary"
        >
          <PlusIcon className="h-5 w-5 mr-2" />
          Create Proposal
        </Link>
      </div>

      {/* Filters - Glass Card */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <form onSubmit={handleSearch} className="flex-1">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input w-full"
                placeholder="Search proposals, clients, or references..."
              />
            </div>
          </form>

          <div className="flex items-center space-x-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input-field w-44"
            >
              <option value="">All Status</option>
              <option value="DRAFT">Draft</option>
              <option value="SENT">Sent</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="DECLINED">Declined</option>
              <option value="EXPIRED">Expired</option>
              <option value="RENEWALS_DUE">Renewals Due (30 days)</option>
            </select>

            <button
              onClick={loadProposals}
              className="btn-secondary"
            >
              <FunnelIcon className="h-4 w-4 mr-1.5" />
              Filter
            </button>
          </div>
        </div>
      </div>

      {/* Proposals table - Glass Card */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : proposals.length === 0 ? (
          <div className="text-center py-16">
            <DocumentTextIcon className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" />
            <h3 className="mt-4 text-lg font-medium text-slate-900 dark:text-slate-100">No proposals found</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Get started by creating your first proposal
            </p>
            <Link
              to="/proposals/new"
              className="mt-6 btn-primary inline-flex"
            >
              <PlusIcon className="h-5 w-5 mr-2" />
              Create Proposal
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50/80 dark:bg-slate-800/80 backdrop-blur-sm">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider w-[22%]">
                    Proposal
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider w-[22%]">
                    Client
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider w-[10%]">
                    Status
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider w-[8%]">
                    Views
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider w-[12%]">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider w-[14%] whitespace-nowrap">
                    Valid Until
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider w-[12%]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {proposals.map((proposal) => {
                  const isExpired = checkExpired(proposal.validUntil);
                  const displayStatus = isExpired && proposal.status !== 'ACCEPTED' && proposal.status !== 'DECLINED' 
                    ? 'EXPIRED' 
                    : proposal.status;
                  
                  return (
                    <tr key={proposal.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div>
                          <Link
                            to={`/proposals/${proposal.id}`}
                            className="text-sm font-medium text-slate-900 dark:text-slate-100 hover:text-primary-600 dark:hover:text-primary-400 truncate max-w-[200px] block"
                          >
                            {proposal.title}
                          </Link>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{proposal.reference}</p>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm text-slate-900 dark:text-slate-100 truncate max-w-[180px]">{proposal.client?.name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {proposal.client?.companyType?.replace(/_/g, ' ')}
                        </div>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center space-x-1">
                            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[displayStatus] || 'bg-slate-100 text-slate-700'}`}>
                              {statusLabels[displayStatus] || displayStatus}
                            </span>
                            {proposal.signatures?.length > 0 && (
                              <CheckCircleIcon className="h-4 w-4 text-green-500" title="Signed" />
                            )}
                          </div>
                          {/* Renewal Badge */}
                          {proposal.status === 'ACCEPTED' && proposal.renewalDate && (
                            (() => {
                              const daysUntil = getDaysUntilRenewal(proposal.renewalDate);
                              if (daysUntil === null) return null;
                              if (daysUntil <= 0) return (
                                <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                                  Renewal overdue
                                </span>
                              );
                              if (daysUntil <= 30) return (
                                <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                                  Renews in {daysUntil} days
                                </span>
                              );
                              return (
                                <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">
                                  Renews in {daysUntil} days
                                </span>
                              );
                            })()
                          )}
                          {proposal.isRenewal && (
                            <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                              Renewal
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-center">
                        <div className="flex flex-col items-center">
                          <div className="flex items-center space-x-1">
                            <EyeIcon className={`h-4 w-4 ${proposal._count?.views > 0 ? 'text-primary-500' : 'text-slate-400 dark:text-slate-500'}`} />
                            <span className={`text-sm ${proposal._count?.views > 0 ? 'text-primary-700 dark:text-primary-300 font-medium' : 'text-slate-700 dark:text-slate-300'}`}>
                              {formatViewCount(proposal._count?.views || 0)}
                            </span>
                          </div>
                          {proposal.viewedAt && (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              Last: {format(new Date(proposal.viewedAt), 'dd MMM HH:mm')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right">
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          £{proposal.total?.toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {proposal.paymentFrequency?.toLowerCase()}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className={`text-sm ${isExpired ? 'text-red-600 dark:text-red-400 font-medium' : 'text-slate-600 dark:text-slate-400'}`}>
                          {proposal.validUntil && format(new Date(proposal.validUntil), 'dd MMM yyyy')}
                          {isExpired && proposal.status !== 'ACCEPTED' && proposal.status !== 'DECLINED' && (
                            <span className="ml-1 text-xs">(Expired)</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-1">
                          {/* View */}
                          <Link
                            to={`/proposals/${proposal.id}`}
                            className="p-1 text-blue-600 hover:text-blue-800"
                            title="View"
                          >
                            <EyeIcon className="h-5 w-5" />
                          </Link>
                          
                          {/* Edit - if draft, sent, viewed, or expired */}
                          {(proposal.status === 'DRAFT' || proposal.status === 'SENT' || proposal.status === 'VIEWED' || isExpired) && (
                            <Link
                              to={`/proposals/${proposal.id}/edit`}
                              className="p-1 text-slate-500 hover:text-slate-700"
                              title="Edit"
                            >
                              <PencilIcon className="h-5 w-5" />
                            </Link>
                          )}
                          
                          {/* Send Email */}
                          {proposal.status !== 'ACCEPTED' && proposal.status !== 'DECLINED' && !isExpired && (
                            <button
                              onClick={() => sendProposalEmail(proposal.id)}
                              className="p-1 text-slate-500 hover:text-blue-600"
                              title="Send Email"
                            >
                              <EnvelopeIcon className="h-5 w-5" />
                            </button>
                          )}
                          
                          {/* Generate/Copy Link */}
                          {proposal.status !== 'ACCEPTED' && proposal.status !== 'DECLINED' && !isExpired && (
                            <button
                              onClick={() => proposal.shareToken ? copyProposalLink(proposal.shareToken) : generateShareLink(proposal)}
                              className={`p-1 ${proposal.shareToken ? 'text-green-600 hover:text-green-700' : 'text-slate-500 hover:text-green-600'}`}
                              title={proposal.shareToken ? 'Copy Link' : 'Generate Share Link'}
                            >
                              <LinkIcon className="h-5 w-5" />
                            </button>
                          )}
                          
                          {/* Duplicate/Resubmit */}
                          <button
                            onClick={() => duplicateProposal(proposal)}
                            className="p-1 text-slate-500 hover:text-purple-600"
                            title={isExpired ? "Resubmit" : "Duplicate"}
                          >
                            <DocumentDuplicateIcon className="h-5 w-5" />
                          </button>
                          
                          {/* Create Renewal - for accepted proposals */}
                          {proposal.status === 'ACCEPTED' && !proposal.isRenewal && (
                            <button
                              onClick={() => createRenewal(proposal.id)}
                              className="p-1 text-slate-500 hover:text-emerald-600"
                              title="Create Renewal"
                            >
                              <CheckCircleIcon className="h-5 w-5" />
                            </button>
                          )}
                          
                          {/* Download PDF */}
                          <button
                            onClick={() => downloadPDF(proposal.id, proposal.reference)}
                            className="p-1 text-slate-500 hover:text-slate-700"
                            title="Download PDF"
                          >
                            <ArrowDownTrayIcon className="h-5 w-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {meta.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div className="text-sm text-slate-600 dark:text-slate-400">
              Showing page {meta.page} of {meta.totalPages}
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setMeta({ ...meta, page: meta.page - 1 })}
                disabled={meta.page === 1}
                className="btn-secondary py-1.5 text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setMeta({ ...meta, page: meta.page + 1 })}
                disabled={meta.page === meta.totalPages}
                className="btn-secondary py-1.5 text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Proposals;
