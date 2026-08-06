import { Link } from 'react-router-dom';
import {
  BriefcaseIcon,
  InboxIcon,
  DocumentPlusIcon,
  ExclamationTriangleIcon,
  UsersIcon,
  BoltIcon,
  ScaleIcon,
} from '@heroicons/react/24/outline';
import { PRIMARY_CREATE } from '../../config/navigation';

type Props = {
  overdueJobs?: number;
  openJobs?: number;
  inboxHint?: string;
};

/**
 * Single-hop paths from Home — the daily practice loop.
 * Path simplification: Jobs → Inbox → New proposal → Clients.
 */
export default function PracticeDayRail({
  overdueJobs = 0,
  openJobs = 0,
  inboxHint = 'Comms & portal',
}: Props) {
  const tiles = [
    {
      href: '/jobs',
      label: 'Jobs board',
      hint:
        overdueJobs > 0
          ? `${overdueJobs} overdue · ${openJobs} open`
          : openJobs > 0
            ? `${openJobs} open jobs`
            : 'Delivery board',
      icon: BriefcaseIcon,
      tone: overdueJobs > 0 ? 'rose' : 'mint',
      badge: overdueJobs > 0 ? overdueJobs : undefined,
    },
    {
      href: '/inbox',
      label: 'Firm inbox',
      hint: inboxHint,
      icon: InboxIcon,
      tone: 'sky',
    },
    {
      href: PRIMARY_CREATE.href,
      label: 'New proposal',
      hint: 'Guided wizard · ~5 min',
      icon: DocumentPlusIcon,
      tone: 'emerald',
      primary: true,
    },
    {
      href: '/clients',
      label: 'Clients',
      hint: 'Records · portal · SMS',
      icon: UsersIcon,
      tone: 'violet',
    },
    {
      href: '/automations',
      label: 'Automations',
      hint: 'Chase packs & rules',
      icon: BoltIcon,
      tone: 'amber',
    },
    {
      href: '/switch-from-engager',
      label: 'Partner kit',
      hint: 'Battle card · ROI · script',
      icon: ScaleIcon,
      tone: 'violet',
    },
  ] as const;

  return (
    <section aria-label="Today’s shortcuts" className="space-y-2">
      <div className="flex items-end justify-between gap-2 px-0.5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700/80 dark:text-emerald-400/90">
            Today
          </p>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Where do you need to go?
          </h2>
        </div>
        {overdueJobs > 0 && (
          <Link
            to="/jobs?filter=overdue"
            className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200/80 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800"
          >
            <ExclamationTriangleIcon className="h-3.5 w-3.5" />
            {overdueJobs} overdue
          </Link>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              to={t.href}
              className={`path-tile group relative overflow-hidden ${
                'primary' in t && t.primary
                  ? 'border-emerald-300/70 bg-gradient-to-br from-emerald-50/90 to-white dark:from-emerald-950/40 dark:to-slate-900 dark:border-emerald-800/50'
                  : ''
              }`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  t.tone === 'mint' || t.tone === 'emerald'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : t.tone === 'sky'
                      ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
                      : t.tone === 'rose'
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                        : t.tone === 'violet'
                          ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                    {t.label}
                  </span>
                  {'badge' in t && t.badge != null && t.badge > 0 && (
                    <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                      {t.badge > 99 ? '99+' : t.badge}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
                  {t.hint}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
