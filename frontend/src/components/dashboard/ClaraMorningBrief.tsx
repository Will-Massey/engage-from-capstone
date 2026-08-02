import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  SparklesIcon,
  ArrowPathIcon,
  BriefcaseIcon,
  InboxIcon,
  DocumentTextIcon,
  CurrencyPoundIcon,
  AtSymbolIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { StatusChip } from '../ui/StatusChip';

type BriefAction = {
  id: string;
  priority: number;
  kind: string;
  title: string;
  detail: string;
  href: string;
  cta: string;
};

type MorningBrief = {
  generatedAt: string;
  greeting: string;
  summary: string;
  actions: BriefAction[];
  stats: {
    overdueJobs: number;
    helpNeeded: number;
    unreadMail: number;
    pendingForms: number;
    unsignedProposals: number;
    openMentions: number;
  };
};

function kindIcon(kind: string) {
  if (kind === 'mail') return InboxIcon;
  if (kind === 'form') return DocumentTextIcon;
  if (kind === 'money') return CurrencyPoundIcon;
  if (kind === 'mention') return AtSymbolIcon;
  if (kind === 'proposal') return DocumentTextIcon;
  return BriefcaseIcon;
}

function kindTone(kind: string): 'mint' | 'info' | 'warning' | 'danger' | 'neutral' {
  if (kind === 'mail') return 'info';
  if (kind === 'form') return 'warning';
  if (kind === 'money') return 'danger';
  if (kind === 'job') return 'mint';
  return 'neutral';
}

/**
 * Clara — “what should I do this morning?”
 */
export default function ClaraMorningBrief() {
  const [brief, setBrief] = useState<MorningBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await apiClient.get('/clara/morning-brief')) as any;
      setBrief(res?.data ?? res);
    } catch (e: any) {
      setError(e?.message || 'Could not load morning brief');
      setBrief(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading && !brief) {
    return (
      <div className="card space-y-3 border border-emerald-200/80 p-5 dark:border-emerald-900/40" aria-busy>
        <div className="skeleton h-5 w-48" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-16 w-full" />
        <div className="skeleton h-16 w-full" />
      </div>
    );
  }

  if (error && !brief) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
        Clara brief unavailable. <button type="button" className="underline" onClick={() => void load()}>Retry</button>
      </div>
    );
  }

  if (!brief) return null;

  const s = brief.stats;

  return (
    <section
      className="overflow-hidden rounded-xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50/90 via-white to-sky-50/40 shadow-sm dark:border-emerald-900/50 dark:from-emerald-950/30 dark:via-slate-900 dark:to-slate-900"
      aria-labelledby="clara-morning-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-emerald-100/80 px-5 py-4 dark:border-emerald-900/40">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-600/20">
            <SparklesIcon className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-400">
              Clara · morning brief
            </p>
            <h2
              id="clara-morning-heading"
              className="text-base font-bold text-slate-900 dark:text-white"
            >
              {brief.greeting} — here&apos;s your focus
            </h2>
            <p className="mt-0.5 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
              {brief.summary}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => void load()}
          disabled={loading}
        >
          <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-emerald-100/60 px-5 py-2.5 text-xs dark:border-emerald-900/30">
        {s.overdueJobs > 0 && (
          <StatusChip tone="danger">{s.overdueJobs} overdue</StatusChip>
        )}
        {s.helpNeeded > 0 && (
          <StatusChip tone="warning">{s.helpNeeded} help needed</StatusChip>
        )}
        {s.unreadMail > 0 && (
          <StatusChip tone="info">{s.unreadMail} unread mail</StatusChip>
        )}
        {s.pendingForms > 0 && (
          <StatusChip tone="warning">{s.pendingForms} forms pending</StatusChip>
        )}
        {s.unsignedProposals > 0 && (
          <StatusChip tone="mint">{s.unsignedProposals} unsigned</StatusChip>
        )}
        {s.openMentions > 0 && (
          <StatusChip tone="neutral">{s.openMentions} @mentions</StatusChip>
        )}
        {!s.overdueJobs &&
          !s.helpNeeded &&
          !s.unreadMail &&
          !s.pendingForms &&
          !s.unsignedProposals && (
            <StatusChip tone="success">Clear runway</StatusChip>
          )}
      </div>

      <ul className="divide-y divide-emerald-100/70 dark:divide-emerald-900/30">
        {brief.actions.length === 0 && (
          <li className="px-5 py-6 text-sm text-slate-500">
            Nothing urgent. Win work with a{' '}
            <Link to="/proposals/wizard" className="font-medium text-emerald-700 hover:underline">
              new proposal
            </Link>
            .
          </li>
        )}
        {brief.actions.map((a) => {
          const Icon = kindIcon(a.kind);
          return (
            <li key={a.id}>
              <Link
                to={a.href}
                className="flex items-start gap-3 px-5 py-3 transition hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-100 dark:bg-slate-800 dark:text-emerald-300 dark:ring-emerald-900">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusChip tone={kindTone(a.kind)}>{a.kind}</StatusChip>
                    <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {a.title}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500 line-clamp-2">
                    {a.detail}
                  </span>
                </span>
                <span className="shrink-0 self-center text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  {a.cta} →
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
