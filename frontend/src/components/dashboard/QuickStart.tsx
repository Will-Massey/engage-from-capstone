import { Link } from 'react-router-dom';
import {
  UserPlusIcon,
  DocumentPlusIcon,
  PaperAirplaneIcon,
  CommandLineIcon,
} from '@heroicons/react/24/outline';
import { useCommandPaletteStore } from '../../stores/commandPaletteStore';

const steps = [
  {
    step: 1,
    title: 'Add a client',
    description: 'Capture company details and MTD ITSA eligibility',
    href: '/clients/new',
    icon: UserPlusIcon,
    cta: 'Add client',
  },
  {
    step: 2,
    title: 'Create a proposal',
    description: 'Pick services, set fees, and tailor your engagement letter',
    href: '/proposals/new',
    icon: DocumentPlusIcon,
    cta: 'New proposal',
  },
  {
    step: 3,
    title: 'Send for signature',
    description: 'Email the link or share a secure client portal URL',
    href: '/proposals',
    icon: PaperAirplaneIcon,
    cta: 'View proposals',
  },
];

const QuickStart = () => {
  const openCommandPalette = useCommandPaletteStore((s) => s.open);

  return (
    <section
      className="card p-5 sm:p-6"
      aria-labelledby="quick-start-heading"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <h2 id="quick-start-heading" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Quick start
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Three steps from new client to signed engagement
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

      <ol className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {steps.map((item) => (
          <li
            key={item.step}
            className="relative rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/30 p-4 flex flex-col"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary-500/10 text-primary-700 dark:text-primary-300 text-sm font-semibold mb-3">
              {item.step}
            </span>
            <item.icon className="h-6 w-6 text-primary-600 dark:text-primary-400 mb-2" aria-hidden />
            <h3 className="font-medium text-slate-900 dark:text-slate-100">{item.title}</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 flex-1">{item.description}</p>
            <Link
              to={item.href}
              className="mt-4 text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
            >
              {item.cta} →
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
};

export default QuickStart;
