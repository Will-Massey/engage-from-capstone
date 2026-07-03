import { Link } from 'react-router-dom';
import {
  SparklesIcon,
  CommandLineIcon,
  UserPlusIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline';
import { useCommandPaletteStore } from '../../stores/commandPaletteStore';

const QuickStart = () => {
  const openCommandPalette = useCommandPaletteStore((s) => s.open);

  return (
    <section
      className="card p-5 sm:p-6 border border-violet-200/60 dark:border-violet-800/40 bg-gradient-to-br from-violet-50/80 via-white to-indigo-50/50 dark:from-violet-950/30 dark:via-slate-900/60 dark:to-indigo-950/20"
      aria-labelledby="quick-start-heading"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
        <div>
          <h2 id="quick-start-heading" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Get your first proposal out the door
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Clara walks you through client, services, pricing, and send — in about five minutes
          </p>
        </div>
        <button
          type="button"
          onClick={openCommandPalette}
          className="inline-flex items-center gap-2 self-start px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 bg-slate-100/80 dark:bg-slate-800/80 rounded-lg hover:bg-slate-200/80 dark:hover:bg-slate-700/80 transition-colors"
        >
          <CommandLineIcon className="h-4 w-4" />
          <span>
            Jump anywhere <kbd className="ml-1 font-mono text-xs opacity-80">Ctrl+K</kbd>
          </span>
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-stretch">
        <Link
          to="/proposals/wizard"
          className="flex-1 group rounded-xl border-2 border-violet-400/70 dark:border-violet-600/60 bg-gradient-to-r from-violet-600 to-indigo-600 p-5 text-white shadow-lg hover:from-violet-700 hover:to-indigo-700 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-white/20">
              <SparklesIcon className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold text-lg">Create proposal in 5 minutes</p>
              <p className="text-sm text-violet-100 mt-0.5">
                Client → Clara services → pricing → email → send
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm font-medium text-white/90 group-hover:translate-x-1 transition-transform inline-block">
            Start wizard →
          </p>
        </Link>

        <div className="flex flex-col gap-3 sm:w-56 shrink-0">
          <Link
            to="/clients/new"
            className="flex items-center gap-2 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/30 p-3 text-sm font-medium text-slate-700 dark:text-slate-200 hover:border-primary-300 transition-colors"
          >
            <UserPlusIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            Add a client first
          </Link>
          <Link
            to="/proposals"
            className="flex items-center gap-2 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/30 p-3 text-sm font-medium text-slate-700 dark:text-slate-200 hover:border-primary-300 transition-colors"
          >
            <PaperAirplaneIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            View sent proposals
          </Link>
        </div>
      </div>
    </section>
  );
};

export default QuickStart;