import { Link } from 'react-router-dom';

interface LegalPageLayoutProps {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}

const legalLinks = [
  { to: '/legal/terms', label: 'Terms of Service' },
  { to: '/legal/privacy', label: 'Privacy Policy' },
  { to: '/legal/ai-disclosure', label: 'AI Disclosure' },
];

export default function LegalPageLayout({ title, lastUpdated, children }: LegalPageLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between gap-4">
          <Link to="/" className="text-sm font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400">
            Engage by Capstone
          </Link>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            {legalLinks.map((link) => (
              <Link key={link.to} to={link.to} className="hover:text-slate-700 dark:hover:text-slate-200">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Legal</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-2">{title}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-10">Last updated: {lastUpdated}</p>
        <div className="space-y-6 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">{children}</div>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center text-xs text-slate-500 dark:text-slate-400 space-y-2">
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            {legalLinks.map((link) => (
              <Link key={link.to} to={link.to} className="hover:text-slate-700 dark:hover:text-slate-200">
                {link.label}
              </Link>
            ))}
          </div>
          <p>&copy; {new Date().getFullYear()} Capstone Software Ltd. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

export function LegalFooterLinks({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400 ${className}`}>
      {legalLinks.map((link, i) => (
        <span key={link.to} className="inline-flex items-center gap-3">
          {i > 0 && <span aria-hidden="true">&middot;</span>}
          <Link to={link.to} className="hover:text-slate-700 dark:hover:text-slate-200 underline-offset-2 hover:underline">
            {link.label}
          </Link>
        </span>
      ))}
    </div>
  );
}