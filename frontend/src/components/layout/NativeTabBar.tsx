import { Link, useLocation } from 'react-router-dom';
import {
  HomeIcon,
  BriefcaseIcon,
  UsersIcon,
  DocumentTextIcon,
  InboxIcon,
} from '@heroicons/react/24/outline';
import { isNativeApp } from '../../lib/native';

const TABS = [
  { href: '/', label: 'Home', icon: HomeIcon, match: (p: string) => p === '/' },
  {
    href: '/jobs',
    label: 'Jobs',
    icon: BriefcaseIcon,
    match: (p: string) => p.startsWith('/jobs'),
  },
  {
    href: '/inbox',
    label: 'Inbox',
    icon: InboxIcon,
    match: (p: string) => p.startsWith('/inbox'),
  },
  {
    href: '/clients',
    label: 'Clients',
    icon: UsersIcon,
    match: (p: string) => p.startsWith('/clients'),
  },
  {
    href: '/proposals',
    label: 'Proposals',
    icon: DocumentTextIcon,
    match: (p: string) => p.startsWith('/proposals'),
  },
];

/**
 * Bottom tab bar for Capacitor native shells (staff). Hidden on web.
 */
export default function NativeTabBar() {
  const { pathname } = useLocation();
  if (!isNativeApp()) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200/90 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/95 lg:hidden"
      aria-label="Primary mobile"
    >
      <ul className="flex items-stretch justify-around px-1 pt-1">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                to={tab.href}
                className={`flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-semibold ${
                  active
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="h-6 w-6" />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
