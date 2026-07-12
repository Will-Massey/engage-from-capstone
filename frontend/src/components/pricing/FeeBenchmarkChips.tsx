import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChartBarIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { formatServiceCategory } from '../../utils/serviceCategoryLabels';
import {
  getTurnoverBand,
  lineMonthlyEquivalent,
  pickBenchmarkCell,
  vsMedianHint,
} from '../../utils/feeBenchmarks';
import type { FeeBenchmarkTurnoverCell } from '../../types/analytics';

interface FeeBenchmarkBand {
  category: string;
  label: string;
  p25: number;
  p50: number;
  p75: number;
}

interface FeeBenchmarkData {
  benchmarks: FeeBenchmarkBand[];
  bandsByTurnover?: FeeBenchmarkTurnoverCell[];
  suppressedCategories: number;
  kAnonymityMinTenants: number;
  optedIn?: boolean;
  disclaimer?: string;
}

/** Proposal line to compare against the market median (R3.2) */
export interface BenchmarkServiceLine {
  id: string;
  name: string;
  category?: string;
  displayPrice: number;
  billingCycle: string;
}

function formatGbp(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

interface FeeBenchmarkChipsProps {
  /** Categories visible in the builder (e.g. filter buttons or catalogue) */
  categories?: string[];
  /** Highlight a single category (e.g. on a service row) */
  category?: string;
  /** Selected proposal lines to compare against the market median (R3.2) */
  lines?: BenchmarkServiceLine[];
  /** Selected client's annual turnover — picks the matching benchmark band */
  clientTurnover?: number | null;
  /** When false, skip fetching — parent already knows opt-in is off */
  enabled?: boolean;
  className?: string;
}

export default function FeeBenchmarkChips({
  categories,
  category,
  lines,
  clientTurnover,
  enabled = true,
  className = '',
}: FeeBenchmarkChipsProps) {
  const [data, setData] = useState<FeeBenchmarkData | null>(null);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = (await apiClient.getFeeBenchmarks()) as {
          success?: boolean;
          data?: FeeBenchmarkData;
        };
        if (!cancelled && res.success && res.data) {
          setData(res.data);
        }
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const bandByCategory = useMemo(() => {
    const map = new Map<string, FeeBenchmarkBand>();
    for (const band of data?.benchmarks ?? []) {
      map.set(band.category, band);
    }
    return map;
  }, [data]);

  // R3.2: per-line "vs market median" hints, banded by client turnover when known
  const lineHints = useMemo(() => {
    if (!data || !lines?.length) return [];
    const turnoverBand =
      clientTurnover != null && clientTurnover > 0 ? getTurnoverBand(clientTurnover) : undefined;
    const hints: Array<{ id: string; name: string; hint: string }> = [];
    for (const line of lines) {
      if (!line.category) continue;
      const cell = pickBenchmarkCell(data, line.category, turnoverBand);
      if (!cell) continue;
      const monthly = lineMonthlyEquivalent(line.displayPrice, line.billingCycle);
      const hint = vsMedianHint(monthly, cell.p50);
      if (hint) hints.push({ id: line.id, name: line.name, hint });
    }
    return hints;
  }, [data, lines, clientTurnover]);

  if (!enabled) return null;

  if (loading) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 animate-pulse ${className}`}
      >
        Benchmarks…
      </span>
    );
  }

  if (!data?.optedIn) {
    return (
      <div
        className={`flex items-start gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 px-3 py-2 text-xs text-slate-600 dark:text-slate-400 ${className}`}
      >
        <InformationCircleIcon className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          Share anonymised fee data in{' '}
          <Link to="/settings?tab=communications" className="text-primary-600 hover:underline">
            Settings → Communications
          </Link>{' '}
          to see typical fee ranges.
        </span>
      </div>
    );
  }

  const visibleBands = category
    ? (() => {
        const band = bandByCategory.get(category);
        return band ? [band] : [];
      })()
    : (categories ?? [])
        .filter((cat) => cat !== 'ALL')
        .map((cat) => bandByCategory.get(cat))
        .filter((band): band is FeeBenchmarkBand => Boolean(band));

  if (visibleBands.length === 0 && lineHints.length === 0) {
    if (category) return null;
    if ((data.suppressedCategories ?? 0) > 0) {
      return (
        <p className={`text-xs text-slate-500 dark:text-slate-400 ${className}`}>
          Some categories withheld — need at least {data.kAnonymityMinTenants} contributing
          practices.
        </p>
      );
    }
    return null;
  }

  if (category && visibleBands.length === 1) {
    const band = visibleBands[0];
    return (
      <span
        title={data.disclaimer}
        className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-800 dark:text-primary-200 border border-primary-100 dark:border-primary-800/50 ${className}`}
      >
        <ChartBarIcon className="h-3 w-3" />
        Typical range {formatGbp(band.p25)}–{formatGbp(band.p75)}
      </span>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {visibleBands.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
            <ChartBarIcon className="h-4 w-4 text-primary-600" />
            Typical monthly fee ranges (anonymised)
          </div>
          <div className="flex flex-wrap gap-2">
            {visibleBands.map((band) => (
              <span
                key={band.category}
                title={data.disclaimer}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-900 dark:text-primary-100 border border-primary-100 dark:border-primary-800/50"
              >
                <span className="font-medium">{formatServiceCategory(band.category)}:</span>
                {formatGbp(band.p25)}–{formatGbp(band.p75)}
              </span>
            ))}
          </div>
        </>
      )}
      {lineHints.length > 0 && (
        <div className="space-y-0.5">
          {lineHints.map((line) => (
            <p key={line.id} className="text-[11px] text-slate-500 dark:text-slate-400">
              <span className="font-medium">{line.name}</span> {line.hint}
            </p>
          ))}
        </div>
      )}
      {(data.suppressedCategories ?? 0) > 0 && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {data.suppressedCategories} categor
          {data.suppressedCategories === 1 ? 'y' : 'ies'} withheld (fewer than{' '}
          {data.kAnonymityMinTenants} practices).
        </p>
      )}
    </div>
  );
}
