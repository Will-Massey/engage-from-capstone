import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowPathIcon, BanknotesIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { MetalTile, MetalProgress } from '../ui/MetalTile';

interface RecurringRevenueData {
  activeSubscriptions: number;
  paidLast30DaysPence: number;
  failedLast30Days: number;
  estimatedMrrPence?: number;
  cashUnderManagementPence?: number;
  unpaidAcceptedCount?: number;
  unpaidAcceptedPence?: number;
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

  if (loading) {
    return (
      <div className="metal-tile p-5 animate-pulse">
        <div className="h-5 w-40 rounded bg-slate-200/80" />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-lg bg-slate-100/80" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="metal-tile p-5">
        <p className="text-sm text-slate-500">Money metrics unavailable.</p>
      </div>
    );
  }

  const mrr = data.estimatedMrrPence ?? 0;
  const cash = data.cashUnderManagementPence ?? 0;
  const dunning = data.failedLast30Days > 0 || (data.unpaidAcceptedCount ?? 0) > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BanknotesIcon className="h-5 w-5 text-emerald-600" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Cash &amp; recurring
          </h3>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <ArrowPathIcon className="h-3.5 w-3.5" />
          Live practice money loop
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetalTile
          tone="mint"
          kicker="MRR"
          title="Est. monthly recurring"
          value={formatGbp(mrr)}
          hint={`${data.activeSubscriptions} live subscription${data.activeSubscriptions === 1 ? '' : 's'}`}
        />
        <MetalTile
          tone="sky"
          kicker="Cash"
          title="Under management"
          value={formatGbp(cash)}
          hint="Open delivery + unpaid accepted"
        />
        <MetalTile
          tone="violet"
          kicker="Collected"
          title="Last 30 days"
          value={formatGbp(data.paidLast30DaysPence)}
          hint="Recurring payments received"
        />
        <MetalTile
          tone={dunning ? 'rose' : 'amber'}
          kicker="Dunning"
          title="Needs collection"
          value={
            data.failedLast30Days > 0
              ? String(data.failedLast30Days)
              : formatGbp(data.unpaidAcceptedPence || 0)
          }
          hint={
            data.failedLast30Days > 0
              ? 'Failed recurring payments (30d)'
              : `${data.unpaidAcceptedCount || 0} accepted unpaid`
          }
          icon={dunning ? <ExclamationTriangleIcon className="h-4 w-4 text-rose-600" /> : undefined}
        />
      </div>

      {(mrr > 0 || cash > 0) && (
        <div className="metal-tile p-3">
          <span className="metal-specular" aria-hidden />
          <div className="relative z-[1] grid gap-2 sm:grid-cols-2">
            <MetalProgress
              pct={
                cash > 0
                  ? Math.min(100, Math.round((data.paidLast30DaysPence / Math.max(cash, 1)) * 100))
                  : 0
              }
              tone="mint"
              label="Collected vs cash under management (30d)"
              showPct
              height="h-2"
            />
            <div className="flex flex-wrap items-end justify-end gap-2">
              <Link to="/jobs" className="btn-secondary text-xs">
                Jobs pipeline
              </Link>
              <Link to="/proposals/renewals" className="btn-secondary text-xs">
                Bulk renewals
              </Link>
            </div>
          </div>
        </div>
      )}

      {data.activeSubscriptions === 0 && mrr === 0 && data.paidLast30DaysPence === 0 && (
        <p className="text-sm text-slate-500">
          No recurring engagements yet — monthly/quarterly/annual proposal lines create
          subscriptions when the client pays.
        </p>
      )}
    </div>
  );
}
