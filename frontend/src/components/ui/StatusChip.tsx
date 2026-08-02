/* Helpers + components live together for the practice StatusChip kit */
/* eslint-disable react-refresh/only-export-components */
import type { HTMLAttributes, ReactNode } from 'react';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'mint' | 'violet';

const TONE: Record<StatusTone, string> = {
  neutral:
    'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600',
  info: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-800',
  success:
    'bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800',
  warning:
    'bg-amber-100 text-amber-950 border-amber-200 dark:bg-amber-950/50 dark:text-amber-100 dark:border-amber-800',
  danger:
    'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-800',
  mint: 'bg-teal-100 text-teal-900 border-teal-200 dark:bg-teal-950/50 dark:text-teal-100 dark:border-teal-800',
  violet:
    'bg-violet-100 text-violet-900 border-violet-200 dark:bg-violet-950/50 dark:text-violet-100 dark:border-violet-800',
};

/** Gradient fill for bars / rings by progress */
export function progressColor(pct: number): string {
  const c = Math.max(0, Math.min(100, pct));
  if (c >= 100) return '#10B981'; // emerald
  if (c >= 75) return '#14B8A6'; // teal
  if (c >= 50) return '#3B82F6'; // blue
  if (c >= 25) return '#F59E0B'; // amber
  if (c > 0) return '#F97316'; // orange
  return '#CBD5E1';
}

export function progressGradientClass(pct: number): string {
  const c = Math.max(0, Math.min(100, pct));
  if (c >= 100) return 'from-emerald-400 to-green-500';
  if (c >= 75) return 'from-teal-400 to-emerald-500';
  if (c >= 50) return 'from-sky-400 to-blue-500';
  if (c >= 25) return 'from-amber-400 to-orange-500';
  if (c > 0) return 'from-orange-400 to-rose-500';
  return 'from-slate-200 to-slate-300';
}

export function StatusChip({
  tone = 'neutral',
  className = '',
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: StatusTone }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide shadow-sm ${TONE[tone]} ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
}

export function MoneyPill({
  pence,
  className = '',
  emphasize,
}: {
  pence: number;
  className?: string;
  emphasize?: boolean;
}) {
  const pounds = (pence / 100).toLocaleString('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  });
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums border shadow-sm ${
        emphasize
          ? 'bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-900 border-emerald-200 dark:from-emerald-950/40 dark:to-teal-950/40 dark:text-emerald-100 dark:border-emerald-800'
          : 'bg-white text-slate-800 border-slate-200 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700'
      } ${className}`}
    >
      {pounds}
    </span>
  );
}

export function ProgressRing({
  pct,
  size = 28,
  stroke = 3,
  className = '',
  showLabel,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  className?: string;
  showLabel?: boolean;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = c - (clamped / 100) * c;
  const color = progressColor(clamped);

  return (
    <span className={`relative inline-flex items-center justify-center ${className}`}>
      <svg width={size} height={size} aria-label={`${clamped}% complete`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#E2E8F0"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      {showLabel && (
        <span
          className="absolute inset-0 flex items-center justify-center text-[9px] font-bold tabular-nums text-slate-700 dark:text-slate-200"
          style={{ fontSize: Math.max(8, size * 0.28) }}
        >
          {clamped}
        </span>
      )}
    </span>
  );
}

/** Horizontal completion bar with gradient fill */
export function ProgressBar({
  pct,
  className = '',
  height = 'h-2',
  showPct,
  label,
}: {
  pct: number;
  className?: string;
  height?: string;
  showPct?: boolean;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className={className}>
      {(label || showPct) && (
        <div className="mb-1 flex items-center justify-between gap-2 text-2xs font-medium text-slate-500">
          {label ? <span>{label}</span> : <span />}
          {showPct && (
            <span className="tabular-nums text-slate-700 dark:text-slate-300">{clamped}%</span>
          )}
        </div>
      )}
      <div
        className={`w-full overflow-hidden rounded-full bg-slate-100 shadow-inner dark:bg-slate-800 ${height}`}
      >
        <div
          className={`h-full rounded-full bg-gradient-to-r ${progressGradientClass(clamped)} transition-all duration-500 ease-out`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

/** Colourful KPI tile for dashboards / board headers */
export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
  icon,
  className = '',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: StatusTone;
  icon?: ReactNode;
  className?: string;
}) {
  const surface: Record<StatusTone, string> = {
    neutral: 'from-slate-50 to-white border-slate-200 dark:from-slate-900 dark:to-slate-800',
    info: 'from-sky-50 to-blue-50 border-sky-200 dark:from-sky-950/40 dark:to-blue-950/30 dark:border-sky-800',
    success:
      'from-emerald-50 to-teal-50 border-emerald-200 dark:from-emerald-950/40 dark:to-teal-950/30 dark:border-emerald-800',
    warning:
      'from-amber-50 to-orange-50 border-amber-200 dark:from-amber-950/40 dark:to-orange-950/30 dark:border-amber-800',
    danger:
      'from-rose-50 to-red-50 border-rose-200 dark:from-rose-950/40 dark:to-red-950/30 dark:border-rose-800',
    mint: 'from-teal-50 to-cyan-50 border-teal-200 dark:from-teal-950/40 dark:to-cyan-950/30 dark:border-teal-800',
    violet:
      'from-violet-50 to-fuchsia-50 border-violet-200 dark:from-violet-950/40 dark:to-fuchsia-950/30 dark:border-violet-800',
  };
  const iconBg: Record<StatusTone, string> = {
    neutral: 'bg-slate-200 text-slate-700',
    info: 'bg-sky-500 text-white',
    success: 'bg-emerald-500 text-white',
    warning: 'bg-amber-500 text-white',
    danger: 'bg-rose-500 text-white',
    mint: 'bg-teal-500 text-white',
    violet: 'bg-violet-500 text-white',
  };
  return (
    <div
      className={`rounded-xl border bg-gradient-to-br p-3.5 shadow-sm ${surface[tone]} ${className}`}
    >
      <div className="flex items-start gap-3">
        {icon && (
          <div className={`rounded-lg p-2 shadow-sm ${iconBg[tone]}`}>{icon}</div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-2xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <div className="mt-0.5 text-xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white">
            {value}
          </div>
          {hint && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
        </div>
      </div>
    </div>
  );
}

export function StaffAvatar({
  firstName,
  lastName,
  className = '',
  size = 'md',
}: {
  firstName?: string | null;
  lastName?: string | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';
  const sz = size === 'sm' ? 'h-6 w-6 text-[9px]' : size === 'lg' ? 'h-9 w-9 text-xs' : 'h-7 w-7 text-[10px]';
  // Stable colour from name
  const palette = [
    'from-emerald-500 to-teal-400',
    'from-sky-500 to-blue-500',
    'from-violet-500 to-purple-500',
    'from-amber-500 to-orange-400',
    'from-rose-500 to-pink-500',
    'from-cyan-500 to-teal-500',
  ];
  const key = (firstName || '') + (lastName || '');
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash + key.charCodeAt(i) * (i + 1)) % palette.length;
  const grad = palette[hash] || palette[0];

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-gradient-to-br ${grad} font-bold text-white shadow-md ring-2 ring-white dark:ring-slate-800 ${sz} ${className}`}
      title={[firstName, lastName].filter(Boolean).join(' ')}
    >
      {initials}
    </span>
  );
}

/** Engager-style board column tones */
export function boardColumnTone(column: string): StatusTone {
  switch (column) {
    case 'REQUEST_RECORDS':
      return 'danger';
    case 'RECORDS_RECEIVED':
      return 'warning';
    case 'IN_PROGRESS':
      return 'info';
    case 'HELP_NEEDED':
      return 'violet';
    case 'IN_REVIEW':
      return 'mint';
    case 'COMPLETE':
      return 'success';
    default:
      return 'neutral';
  }
}

/** Column chrome — soft wash + accent bar for kanban */
export function boardColumnChrome(column: string): {
  header: string;
  body: string;
  accent: string;
  bar: string;
} {
  switch (column) {
    case 'REQUEST_RECORDS':
      return {
        header: 'bg-gradient-to-r from-rose-100 to-rose-50 dark:from-rose-950/50 dark:to-slate-900',
        body: 'bg-rose-50/40 dark:bg-rose-950/10',
        accent: 'border-rose-200 dark:border-rose-900/50',
        bar: 'bg-rose-500',
      };
    case 'RECORDS_RECEIVED':
      return {
        header: 'bg-gradient-to-r from-amber-100 to-orange-50 dark:from-amber-950/50 dark:to-slate-900',
        body: 'bg-amber-50/40 dark:bg-amber-950/10',
        accent: 'border-amber-200 dark:border-amber-900/50',
        bar: 'bg-amber-500',
      };
    case 'IN_PROGRESS':
      return {
        header: 'bg-gradient-to-r from-sky-100 to-blue-50 dark:from-sky-950/50 dark:to-slate-900',
        body: 'bg-sky-50/40 dark:bg-sky-950/10',
        accent: 'border-sky-200 dark:border-sky-900/50',
        bar: 'bg-sky-500',
      };
    case 'HELP_NEEDED':
      return {
        header:
          'bg-gradient-to-r from-violet-100 to-fuchsia-50 dark:from-violet-950/50 dark:to-slate-900',
        body: 'bg-violet-50/40 dark:bg-violet-950/10',
        accent: 'border-violet-200 dark:border-violet-900/50',
        bar: 'bg-violet-500',
      };
    case 'IN_REVIEW':
      return {
        header: 'bg-gradient-to-r from-teal-100 to-cyan-50 dark:from-teal-950/50 dark:to-slate-900',
        body: 'bg-teal-50/40 dark:bg-teal-950/10',
        accent: 'border-teal-200 dark:border-teal-900/50',
        bar: 'bg-teal-500',
      };
    case 'COMPLETE':
      return {
        header:
          'bg-gradient-to-r from-emerald-100 to-green-50 dark:from-emerald-950/50 dark:to-slate-900',
        body: 'bg-emerald-50/30 dark:bg-emerald-950/10',
        accent: 'border-emerald-200 dark:border-emerald-900/50',
        bar: 'bg-emerald-500',
      };
    default:
      return {
        header: 'bg-slate-100 dark:bg-slate-900',
        body: 'bg-slate-50/50 dark:bg-slate-900/40',
        accent: 'border-slate-200 dark:border-slate-700',
        bar: 'bg-slate-400',
      };
  }
}

export function boardColumnLabel(column: string): string {
  return column
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}
