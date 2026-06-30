import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  DocumentTextIcon,
  UsersIcon,
  BuildingOfficeIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  InboxIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: {
    label: string;
    to: string;
    onClick?: () => void;
  };
  icon?: 'proposals' | 'clients' | 'services' | 'search' | 'inbox';
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  claraTip?: string;
  context?: string; // e.g. 'clients' | 'proposals' to fetch live Clara tip
}

const icons = {
  proposals: DocumentTextIcon,
  clients: UsersIcon,
  services: BuildingOfficeIcon,
  search: MagnifyingGlassIcon,
  inbox: InboxIcon,
};

export const EmptyState = ({
  title,
  description,
  action,
  icon = 'inbox',
  secondaryAction,
  claraTip,
  context,
}: EmptyStateProps) => {
  const Icon = icons[icon];
  const [liveTip, setLiveTip] = useState<string | null>(null);
  const [tipLoading, setTipLoading] = useState(false);

  useEffect(() => {
    if (!context) return;
    const cacheKey = `clara-empty-tip-${context}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      setLiveTip(cached);
      return;
    }
    setTipLoading(true);
    (apiClient as any)
      .aiEmptySuggestion(context)
      .then((res: any) => {
        const tip = res?.data?.tip || res?.tip;
        if (tip && typeof tip === 'string' && tip.length > 5) {
          sessionStorage.setItem(cacheKey, tip);
          setLiveTip(tip);
        }
      })
      .catch(() => {
        // silent fallback to static claraTip
      })
      .finally(() => setTipLoading(false));
  }, [context]);

  const displayedTip = liveTip || claraTip;

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 animate-fade-in">
      <div className="glass-tile p-12 text-center max-w-md">
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-400/20 to-primary-600/20 rounded-full blur-xl" />
          <div className="relative p-4 bg-white/50 rounded-full inline-block">
            <Icon className="h-16 w-16 text-slate-400" />
          </div>
        </div>

        <h3 className="text-xl font-semibold text-slate-900 mb-2">{title}</h3>
        <p className="text-slate-600 mb-6">{description}</p>

        {displayedTip && (
          <div className="mb-6 p-3 rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-900 text-left">
            <div className="text-xs font-medium text-violet-600 dark:text-violet-400 mb-1">Clara suggests</div>
            <div className="text-sm text-slate-700 dark:text-slate-300">{displayedTip}</div>
          </div>
        )}
        {tipLoading && !displayedTip && (
          <div className="mb-6 p-3 rounded-lg bg-violet-50/50 dark:bg-violet-950/20 border border-violet-100/50 text-left">
            <div className="text-xs font-medium text-violet-600 dark:text-violet-400 mb-1">Clara suggests</div>
            <div className="text-sm text-slate-500 italic">Thinking of a tip...</div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {action && (
            <Link
              to={action.to}
              onClick={action.onClick}
              className="btn-primary inline-flex justify-center"
            >
              <PlusIcon className="h-5 w-5 mr-2" />
              {action.label}
            </Link>
          )}
          {secondaryAction && (
            <button onClick={secondaryAction.onClick} className="btn-secondary">
              {secondaryAction.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Preset empty states for common use cases
export const EmptyProposals = ({ onCreate }: { onCreate?: () => void }) => (
  <EmptyState
    icon="proposals"
    title="No proposals yet"
    description="Create your first proposal to start winning clients."
    claraTip="Start with a standard limited company annual accounts + tax compliance proposal. Add MTD ITSA if they have trading income over the threshold."
    context="proposals"
    action={{ label: 'Create Proposal', to: '/proposals/new', onClick: onCreate }}
  />
);

export const EmptyClients = () => (
  <EmptyState
    icon="clients"
    title="No clients yet"
    description="Add your first client to get started with proposals."
    claraTip="Add a typical client (e.g. limited company with £200k–£500k turnover) — Clara can then auto-suggest services and draft the cover letter."
    context="clients"
    action={{ label: 'Add Client', to: '/clients/new' }}
  />
);

export const EmptyServices = () => (
  <EmptyState
    icon="services"
    title="No services found"
    description="Your service catalog is empty. Add services to include in proposals."
    context="services"
    action={{ label: 'Add Service', to: '/services' }}
  />
);

export const EmptySearchResults = ({ onClear }: { onClear: () => void }) => (
  <EmptyState
    icon="search"
    title="No results found"
    description="Try adjusting your search terms or filters."
    secondaryAction={{ label: 'Clear Search', onClick: onClear }}
  />
);

export const EmptyInbox = () => (
  <EmptyState icon="inbox" title="All caught up" description="No new notifications or messages." />
);

export default EmptyState;
