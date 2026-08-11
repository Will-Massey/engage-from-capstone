import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { PlusIcon, SparklesIcon } from '@heroicons/react/24/outline';
import {
  NAV_SECTIONS,
  PRIMARY_CREATE,
  isNavItemActive,
  type NavItem,
} from '../../config/navigation';
import { useAiAssistantStore } from '../../stores/aiAssistantStore';
import { useAuthStore } from '../../stores/authStore';
import { apiClient } from '../../utils/api';
import { AI_COPILOT } from '../../config/aiCopilot';
import { canViewNavItem, isApprover } from '../../constants/roles';

interface SidebarNavItemsProps {
  pathname: string;
  onNavigate?: () => void;
}

const NavItemLink = ({
  item,
  pathname,
  onNavigate,
  badge,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
  badge?: number;
}) => {
  const active = isNavItemActive(pathname, item);

  return (
    <NavLink
      to={item.href}
      end={item.href === '/'}
      onClick={onNavigate}
      title={item.description}
      className={`group flex items-center min-h-[2.5rem] px-3 py-2 text-sm font-medium rounded-xl border transition-colors duration-150 cursor-pointer ${
        active
          ? 'text-emerald-800 dark:text-emerald-200 bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500/25 dark:border-emerald-500/30 shadow-sm'
          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800/50 border-transparent'
      }`}
    >
      <item.icon
        className={`mr-2.5 h-5 w-5 flex-shrink-0 transition-colors ${
          active
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'
        }`}
        aria-hidden
      />
      <span className="truncate flex-1">{item.name}</span>
      {badge != null && badge > 0 && (
        <span
          className={`ml-2 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white ${
            item.href === '/jobs' ? 'bg-rose-500' : 'bg-amber-500'
          }`}
          aria-label={`${badge} pending`}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  );
};

const SidebarNavItems = ({ pathname, onNavigate }: SidebarNavItemsProps) => {
  const openAi = useAiAssistantStore((s) => s.open);
  const aiConfigured = useAiAssistantStore((s) => s.configured);
  const user = useAuthStore((s) => s.user);
  const [approvalQueueCount, setApprovalQueueCount] = useState(0);
  const [jobsOverdueCount, setJobsOverdueCount] = useState(0);

  useEffect(() => {
    if (!isApprover(user?.role)) {
      setApprovalQueueCount(0);
      return;
    }

    let cancelled = false;

    const loadApprovalCount = async () => {
      try {
        const response = (await apiClient.getApprovalQueue({ page: 1, limit: 1 })) as {
          meta?: { total?: number };
        };
        if (!cancelled) {
          setApprovalQueueCount(response.meta?.total ?? 0);
        }
      } catch {
        if (!cancelled) {
          setApprovalQueueCount(0);
        }
      }
    };

    loadApprovalCount();
    const interval = window.setInterval(loadApprovalCount, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [user?.role]);

  useEffect(() => {
    let cancelled = false;
    const loadOverdue = async () => {
      try {
        const res = (await apiClient.get('/jobs/meta/pipeline')) as {
          data?: { overdueCount?: number };
          success?: boolean;
        };
        const n = res?.data?.overdueCount ?? 0;
        if (!cancelled) setJobsOverdueCount(typeof n === 'number' ? n : 0);
      } catch {
        if (!cancelled) setJobsOverdueCount(0);
      }
    };
    loadOverdue();
    const interval = window.setInterval(loadOverdue, 90_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="space-y-4">
      <Link
        to={PRIMARY_CREATE.href}
        onClick={onNavigate}
        className="mx-1 flex items-center justify-center gap-2 w-[calc(100%-0.5rem)] btn-primary py-3 shadow-md shadow-emerald-600/15"
        data-tour="create-proposal"
      >
        <PlusIcon className="h-5 w-5" aria-hidden />
        {PRIMARY_CREATE.label}
      </Link>

      <button
        type="button"
        onClick={() => {
          openAi();
          onNavigate?.();
        }}
        className="mx-1 flex min-h-[2.5rem] items-center justify-center gap-2 w-[calc(100%-0.5rem)] py-2.5 rounded-xl text-sm font-semibold cursor-pointer bg-gradient-to-r from-emerald-600/12 to-teal-500/10 hover:from-emerald-600/20 hover:to-teal-500/15 border border-emerald-400/35 text-emerald-800 dark:text-emerald-200 transition-colors"
      >
        <SparklesIcon className="h-5 w-5" aria-hidden />
        {AI_COPILOT.name}
        <span
          className={`ml-auto h-2 w-2 rounded-full ${aiConfigured ? 'bg-emerald-500' : 'bg-amber-500'}`}
          title={aiConfigured ? 'Clara ready' : 'Clara needs configuration'}
          aria-hidden
        />
      </button>

      {NAV_SECTIONS.map((section) => {
        const visibleItems = section.items.filter((item) => canViewNavItem(user?.role, item.roles));
        if (visibleItems.length === 0) return null;

        return (
          <div key={section.id}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500 px-3 mb-1.5">
              {section.label}
            </p>
            <div className="space-y-0.5 px-0.5">
              {visibleItems.map((item) => (
                <NavItemLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  onNavigate={onNavigate}
                  badge={
                    item.href === '/proposals'
                      ? approvalQueueCount
                      : item.href === '/jobs'
                        ? jobsOverdueCount
                        : undefined
                  }
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SidebarNavItems;
