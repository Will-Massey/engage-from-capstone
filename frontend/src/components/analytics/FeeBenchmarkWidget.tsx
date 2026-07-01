import { useEffect, useState } from 'react';
import { ChartBarIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';

interface FeeBenchmarkBand {
  category: string;
  label: string;
  tenantCount: number;
  sampleSize: number;
  p25: number;
  p50: number;
  p75: number;
}

interface FeeBenchmarkData {
  benchmarks: FeeBenchmarkBand[];
  suppressedCategories: number;
  kAnonymityMinTenants: number;
  disclaimer: string;
}

function formatGbp(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function FeeBenchmarkWidget({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<FeeBenchmarkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = (await apiClient.getFeeBenchmarks()) as { success?: boolean; data?: FeeBenchmarkData };
        if (res.success && res.data) {
          setData(res.data);
        } else {
          setError('Unable to load benchmarks');
        }
      } catch {
        setError('Benchmark data unavailable');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 animate-pulse">
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-3" />
        <div className="h-16 bg-slate-100 dark:bg-slate-800 rounded" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 text-sm text-slate-600 dark:text-slate-400">
        {error || 'No benchmark data'}
      </div>
    );
  }

  if (data.benchmarks.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20 p-4">
        <div className="flex items-start gap-2">
          <InformationCircleIcon className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              Fee benchmarks not yet available
            </p>
            <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-1">
              Categories need at least {data.kAnonymityMinTenants} contributing practices before
              anonymised bands are shown.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-800/40 ${compact ? 'p-4' : 'p-5'}`}>
      <div className="flex items-center gap-2 mb-3">
        <ChartBarIcon className="h-5 w-5 text-primary-600" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Anonymised fee benchmarks</h3>
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
        Monthly fee percentiles across Engage practices (no client or firm identifiers).
      </p>
      <div className={`grid gap-3 ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
        {data.benchmarks.map((band) => (
          <div key={band.category} className="rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 p-3">
            <p className="text-sm font-medium text-slate-900 dark:text-white">{band.label}</p>
            <p className="text-xs text-slate-500 mt-0.5">{band.tenantCount} practices</p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
              <div><p className="text-slate-500">P25</p><p className="font-semibold">{formatGbp(band.p25)}</p></div>
              <div><p className="text-slate-500">Median</p><p className="font-semibold text-primary-700">{formatGbp(band.p50)}</p></div>
              <div><p className="text-slate-500">P75</p><p className="font-semibold">{formatGbp(band.p75)}</p></div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-500 mt-3">{data.disclaimer}</p>
    </div>
  );
}