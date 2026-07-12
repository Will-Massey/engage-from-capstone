// Cache-bust: 2026-03-03T09:00:00Z - Force rebuild v6
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  EyeIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  ClockIcon,
  LinkIcon,
  EnvelopeIcon,
  PencilIcon,
  DocumentDuplicateIcon,
  ExclamationTriangleIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { appPath } from '../../utils/appBase';
import { formatCurrency } from '../../utils/formatters';
import { useAuthStore } from '../../stores/authStore';
import { format, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { EmptyProposals } from '../../components/empty-states/EmptyStates';
import { SkeletonCard } from '../../components/skeleton/SkeletonCard';

// Prevent tree-shaking
const _iconRefs = [DocumentTextIcon, CheckCircleIcon, ClockIcon];
// Icons loaded successfully

const statusColors: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  SENT: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200',
  VIEWED: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200',
  ACCEPTED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-200',
  DECLINED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200',
  EXPIRED: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-200',
  WITHDRAWN: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  ARCHIVED: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  LOST: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200',
};

const statusLabels: Record<string, string> = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  VIEWED: 'Viewed',
  ACCEPTED: 'Signed',
  DECLINED: 'Declined',
  EXPIRED: 'Expired',
  WITHDRAWN: 'Rescinded',
  ARCHIVED: 'Archived',
  LOST: 'Lost',
};

const Proposals = () => {
  const { tenant } = useAuthStore();
  const [searchParams] = useSearchParams();
  const [proposals, setProposals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });

  useEffect(() => {
    loadProposals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.page, statusFilter]);

  const loadProposals = async () => {
    try {
      setIsLoading(true);
      const response = (await apiClient.getProposals({
        page: meta.page,
        limit: 20,
        status: statusFilter && statusFilter !== 'AWAITING_APPROVAL' ? statusFilter : undefined,
        approvalStatus: statusFilter === 'AWAITING_APPROVAL' ? 'PENDING' : undefined,
        search: searchQuery || undefined,
      })) as any;

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
      const blob = await apiClient.downloadProposalPDF(id);
      toast.dismiss();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `proposal-${reference}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Delay revoke to give the browser time to start the download
      setTimeout(() => window.URL.revokeObjectURL(url), 5000);
      toast.success('PDF downloaded');
    } catch (error) {
      toast.dismiss();
      toast.error('Failed to download PDF');
    }
  };

  const sendProposalEmail = async (proposal: {
    id: string;
    client?: { contactEmail?: string };
  }) => {
    const to = proposal.client?.contactEmail?.trim();
    if (!to) {
      toast.error('Add a contact email on the client record before sending');
      return;
    }
    try {
      toast.loading('Sending proposal…');
      await apiClient.post(`/proposals/${proposal.id}/email`, { to, includePdf: true });
      toast.dismiss();
      toast.success('Proposal sent via email');
      loadProposals();
    } catch (error: any) {
      toast.dismiss();
      const message =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to send proposal';
      toast.error(message);
    }
  };

  const copyProposalLink = (shareToken: string) => {
    const link = `${window.location.origin}${appPath(`/proposals/view/${shareToken}`)}`;
    navigator.clipboard.writeText(link);
    toast.success('Proposal link copied to clipboard');
  };

  const generateShareLink = async (proposal: any) => {
    try {
      const response = (await apiClient.post(`/proposals/${proposal.id}/share`, {
        expiryDays: 30,
      })) as any;
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
      const response = (await apiClient.createProposal({
        clientId: proposal.clientId,
        title: `${proposal.title} (Copy)`,
        coverLetter: proposal.coverLetter,
        terms: proposal.terms,
        services: proposal.services.map((s: any) => ({
          serviceId: s.serviceTemplateId,
          quantity: s.quantity,
          displayPrice: s.displayPrice ?? s.unitPrice,
          billingFrequency: s.billingFrequency || s.frequency,
          discountPercent: s.discountPercent,
          vatRate: s.vatRate,
          ...(s.oneOffDueDate
            ? {
                oneOffDueDate:
                  typeof s.oneOffDueDate === 'string'
                    ? s.oneOffDueDate.slice(0, 10)
                    : new Date(s.oneOffDueDate).toISOString().slice(0, 10),
              }
            : {}),
        })),
      })) as any;

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
    const days = Math.ceil(
      (new Date(renewalDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );
    return days;
  };

  // Create renewal proposal
  const createRenewal = async (proposalId: string) => {
    try {
      const response = (await apiClient.post(`/proposals/${proposalId}/create-renewal`, {})) as any;
      if (response.success) {
        toast.success('Renewal proposal created');
        loadProposals();
      }
    } catch (error) {
      toast.error('Failed to create renewal');
    }
  };

  const exportCsv = () => {
    if (!proposals.length) return;
    const headers = ['reference', 'title', 'client', 'status', 'total', 'validUntil'];
    const rows = proposals.map((p) =>
      [
        p.reference,
        p.title,
        p.client?.name || '',
        p.status,
        p.total,
        p.validUntil ? new Date(p.validUntil).toISOString().slice(0, 10) : '',
      ]
        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `proposals-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Export downloaded');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-4 -mt-2">
        <Link to="/proposals/renewals" className="btn-secondary text-sm">
          <ArrowPathIcon className="h-4 w-4 mr-1.5" />
          Bulk renew
        </Link>
        {proposals.length > 0 && (
          <button type="button" onClick={exportCsv} className="btn-secondary text-sm">
            <ArrowDownTrayIcon className="h-4 w-4 mr-1.5" />
            Export CSV
          </button>
        )}
        <Link to="/proposals/wizard" className="btn-primary">
          <PlusIcon className="h-5 w-5 mr-2" />
          Create proposal in 5 minutes
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
              <option value="AWAITING_APPROVAL">Awaiting approval</option>
              <option value="SENT">Sent</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="DECLINED">Declined</option>
              <option value="WITHDRAWN">Rescinded</option>
              <option value="LOST">Lost</option>
              <option value="ARCHIVED">Archived</option>
              <option value="EXPIRED">Expired</option>
              <option value="RENEWALS_DUE">Renewals Due (30 days)</option>
            </select>

            <button onClick={loadProposals} className="btn-secondary">
              <FunnelIcon className="h-4 w-4 mr-1.5" />
              Filter
            </button>
          </div>
        </div>
      </div>

      {/* Proposals table - Glass Card */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <SkeletonCard count={6} />
        ) : proposals.length === 0 ? (
          <EmptyProposals />
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
                  const displayStatus =
                    isExpired &&
                    proposal.status !== 'ACCEPTED' &&
                    proposal.status !== 'DECLINED' &&
                    proposal.status !== 'WITHDRAWN'
                      ? 'EXPIRED'
                      : proposal.status;

                  return (
                    <tr
                      key={proposal.id}
                      data-testid="proposal-row"
                      data-proposal-title={proposal.title}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div>
                          <Link
                            to={`/proposals/${proposal.id}`}
                            className="text-sm font-medium text-slate-900 dark:text-slate-100 hover:text-primary-600 dark:hover:text-primary-400 truncate max-w-[200px] block"
                          >
                            {proposal.title}
                          </Link>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {proposal.reference}
                          </p>
                          {proposal.status !== 'DRAFT' && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {proposal.acceptedAt && (
                                <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                                  <PencilSquareIcon className="h-3 w-3" />
                                  Signed {format(new Date(proposal.acceptedAt), 'dd MMM')}
                                </span>
                              )}
                              {(proposal._count?.views || 0) > 0 && (
                                <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-200">
                                  <EyeIcon className="h-3 w-3" />
                                  {proposal._count.views}{' '}
                                  {proposal._count.views === 1 ? 'open' : 'opens'}
                                </span>
                              )}
                              {proposal.status === 'SENT' &&
                                (proposal._count?.views || 0) === 0 && (
                                  <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                                    Awaiting client
                                  </span>
                                )}
                              {((proposal._count?.views || 0) > 0 || proposal.acceptedAt) && (
                                <Link
                                  to={`/proposals/${proposal.id}?tab=audit`}
                                  className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-primary-700 hover:text-primary-900 dark:text-primary-300 dark:hover:text-primary-100 hover:underline"
                                >
                                  Audit trail
                                </Link>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm text-slate-900 dark:text-slate-100 truncate max-w-[180px]">
                          {proposal.client?.name}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {proposal.client?.companyType?.replace(/_/g, ' ')}
                        </div>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center space-x-1">
                            <span
                              className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[displayStatus] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}
                            >
                              {statusLabels[displayStatus] || displayStatus}
                            </span>
                            {proposal.status === 'ACCEPTED' && (
                              <CheckCircleIcon
                                className="h-4 w-4 text-green-500"
                                title="Accepted & signed"
                              />
                            )}
                          </div>
                          {proposal.status === 'DRAFT' && proposal.approvalStatus === 'PENDING' && (
                            <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                              Awaiting partner approval
                            </span>
                          )}
                          {proposal.status === 'DRAFT' &&
                            proposal.approvalStatus === 'REJECTED' && (
                              <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200">
                                Rejected
                              </span>
                            )}
                          {/* Renewal Badge */}
                          {proposal.status === 'ACCEPTED' &&
                            proposal.renewalDate &&
                            (() => {
                              const daysUntil = getDaysUntilRenewal(proposal.renewalDate);
                              if (daysUntil === null) return null;
                              if (daysUntil <= 0)
                                return (
                                  <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                                    Renewal overdue
                                  </span>
                                );
                              if (daysUntil <= 30)
                                return (
                                  <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                                    Renews in {daysUntil} days
                                  </span>
                                );
                              return (
                                <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">
                                  Renews in {daysUntil} days
                                </span>
                              );
                            })()}
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
                            <EyeIcon
                              className={`h-4 w-4 ${proposal._count?.views > 0 ? 'text-primary-500' : 'text-slate-400 dark:text-slate-500'}`}
                            />
                            <span
                              className={`text-sm ${proposal._count?.views > 0 ? 'text-primary-700 dark:text-primary-300 font-medium' : 'text-slate-700 dark:text-slate-300'}`}
                            >
                              {formatViewCount(proposal._count?.views || 0)}
                            </span>
                          </div>
                          {proposal.viewedAt && (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              Last:{' '}
                              {formatDistanceToNow(new Date(proposal.viewedAt), {
                                addSuffix: true,
                              })}
                            </span>
                          )}
                          {proposal.acceptedAt && (
                            <span className="text-xs text-emerald-600 dark:text-emerald-400">
                              Signed {format(new Date(proposal.acceptedAt), 'dd MMM HH:mm')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right">
                        <div className="text-sm font-semibold text-ink-900 dark:text-slate-100 tabular-nums">
                          {formatCurrency(proposal.total ?? 0)}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {proposal.paymentFrequency?.toLowerCase()}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div
                          className={`text-sm ${isExpired ? 'text-red-600 dark:text-red-400 font-medium' : 'text-slate-600 dark:text-slate-400'}`}
                        >
                          {proposal.validUntil &&
                            format(new Date(proposal.validUntil), 'dd MMM yyyy')}
                          {isExpired &&
                            proposal.status !== 'ACCEPTED' &&
                            proposal.status !== 'DECLINED' && (
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
                          {(proposal.status === 'DRAFT' ||
                            proposal.status === 'SENT' ||
                            proposal.status === 'VIEWED' ||
                            isExpired) && (
                            <Link
                              to={`/proposals/${proposal.id}/edit`}
                              className="p-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                              title="Edit"
                            >
                              <PencilIcon className="h-5 w-5" />
                            </Link>
                          )}

                          {/* Send Email */}
                          {proposal.status !== 'ACCEPTED' &&
                            proposal.status !== 'DECLINED' &&
                            !isExpired && (
                              <button
                                onClick={() => sendProposalEmail(proposal)}
                                className="p-1 text-slate-500 hover:text-blue-600"
                                title="Send Email"
                              >
                                <EnvelopeIcon className="h-5 w-5" />
                              </button>
                            )}

                          {/* Generate/Copy Link */}
                          {proposal.status !== 'ACCEPTED' &&
                            proposal.status !== 'DECLINED' &&
                            !isExpired && (
                              <button
                                data-testid="share-proposal-button"
                                onClick={() =>
                                  proposal.shareToken
                                    ? copyProposalLink(proposal.shareToken)
                                    : generateShareLink(proposal)
                                }
                                className={`p-1 ${proposal.shareToken ? 'text-primary-600 hover:text-primary-700' : 'text-slate-500 hover:text-primary-600'}`}
                                title={
                                  proposal.shareToken ? 'Copy client link' : 'Generate share link'
                                }
                              >
                                <LinkIcon className="h-5 w-5" />
                              </button>
                            )}

                          {/* Duplicate/Resubmit */}
                          <button
                            onClick={() => duplicateProposal(proposal)}
                            className="p-1 text-slate-500 hover:text-primary-600"
                            title={isExpired ? 'Resubmit' : 'Duplicate'}
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
