import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  actionTo?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  secondaryTo?: string;
}

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionTo,
  onAction,
  secondaryLabel,
  secondaryTo,
}: EmptyStateProps) {
  return (
    <div className="glass-tile p-10 text-center max-w-lg mx-auto animate-fade-in">
      {icon && (
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-300">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{description}</p>
      <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
        {actionLabel && actionTo && (
          <Link to={actionTo} className="btn-primary text-sm">
            {actionLabel}
          </Link>
        )}
        {actionLabel && onAction && !actionTo && (
          <button type="button" onClick={onAction} className="btn-primary text-sm">
            {actionLabel}
          </button>
        )}
        {secondaryLabel && secondaryTo && (
          <Link to={secondaryTo} className="btn-secondary text-sm">
            {secondaryLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
