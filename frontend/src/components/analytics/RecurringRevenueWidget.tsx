import { useEffect, useState } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';

interface RecurringRevenueData {
  activeSubscriptions: number;
  paidLast30DaysPence: number;
  failedLast30Days: number;
}

function formatGbp(pence: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(pence / 100);
}

export default function RecurringRevenueWidget() {
  const [data, setData] = useState<RecurringRevenueData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const response = (await apiClient.get('/analytics/recurring')) as any;
        if (response.success) setData(response.data);
      } catch {
        // widget is informational — fail quiet
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="glass-tile p-6">
      <div className="flex items-center gap-2 mb-4">
        <ArrowPathIcon className="h-5 w-5 text-emerald-600" />
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Recurring Revenue</h3>
      </div>
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : !data ? (
        <p className="text-sm text-slate-500">Recurring revenue data is unavailable.</p>
      ) : data.activeSubscriptions === 0 && data.paidLast30DaysPence === 0 ? (
        <p className="text-sm text-slate-500">
          No recurring engagements yet — proposals with monthly, quarterly or annual services create
          a subscription when the client pays.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 bg-white/40 dark:bg-slate-700/40 rounded-lg">
            <p className="text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">
              {data.activeSubscriptions}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              Active recurring engagements
            </p>
          </div>
          <div className="p-3 bg-white/40 dark:bg-slate-700/40 rounded-lg">
            <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {formatGbp(data.paidLast30DaysPence)}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              Collected last 30 days
            </p>
          </div>
          <div className="p-3 bg-white/40 dark:bg-slate-700/40 rounded-lg">
            <p
              className={`text-2xl font-semibold tabular-nums ${
                data.failedLast30Days > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-slate-900 dark:text-white'
              }`}
            >
              {data.failedLast30Days}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              Failed payments (30 days)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
