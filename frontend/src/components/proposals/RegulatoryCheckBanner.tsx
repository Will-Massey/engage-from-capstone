import { useEffect, useState } from 'react';
import {
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ShieldExclamationIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';

type RuleSeverity = 'info' | 'warning' | 'action_required';

interface RegulatoryRule {
  id: string;
  title: string;
  description: string;
  severity: RuleSeverity;
  category: string;
}

interface RegulatoryCheckResult {
  rules: RegulatoryRule[];
  summary: { actionRequired: number; warnings: number; info: number };
}

const SEVERITY_STYLES: Record<
  RuleSeverity,
  { icon: typeof InformationCircleIcon; border: string; bg: string; text: string }
> = {
  action_required: {
    icon: ShieldExclamationIcon,
    border: 'border-amber-300 dark:border-amber-700',
    bg: 'bg-amber-50/90 dark:bg-amber-950/30',
    text: 'text-amber-900 dark:text-amber-100',
  },
  warning: {
    icon: ExclamationTriangleIcon,
    border: 'border-orange-200 dark:border-orange-800',
    bg: 'bg-orange-50/80 dark:bg-orange-950/25',
    text: 'text-orange-900 dark:text-orange-100',
  },
  info: {
    icon: InformationCircleIcon,
    border: 'border-sky-200 dark:border-sky-800',
    bg: 'bg-sky-50/80 dark:bg-sky-950/25',
    text: 'text-sky-900 dark:text-sky-100',
  },
};

interface RegulatoryCheckBannerProps {
  clientId: string;
  compact?: boolean;
}

export default function RegulatoryCheckBanner({ clientId, compact }: RegulatoryCheckBannerProps) {
  const [result, setResult] = useState<RegulatoryCheckResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = (await apiClient.getRegulatoryCheck(clientId)) as any;
        if (!cancelled && res.success) {
          setResult(res.data);
        }
      } catch {
        if (!cancelled) setResult(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (loading) {
    return (
      <div
        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 px-4 py-3 text-sm text-slate-500 animate-pulse"
        data-testid="regulatory-check-loading"
      >
        Checking UK regulatory rules…
      </div>
    );
  }

  if (!result?.rules?.length) {
    return (
      <div
        className="rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-950/20 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200"
        data-testid="regulatory-check-clear"
      >
        No mandatory MTD or VAT actions flagged for this client profile.
      </div>
    );
  }

  const topRules = result.rules.filter((r) => r.severity !== 'info');
  const displayRules = expanded
    ? result.rules
    : topRules.length
      ? topRules
      : result.rules.slice(0, 2);

  return (
    <div className="space-y-2" data-testid="regulatory-check-banner">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          UK regulatory fit (rules engine)
        </p>
        <span className="text-xs text-slate-500">
          {result.summary.actionRequired > 0 && (
            <span className="text-amber-700 dark:text-amber-300 font-medium mr-2">
              {result.summary.actionRequired} action
            </span>
          )}
          {result.summary.warnings > 0 && (
            <span className="text-orange-600 dark:text-orange-300 mr-2">
              {result.summary.warnings} warning
            </span>
          )}
        </span>
      </div>
      {displayRules.map((rule) => {
        const style = SEVERITY_STYLES[rule.severity];
        const Icon = style.icon;
        return (
          <div
            key={rule.id}
            className={`rounded-xl border px-4 py-3 ${style.border} ${style.bg} ${compact ? 'text-xs' : 'text-sm'}`}
          >
            <div className="flex gap-2">
              <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${style.text}`} aria-hidden />
              <div className="min-w-0">
                <p className={`font-medium ${style.text}`}>{rule.title}</p>
                <p className="mt-0.5 text-slate-600 dark:text-slate-300">{rule.description}</p>
              </div>
            </div>
          </div>
        );
      })}
      {result.rules.length > displayRules.length && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
        >
          {expanded ? 'Show fewer rules' : `Show all ${result.rules.length} rules`}
        </button>
      )}
    </div>
  );
}
