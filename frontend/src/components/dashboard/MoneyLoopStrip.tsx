import { Link } from 'react-router-dom';
import {
  CurrencyPoundIcon,
  DocumentTextIcon,
  BriefcaseIcon,
  ArrowPathIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';

/**
 * Quick-nav strip for the proposal -> job -> invoice -> cash path.
 */
export default function MoneyLoopStrip() {
  const steps = [
    {
      n: '1',
      label: 'Win',
      href: '/proposals/wizard',
      icon: DocumentTextIcon,
      hint: 'Wizard · CH · Clara',
    },
    {
      n: '2',
      label: 'Sign',
      href: '/proposals',
      icon: DocumentTextIcon,
      hint: 'E-sign · forensic cert',
    },
    {
      n: '3',
      label: 'Collect',
      href: '/analytics',
      icon: CurrencyPoundIcon,
      hint: 'Stripe · MRR · dunning',
    },
    {
      n: '4',
      label: 'Deliver',
      href: '/jobs',
      icon: BriefcaseIcon,
      hint: 'Board · time · margin',
    },
    {
      n: '5',
      label: 'Renew',
      href: '/proposals/renewals',
      icon: ArrowPathIcon,
      hint: 'Bulk renewals',
    },
  ];

  return (
    <section
      className="rounded-xl border border-slate-200/90 bg-white/90 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/50"
      aria-label="Money loop"
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-400">
            Money loop
          </p>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Win → sign → collect → deliver → renew
          </h2>
          <p className="text-xs text-slate-500">
            Jump to any stage, from winning the work to getting paid.
          </p>
        </div>
        <Link to="/analytics" className="btn-ghost btn-sm">
          <ChartBarIcon className="h-4 w-4" />
          Analytics
        </Link>
      </div>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {steps.map((s) => (
          <li key={s.n}>
            <Link to={s.href} className="path-tile !p-3 h-full flex-col items-start sm:flex-row">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-xs font-bold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                {s.n}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-900 dark:text-white">
                  {s.label}
                </span>
                <span className="block text-2xs text-slate-500">{s.hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
