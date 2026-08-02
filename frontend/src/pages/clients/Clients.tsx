import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  BuildingOfficeIcon,
  UserIcon,
  UsersIcon,
  HomeIcon,
  ClockIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { SkeletonCard } from '../../components/skeleton/SkeletonCard';
import { EmptyClients } from '../../components/empty-states/EmptyStates';

const Clients = () => {
  const [clients, setClients] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStage, setSelectedStage] = useState<string>('');
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });

  useEffect(() => {
    loadClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.page, selectedStage]);

  const loadClients = async () => {
    try {
      setIsLoading(true);
      const response = (await apiClient.getClients({
        page: meta.page,
        limit: 20,
        search: searchQuery || undefined,
        ...(selectedStage ? { lifecycleStage: selectedStage } : {}),
      })) as any;

      setClients(response.data || []);
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
    loadClients();
  };

  const setStageFilter = (stage: string) => {
    const newStage = selectedStage === stage ? '' : stage;
    setSelectedStage(newStage);
    setMeta({ ...meta, page: 1 });
  };

  const getCompanyTypeIcon = (type: string) => {
    switch (type) {
      case 'LIMITED_COMPANY':
        return <BuildingOfficeIcon className="h-5 w-5 text-blue-500" />;
      case 'SOLE_TRADER':
        return <UserIcon className="h-5 w-5 text-green-500" />;
      case 'PARTNERSHIP':
        return <UsersIcon className="h-5 w-5 text-primary-500" />;
      case 'LLP':
        return <BuildingOfficeIcon className="h-5 w-5 text-primary-500" />;
      case 'CHARITY':
      case 'NON_PROFIT':
        return <HomeIcon className="h-5 w-5 text-pink-500" />;
      default:
        return <BuildingOfficeIcon className="h-5 w-5 text-slate-400" />;
    }
  };

  // Lightweight lifecycle stage badge for cards (makes the automation visible at a glance)
  const getLifecycleBadge = (stage?: string) => {
    if (!stage) return null;
    const label = stage.replace(/_/g, ' ');
    const cls = /AML|RECEIVED|COMPLETE|PROPOSAL_ACCEPTED/.test(stage)
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
      : stage === 'PROSPECT'
        ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
        : /INFO/.test(stage)
          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
          : /ENGAGEMENT/.test(stage)
            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
            : /ONBOARD|KICKOFF/.test(stage)
              ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
              : /MILESTONE|REVIEW/.test(stage)
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';

    return (
      <span
        className={`ml-2 inline-flex items-center px-2 py-px rounded-full text-[10px] font-medium ${cls}`}
      >
        {label}
      </span>
    );
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-slate-500 max-w-md">
          Search, filter by lifecycle, open a client for jobs · portal · comms.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/clients/import" className="btn-secondary btn-sm inline-flex items-center">
            <ArrowUpTrayIcon className="h-4 w-4 mr-1.5" aria-hidden />
            Import
          </Link>
          <Link to="/clients/new" className="btn-primary btn-sm inline-flex items-center">
            <PlusIcon className="h-4 w-4 mr-1.5" aria-hidden />
            Add client
          </Link>
        </div>
      </div>

      {/* Quiet compliance note — not a full-bleed blue shout */}
      <div className="flex gap-3 rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
        <ClockIcon className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <p>
          <span className="font-semibold">MTD ITSA:</span> sole traders & partnerships over £50k
          income need digital records. Ltd cos / LLPs / charities are out of scope.
        </p>
      </div>

      {/* Search */}
      <div className="card p-3 sm:p-4">
        <form onSubmit={handleSearch} className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MagnifyingGlassIcon className="h-5 w-5 text-slate-400" aria-hidden />
          </div>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field w-full pl-10"
            placeholder="Search name, email, company number…"
            aria-label="Search clients"
          />
        </form>
      </div>

      {/* Lifecycle Stage Filters - beautiful pills for intuitiveness */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'All', value: '' },
          { label: 'Needs Attention', value: 'ATTENTION' }, // special
          { label: 'AML Pending', value: 'AML_PENDING' },
          { label: 'Info Requested', value: 'INFO_REQUESTED' },
          { label: 'Engagement', value: 'ENGAGEMENT_LETTER_SENT' },
          { label: 'Onboarding', value: 'KICKOFF_SENT' },
          { label: 'Live', value: 'ONGOING' },
        ].map((opt) => {
          const isActive =
            opt.value === ''
              ? !selectedStage
              : selectedStage === opt.value ||
                (opt.value === 'ATTENTION' &&
                  ['AML_PENDING', 'INFO_REQUESTED'].includes(selectedStage));
          return (
            <button
              key={opt.value || 'all'}
              onClick={() => {
                if (opt.value === 'ATTENTION') {
                  // toggle attention group - pick first or clear
                  setStageFilter(
                    selectedStage && ['AML_PENDING', 'INFO_REQUESTED'].includes(selectedStage)
                      ? ''
                      : 'AML_PENDING'
                  );
                } else {
                  setStageFilter(opt.value);
                }
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                isActive
                  ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                  : 'bg-white/70 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-primary-300 text-slate-600 dark:text-slate-300'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
        {selectedStage && (
          <button
            onClick={() => setStageFilter('')}
            className="text-xs px-2 py-1 text-slate-500 hover:text-slate-700"
          >
            Clear filter
          </button>
        )}
      </div>

      {/* Clients grid */}
      {isLoading ? (
        <SkeletonCard count={6} />
      ) : clients.length === 0 ? (
        <EmptyClients />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((client) => (
            <Link
              key={client.id}
              to={`/clients/${client.id}`}
              className="card p-5 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center">
                  <div className="p-2 bg-emerald-50 rounded-lg dark:bg-emerald-950/40">
                    {getCompanyTypeIcon(client.companyType)}
                  </div>
                  <div className="ml-3">
                    <div className="flex items-center">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        {client.name}
                      </h3>
                      {getLifecycleBadge(client.lifecycleStage)}
                    </div>
                    <p className="text-xs text-slate-500">
                      {client.companyType?.replace(/_/g, ' ')}
                    </p>
                  </div>
                </div>
                {client.mtditsaEligible && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                    MTD ITSA
                  </span>
                )}
              </div>

              <div className="mt-4 space-y-1">
                <p className="text-sm text-slate-700 font-medium dark:text-slate-200">
                  {client.contactEmail}
                </p>
                {client.contactPhone && (
                  <p className="text-sm text-slate-600 dark:text-slate-400">{client.contactPhone}</p>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-sm">
                <span className="text-slate-500">
                  {client._count?.proposals || 0} proposals
                  {typeof client._count?.jobs === 'number' && client._count.jobs > 0 && (
                    <span className="ml-2 font-medium text-emerald-700 dark:text-emerald-400">
                      · {client._count.jobs} jobs
                    </span>
                  )}
                </span>
                {client.turnover && (
                  <span className="text-slate-900 dark:text-white font-semibold tabular-nums">
                    £{(client.turnover / 1000).toFixed(0)}k turnover
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
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
  );
};

export default Clients;
