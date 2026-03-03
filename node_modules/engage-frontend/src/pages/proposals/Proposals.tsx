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
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { useAuthStore } from '../../stores/authStore';
import { format } from 'date-fns';

// Prevent tree-shaking of DocumentTextIcon
const _iconRef = DocumentTextIcon;
const statusColors: Record<string, string> = {
  DRAFT: 'badge-gray',
  PENDING_REVIEW: 'badge-yellow',
  SENT: 'badge-blue',
  VIEWED: 'badge-blue',
  ACCEPTED: 'badge-green',
  DECLINED: 'badge-red',
  EXPIRED: 'badge-red',
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
      console.error('Failed to load proposals', error);
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
      const blob = await apiClient.downloadProposalPDF(id) as Blob;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `proposal-${reference}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download PDF', error);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Proposals</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your client proposals and track their status
          </p>
        </div>
        <Link
          to="/proposals/new"
          className="btn-primary inline-flex"
          style={{ backgroundColor: tenant?.primaryColor || '#0ea5e9' }}
        >
          <PlusIcon className="h-5 w-5 mr-2" />
          Create Proposal
        </Link>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <form onSubmit={handleSearch} className="flex-1">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field pl-10"
                placeholder="Search proposals, clients, or references..."
              />
            </div>
          </form>

          <div className="flex items-center space-x-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input-field w-40"
            >
              <option value="">All Status</option>
              <option value="DRAFT">Draft</option>
              <option value="SENT">Sent</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="DECLINED">Declined</option>
              <option value="EXPIRED">Expired</option>
            </select>

            <button
              onClick={loadProposals}
              className="btn-secondary"
            >
              <FunnelIcon className="h-4 w-4 mr-1" />
              Filter
            </button>
          </div>
        </div>
      </div>

      {/* Proposals table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : proposals.length === 0 ? (
          <div className="text-center py-16">
            <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-300" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No proposals found</h3>
            <p className="mt-2 text-sm text-gray-500">
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
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Proposal
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Client
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {proposals.map((proposal) => (
                  <tr key={proposal.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <Link
                          to={`/proposals/${proposal.id}`}
                          className="text-sm font-medium text-gray-900 hover:text-primary-600"
                        >
                          {proposal.title}
                        </Link>
                        <p className="text-xs text-gray-500">{proposal.reference}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{proposal.client?.name}</div>
                      <div className="text-xs text-gray-500">
                        {proposal.client?.companyType?.replace(/_/g, ' ')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`badge ${statusColors[proposal.status] || 'badge-gray'}`}>
                        {proposal.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm font-medium text-gray-900">
                        £{proposal.total?.toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500">
                        {proposal.paymentFrequency?.toLowerCase()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {proposal.createdAt && format(new Date(proposal.createdAt), 'dd MMM yyyy')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <Link
                          to={`/proposals/${proposal.id}`}
                          className="text-primary-600 hover:text-primary-900"
                        >
                          <EyeIcon className="h-5 w-5" />
                        </Link>
                        <button
                          onClick={() => downloadPDF(proposal.id, proposal.reference)}
                          className="text-gray-400 hover:text-gray-600"
                          title="Download PDF"
                        >
                          <ArrowDownTrayIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {meta.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Showing page {meta.page} of {meta.totalPages}
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setMeta({ ...meta, page: meta.page - 1 })}
                disabled={meta.page === 1}
                className="btn-secondary py-1.5 px-3 text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setMeta({ ...meta, page: meta.page + 1 })}
                disabled={meta.page === meta.totalPages}
                className="btn-secondary py-1.5 px-3 text-sm disabled:opacity-50"
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
