import { Link } from 'react-router-dom';
import {
  SparklesIcon,
  CommandLineIcon,
  UserPlusIcon,
  BriefcaseIcon,
} from '@heroicons/react/24/outline';
import { useCommandPaletteStore } from '../../stores/commandPaletteStore';
import { PRIMARY_CREATE } from '../../config/navigation';

/**
 * First-run path simplification: one primary CTA (wizard), two optional branches.
 */
const QuickStart = () => {
  const openCommandPalette = useCommandPaletteStore((s) => s.open);

  return (
    <section
      className="card p-5 sm:p-6 border-emerald-200/70 dark:border-emerald-800/40 bg-gradient-to-br from-emerald-50/90 via-white to-sky-50/40 dark:from-emerald-950/25 dark:via-slate-900/60 dark:to-slate-900"
      aria-labelledby="quick-start-heading"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-400">
            Get started
          </p>
          <h2
            id="quick-start-heading"
            className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100"
          >
            Send your first proposal in about five minutes
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 max-w-xl">
            Client → services → price → send. Clara fills the heavy lifting; you stay in control.
          </p>
        </div>
        <button
          type="button"
          onClick={openCommandPalette}
          className="inline-flex min-h-10 items-center gap-2 self-start rounded-lg bg-white/80 dark:bg-slate-800/80 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 ring-1 ring-slate-200/80 dark:ring-slate-700 hover:ring-emerald-300 transition-colors cursor-pointer"
        >
          <CommandLineIcon className="h-4 w-4" aria-hidden />
          <span>
            Jump anywhere <kbd className="ml-1 font-mono text-[10px] opacity-80">Ctrl+K</kbd>
          </span>
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-stretch">
        <Link
          to={PRIMARY_CREATE.href}
          className="flex-1 group rounded-xl border border-emerald-700/20 bg-emerald-700 p-5 text-white shadow-lg shadow-emerald-700/20 hover:bg-emerald-600 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/15 p-2.5">
              <SparklesIcon className="h-6 w-6" aria-hidden />
            </div>
            <div>
              <p className="font-semibold text-lg">Start proposal wizard</p>
              <p className="text-sm text-emerald-50/90 mt-0.5">
                Shortest path from blank page to sent letter
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm font-medium text-white/95 group-hover:translate-x-0.5 transition-transform inline-block">
            Continue →
          </p>
        </Link>

        <div className="flex flex-col gap-2 sm:w-52 shrink-0">
          <Link
            to="/clients/new"
            className="path-tile !p-3 text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            <UserPlusIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <span>Add a client first</span>
          </Link>
          <Link
            to="/jobs"
            className="path-tile !p-3 text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            <BriefcaseIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <span>Skip to jobs board</span>
          </Link>
        </div>
      </div>
    </section>
  );
};

export default QuickStart;
