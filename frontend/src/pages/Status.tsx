import { useEffect, useState } from 'react';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  MinusCircleIcon,
} from '@heroicons/react/24/outline';

type ComponentStatus = 'operational' | 'degraded' | 'unavailable' | 'not_configured';

interface StatusResponse {
  status: 'operational' | 'degraded' | 'major_outage';
  components: Record<string, { status: ComponentStatus; detail: string }>;
  version: string;
  environment: string;
  timestamp: string;
}

const STATUS_META: Record<
  ComponentStatus,
  { label: string; icon: typeof CheckCircleIcon; className: string }
> = {
  operational: {
    label: 'Operational',
    icon: CheckCircleIcon,
    className: 'text-emerald-600',
  },
  degraded: {
    label: 'Degraded',
    icon: ExclamationTriangleIcon,
    className: 'text-amber-600',
  },
  unavailable: {
    label: 'Unavailable',
    icon: XCircleIcon,
    className: 'text-red-600',
  },
  not_configured: {
    label: 'Not configured',
    icon: MinusCircleIcon,
    className: 'text-slate-400',
  },
};

const OVERALL_LABELS = {
  operational: { text: 'All systems operational', colour: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  degraded: { text: 'Partial degradation', colour: 'text-amber-800 bg-amber-50 border-amber-200' },
  major_outage: { text: 'Major outage', colour: 'text-red-800 bg-red-50 border-red-200' },
};

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const statusBase = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;

export default function Status() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${statusBase}/status`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError('Status check failed');
      }
    } catch {
      setError('Unable to reach Engage API');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, []);

  const overall = data?.status || 'major_outage';
  const overallStyle = OVERALL_LABELS[overall] || OVERALL_LABELS.major_outage;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 px-4 py-10 sm:py-16">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            Engage system status
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
            Public health checks for the Engage platform
          </p>
        </div>

        {loading && !data ? (
          <div className="card p-8 text-center text-slate-500 animate-pulse">Checking systems…</div>
        ) : error ? (
          <div className="card p-8 text-center">
            <XCircleIcon className="h-10 w-10 text-red-500 mx-auto" />
            <p className="mt-3 text-slate-800 dark:text-slate-200">{error}</p>
            <button type="button" onClick={load} className="btn-primary mt-4">
              Retry
            </button>
          </div>
        ) : data ? (
          <div className="space-y-4">
            <div className={`rounded-xl border px-5 py-4 text-center font-medium ${overallStyle.colour}`}>
              {overallStyle.text}
            </div>

            <div className="card divide-y divide-slate-200 dark:divide-slate-700">
              {Object.entries(data.components).map(([name, component]) => {
                const meta = STATUS_META[component.status];
                const Icon = meta.icon;
                return (
                  <div key={name} className="flex items-start gap-4 px-5 py-4">
                    <Icon className={`h-6 w-6 shrink-0 mt-0.5 ${meta.className}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 dark:text-white capitalize">
                        {name.replace(/([A-Z])/g, ' $1').trim()}
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">{component.detail}</p>
                    </div>
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                      {meta.label}
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-center text-slate-500 dark:text-slate-500">
              Version {data.version} · {data.environment} · Updated{' '}
              {new Date(data.timestamp).toLocaleString('en-GB')}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}