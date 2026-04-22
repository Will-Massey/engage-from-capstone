import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../../utils/api';
import { formatCurrency, formatDate } from '../../utils/formatters';
import toast from 'react-hot-toast';
import {
  DocumentTextIcon,
  CheckCircleIcon,
  ClockIcon,
  EyeIcon,
  XCircleIcon,
  ArrowRightIcon,
  BuildingOfficeIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline';

interface PortalProposal {
  id: string;
  reference: string;
  title: string;
  status: string;
  total: number;
  subtotal: number;
  vatAmount: number;
  discountAmount: number;
  validUntil: string;
  sentAt: string;
  viewedAt: string;
  acceptedAt: string;
  declinedAt: string;
  createdAt: string;
  services: Array<{
    id: string;
    name: string;
    description: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    vatRate: number;
    vatAmount: number;
    grossTotal: number;
    billingFrequency: string;
    priceDisplayMode: string;
  }>;
  shareToken: string;
  shareTokenExpiry: string;
  publicAccessEnabled: boolean;
}

interface PortalData {
  client: {
    id: string;
    name: string;
    contactName: string;
    contactEmail: string;
  };
  practice: {
    name: string;
    primaryColor: string;
    logo: string;
  };
  proposals: PortalProposal[];
}

const statusConfig: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  SENT: {
    label: 'Sent',
    icon: EnvelopeIcon,
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
  },
  VIEWED: {
    label: 'Viewed',
    icon: EyeIcon,
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
  },
  ACCEPTED: {
    label: 'Accepted',
    icon: CheckCircleIcon,
    color: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-50 dark:bg-green-900/20',
  },
  DECLINED: {
    label: 'Declined',
    icon: XCircleIcon,
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-900/20',
  },
  EXPIRED: {
    label: 'Expired',
    icon: ClockIcon,
    color: 'text-slate-600 dark:text-slate-400',
    bg: 'bg-slate-50 dark:bg-slate-900/20',
  },
};

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.SENT;
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.color}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {config.label}
    </span>
  );
}

function ProposalCard({ proposal, practiceName }: { proposal: PortalProposal; practiceName: string }) {
  const navigate = useNavigate();

  const canView = proposal.publicAccessEnabled && proposal.shareToken;
  const isActionable = proposal.status === 'SENT' || proposal.status === 'VIEWED';

  // Calculate monthly equivalent
  const monthlyEquivalent = proposal.services.reduce((sum: number, s) => {
    const freq = s.billingFrequency || 'MONTHLY';
    const gross = s.grossTotal || 0;
    if (freq === 'ONE_TIME') return sum;
    if (freq === 'WEEKLY') return sum + gross * (52 / 12);
    if (freq === 'MONTHLY') return sum + gross;
    if (freq === 'QUARTERLY') return sum + gross / 3;
    if (freq === 'ANNUALLY') return sum + gross / 12;
    return sum + gross;
  }, 0);

  const oneOffTotal = proposal.services.reduce((sum: number, s) => {
    const freq = s.billingFrequency || 'MONTHLY';
    const gross = s.grossTotal || 0;
    return freq === 'ONE_TIME' ? sum + gross : sum;
  }, 0);

  const handleView = () => {
    if (canView) {
      navigate(`/proposals/view/${proposal.shareToken}`);
    }
  };

  return (
    <div className="glass-card p-5 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">{proposal.title}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">{proposal.reference}</p>
        </div>
        <StatusBadge status={proposal.status} />
      </div>

      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
          {formatCurrency(monthlyEquivalent)}
        </span>
        <span className="text-sm text-slate-500 dark:text-slate-400">/month</span>
        {oneOffTotal > 0 && (
          <span className="text-sm text-slate-500 dark:text-slate-400 ml-2">
            + {formatCurrency(oneOffTotal)} one-off
          </span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
          <p>
            {proposal.services.length} service{proposal.services.length !== 1 ? 's' : ''}
          </p>
          <p>Valid until {formatDate(proposal.validUntil)}</p>
        </div>

        {canView && isActionable && (
          <button
            onClick={handleView}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            View & Sign
            <ArrowRightIcon className="h-4 w-4" />
          </button>
        )}

        {canView && !isActionable && (
          <button
            onClick={handleView}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-lg transition-colors"
          >
            View Details
            <ArrowRightIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function ClientPortal() {
  const { token } = useParams<{ token: string }>();
  const [portalData, setPortalData] = useState<PortalData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Invalid portal link');
      setIsLoading(false);
      return;
    }

    const loadPortal = async () => {
      try {
        const response = await apiClient.get(`/proposals/portal/${token}`);
        if (response.data.success) {
          setPortalData(response.data.data);
        } else {
          setError('Failed to load portal');
        }
      } catch (err: any) {
        setError(err.response?.data?.error?.message || 'Portal link not found or expired');
        toast.error('Portal link not found or expired');
      } finally {
        setIsLoading(false);
      }
    };

    loadPortal();
  }, [token]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !portalData) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="glass-card p-8 max-w-md w-full text-center">
          <ExclamationCircleIcon className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
            Portal Not Available
          </h1>
          <p className="text-slate-600 dark:text-slate-400">{error || 'This portal link is invalid or has expired.'}</p>
        </div>
      </div>
    );
  }

  const { client, practice, proposals } = portalData;

  const actionableCount = proposals.filter(
    (p) => p.status === 'SENT' || p.status === 'VIEWED'
  ).length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <header className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {practice.logo ? (
                <img src={practice.logo} alt={practice.name} className="h-10 w-auto" />
              ) : (
                <BuildingOfficeIcon className="h-8 w-8 text-primary-600" />
              )}
              <div>
                <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {practice.name}
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">Client Portal</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-slate-900 dark:text-white">{client.name}</p>
              {client.contactName && (
                <p className="text-xs text-slate-500 dark:text-slate-400">{client.contactName}</p>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="glass-tile p-4 text-center">
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{proposals.length}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Total Proposals</p>
          </div>
          <div className="glass-tile p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{actionableCount}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Awaiting Action</p>
          </div>
          <div className="glass-tile p-4 text-center">
            <p className="text-2xl font-bold text-green-600">
              {proposals.filter((p) => p.status === 'ACCEPTED').length}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Accepted</p>
          </div>
          <div className="glass-tile p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">
              {proposals.filter((p) => p.status === 'VIEWED').length}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Viewed</p>
          </div>
        </div>

        {/* Proposals List */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Your Proposals
          </h2>

          {proposals.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <DocumentTextIcon className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
                No proposals yet
              </h3>
              <p className="text-slate-500 dark:text-slate-400">
                You don&apos;t have any proposals to review at this time.
              </p>
            </div>
          ) : (
            proposals.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                practiceName={practice.name}
              />
            ))
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-700 mt-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <p className="text-center text-xs text-slate-500 dark:text-slate-400">
            Powered by{' '}
            <span className="font-medium text-primary-600">Engage by Capstone</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
