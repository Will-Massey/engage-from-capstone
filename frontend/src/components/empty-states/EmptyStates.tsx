import { Link } from 'react-router-dom';
import {
  DocumentTextIcon,
  UsersIcon,
  BuildingOfficeIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  InboxIcon,
} from '@heroicons/react/24/outline';
import ClaraEmptyTip from '../ai/ClaraEmptyTip';

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
  context?: 'clients' | 'proposals' | 'services' | 'general';
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

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 animate-fade-in">
      <div className="glass-tile p-12 text-center max-w-md">
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-400/20 to-primary-600/20 rounded-full blur-xl" />
          <div className="relative p-4 bg-white/50 dark:bg-slate-800/50 rounded-full inline-block">
            <Icon className="h-16 w-16 text-slate-400 dark:text-slate-500" />
          </div>
        </div>

        <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">{title}</h3>
        <p className="text-slate-600 dark:text-slate-400 mb-6">{description}</p>

        {context && (
          <ClaraEmptyTip context={context} fallback={claraTip} className="mb-6" />
        )}
        {!context && claraTip && (
          <ClaraEmptyTip context="general" fallback={claraTip} className="mb-6" />
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

export const EmptyProposals = ({ onCreate }: { onCreate?: () => void }) => (
  <EmptyState
    icon="proposals"
    title="No proposals yet"
    description="Create your first proposal to start winning clients."
    claraTip="Use the 5-minute wizard — Clara will suggest services, check MTD fit, and draft your send email."
    context="proposals"
    action={{ label: 'Create proposal in 5 minutes', to: '/proposals/wizard', onClick: onCreate }}
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
    claraTip="Seed your catalog with UK accountancy staples — annual accounts, corporation tax, and MTD ITSA if you serve sole traders."
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