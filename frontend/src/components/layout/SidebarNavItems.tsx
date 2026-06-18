import { Link, NavLink } from 'react-router-dom';
import { PlusIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { NAV_SECTIONS, PRIMARY_CREATE, isNavItemActive, type NavItem } from '../../config/navigation';
import { useAiAssistantStore } from '../../stores/aiAssistantStore';
import { AI_COPILOT } from '../../config/aiCopilot';

interface SidebarNavItemsProps {
  pathname: string;
  onNavigate?: () => void;
}

const NavItemLink = ({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) => {
  const active = isNavItemActive(pathname, item);

  return (
    <NavLink
      to={item.href}
      end={item.href === '/'}
      onClick={onNavigate}
      title={item.description}
      className={`group flex items-center px-4 py-2.5 text-sm font-medium rounded-xl border transition-all duration-200 ${
        active
          ? 'text-primary-700 dark:text-primary-300 bg-primary-500/10 dark:bg-primary-500/20 border-primary-500/20 dark:border-primary-500/30'
          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 border-transparent'
      }`}
    >
      <item.icon
        className={`mr-3 h-5 w-5 flex-shrink-0 transition-colors ${
          active
            ? 'text-primary-600 dark:text-primary-400'
            : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'
        }`}
      />
      <span className="truncate">{item.name}</span>
    </NavLink>
  );
};

const SidebarNavItems = ({ pathname, onNavigate }: SidebarNavItemsProps) => {
  const openAi = useAiAssistantStore((s) => s.open);
  const aiConfigured = useAiAssistantStore((s) => s.configured);

  return (
    <div className="space-y-5">
      <Link
        to={PRIMARY_CREATE.href}
        onClick={onNavigate}
        className="mx-1 flex items-center justify-center gap-2 w-[calc(100%-0.5rem)] btn-primary py-3"
        data-tour="create-proposal"
      >
        <PlusIcon className="h-5 w-5" />
        {PRIMARY_CREATE.label}
      </Link>

      <button
        type="button"
        onClick={() => {
          openAi();
          onNavigate?.();
        }}
        className="mx-1 flex items-center justify-center gap-2 w-[calc(100%-0.5rem)] py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600/15 to-indigo-600/15 hover:from-violet-600/25 hover:to-indigo-600/25 border border-violet-400/40 text-violet-700 dark:text-violet-200 transition-all"
      >
        <SparklesIcon className="h-5 w-5" />
        {AI_COPILOT.name}
        <span
          className={`ml-auto h-2 w-2 rounded-full ${aiConfigured ? 'bg-emerald-500' : 'bg-amber-500'}`}
        />
      </button>

      {NAV_SECTIONS.map((section) => (
        <div key={section.id}>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-4 mb-2">
            {section.label}
          </p>
          <div className="space-y-0.5 px-1">
            {section.items.map((item) => (
              <NavItemLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default SidebarNavItems;
