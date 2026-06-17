import { Link } from 'react-router-dom';
import { ChevronRightIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  backTo?: { label: string; href: string };
  actions?: React.ReactNode;
}

const PageHeader = ({ title, description, breadcrumbs, backTo, actions }: PageHeaderProps) => {
  return (
    <header className="space-y-3 pb-1">
      {breadcrumbs && breadcrumbs.length > 1 && (
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm">
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;
            return (
              <span key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                {index > 0 && (
                  <ChevronRightIcon className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                )}
                {crumb.href && !isLast ? (
                  <Link
                    to={crumb.href}
                    className="text-slate-500 hover:text-primary-600 dark:text-slate-400 dark:hover:text-primary-400 transition-colors"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className={
                      isLast
                        ? 'font-medium text-slate-700 dark:text-slate-200'
                        : 'text-slate-500 dark:text-slate-400'
                    }
                  >
                    {crumb.label}
                  </span>
                )}
              </span>
            );
          })}
        </nav>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {backTo && (
            <Link
              to={backTo.href}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-primary-600 dark:text-slate-400 dark:hover:text-primary-400 mb-2 transition-colors"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              {backTo.label}
            </Link>
          )}
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 max-w-2xl">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </header>
  );
};

export default PageHeader;
