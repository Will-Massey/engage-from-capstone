import type { HTMLAttributes, ReactNode } from 'react';

export type MetalTone = 'default' | 'mint' | 'rose' | 'sky' | 'amber' | 'violet';

const TONE_CLASS: Record<MetalTone, string> = {
  default: '',
  mint: 'metal-tile--mint',
  rose: 'metal-tile--rose',
  sky: 'metal-tile--sky',
  amber: 'metal-tile--amber',
  violet: 'metal-tile--violet',
};

/** Quiet left accent — solid pale, not metallic gradient */
const EDGE: Record<MetalTone, string> = {
  default: 'bg-slate-300 dark:bg-slate-600',
  mint: 'bg-emerald-300 dark:bg-emerald-700',
  rose: 'bg-rose-300 dark:bg-rose-700',
  sky: 'bg-sky-300 dark:bg-sky-700',
  amber: 'bg-amber-300 dark:bg-amber-700',
  violet: 'bg-violet-300 dark:bg-violet-700',
};

export function MetalTile({
  tone = 'default',
  kicker,
  title,
  value,
  hint,
  icon,
  edge = true,
  className = '',
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  tone?: MetalTone;
  kicker?: string;
  title?: string;
  value?: ReactNode;
  hint?: string;
  icon?: ReactNode;
  edge?: boolean;
}) {
  return (
    <div className={`metal-tile p-4 ${TONE_CLASS[tone]} ${className}`} {...rest}>
      {edge && (
        <span
          className={`absolute left-0 top-3 bottom-3 z-[2] w-[3px] rounded-full ${EDGE[tone]}`}
          aria-hidden
        />
      )}
      <div className={`relative z-[1] ${edge ? 'pl-2' : ''}`}>
        {(kicker || icon) && (
          <div className="mb-1.5 flex items-center justify-between gap-2">
            {kicker ? <span className="metal-kicker">{kicker}</span> : <span />}
            {icon && <span className="metal-icon-well">{icon}</span>}
          </div>
        )}
        {title && (
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{title}</p>
        )}
        {value != null && (
          <div className="mt-0.5 text-xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white">
            {value}
          </div>
        )}
        {hint && (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
        )}
        {children}
      </div>
    </div>
  );
}

export function MetalCard({
  tone = 'default',
  className = '',
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { tone?: MetalTone }) {
  return (
    <div className={`metal-tile overflow-hidden ${TONE_CLASS[tone]} ${className}`} {...rest}>
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}

/** Solid pale fills for progress (no chrome gradients) */
const FILL: Record<MetalTone | 'auto', string> = {
  default: 'from-slate-400 to-slate-400',
  mint: 'from-emerald-400 to-emerald-400',
  rose: 'from-rose-400 to-rose-400',
  sky: 'from-sky-400 to-sky-400',
  amber: 'from-amber-400 to-amber-400',
  violet: 'from-violet-400 to-violet-400',
  auto: '',
};

/** Quiet progress bar */
export function MetalProgress({
  pct,
  tone = 'mint',
  className = '',
  height = 'h-2',
  showPct,
  label,
}: {
  pct: number;
  tone?: MetalTone | 'auto';
  className?: string;
  height?: string;
  showPct?: boolean;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const autoTone: MetalTone =
    clamped >= 100 ? 'mint' : clamped >= 60 ? 'sky' : clamped >= 30 ? 'amber' : 'rose';
  const fillTone = tone === 'auto' ? autoTone : tone;
  return (
    <div className={className}>
      {(label || showPct) && (
        <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {label ? <span>{label}</span> : <span />}
          {showPct && <span className="tabular-nums text-slate-600 dark:text-slate-300">{clamped}%</span>}
        </div>
      )}
      <div className={`metal-progress-track w-full overflow-hidden rounded-full ${height}`}>
        <div
          className={`metal-progress-fill h-full rounded-full bg-gradient-to-r ${FILL[fillTone]} transition-all duration-300 ease-out`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

export function StatusGem({
  tone = 'mint',
  className = '',
  children,
}: {
  tone?: MetalTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={`metal-gem metal-gem--${tone === 'default' ? 'slate' : tone} ${className}`}>
      <span className="metal-gem-dot" aria-hidden />
      {children}
    </span>
  );
}

export function Sparkline({
  values,
  className = '',
  stroke = '#64748b',
  height = 28,
  width = 88,
}: {
  values: number[];
  className?: string;
  stroke?: string;
  height?: number;
  width?: number;
}) {
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  const pts = values
    .map((v, i) => {
      const x = pad + (i / Math.max(1, values.length - 1)) * (width - pad * 2);
      const y = height - pad - ((v - min) / span) * (height - pad * 2);
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
      />
    </svg>
  );
}

export function ColumnMetalHeader({
  title,
  count,
  tone = 'default',
  avgPct,
  className = '',
}: {
  title: string;
  count: number;
  tone?: MetalTone;
  avgPct?: number;
  className?: string;
}) {
  const toneClass = tone === 'default' ? '' : TONE_CLASS[tone];
  return (
    <div className={`metal-tile px-3 py-2.5 ${toneClass} ${className}`}>
      <div className="relative z-[1] flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="metal-kicker truncate">{title}</p>
          <p className="text-sm font-bold tabular-nums text-slate-800 dark:text-white">{count}</p>
        </div>
        {avgPct != null && (
          <div className="w-16">
            <MetalProgress pct={avgPct} tone={tone === 'default' ? 'mint' : tone} height="h-1.5" />
          </div>
        )}
      </div>
    </div>
  );
}

export function SegmentedMeter({
  segments,
  className = '',
}: {
  segments: Array<{ value: number; tone: MetalTone; label?: string }>;
  className?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className={className}>
      <div className="metal-progress-track flex h-2.5 w-full overflow-hidden rounded-full">
        {segments.map((seg, i) => (
          <div
            key={i}
            title={seg.label ? `${seg.label}: ${seg.value}` : undefined}
            className={`h-full bg-gradient-to-r ${FILL[seg.tone]}`}
            style={{ width: `${(seg.value / total) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export function HeatDot({
  level,
  className = '',
}: {
  level: 0 | 1 | 2 | 3 | 4;
  className?: string;
}) {
  const colors = [
    'bg-slate-200 dark:bg-slate-700',
    'bg-emerald-200',
    'bg-amber-200',
    'bg-orange-300',
    'bg-rose-300',
  ];
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-sm ${colors[level]} ${className}`}
      aria-hidden
    />
  );
}
