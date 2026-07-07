import { formatCurrency, type PricingSummary } from './shared';

/** Monthly / annual / one-time investment bands for proposal summaries */
export function InvestmentSummaryBands({ summary }: { summary: PricingSummary }) {
  return (
    <div className="space-y-2">
      {summary.monthly.count > 0 && (
        <div className="flex justify-between items-baseline">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-100">Monthly</span>
          <span className="text-lg font-semibold text-slate-900 dark:text-white tabular-nums">
            {formatCurrency(summary.monthly.total)}
            <span className="text-xs font-normal text-slate-500 dark:text-slate-300 ml-1">
              /month
            </span>
          </span>
        </div>
      )}
      {summary.annually.count > 0 && (
        <div className="flex justify-between items-baseline">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-100">Annual</span>
          <span className="text-lg font-semibold text-slate-900 dark:text-white tabular-nums">
            {formatCurrency(summary.annually.total)}
            <span className="text-xs font-normal text-slate-500 dark:text-slate-300 ml-1">
              /year
            </span>
          </span>
        </div>
      )}
      {summary.quarterly.count > 0 && (
        <div className="flex justify-between items-baseline">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-100">Quarterly</span>
          <span className="text-lg font-semibold text-slate-900 dark:text-white tabular-nums">
            {formatCurrency(summary.quarterly.total)}
            <span className="text-xs font-normal text-slate-500 dark:text-slate-300 ml-1">
              /quarter
            </span>
          </span>
        </div>
      )}
      {summary.weekly.count > 0 && (
        <div className="flex justify-between items-baseline">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-100">Weekly</span>
          <span className="text-lg font-semibold text-slate-900 dark:text-white tabular-nums">
            {formatCurrency(summary.weekly.total)}
            <span className="text-xs font-normal text-slate-500 dark:text-slate-300 ml-1">
              /week
            </span>
          </span>
        </div>
      )}
      {summary.oneTime.count > 0 && (
        <div className="flex justify-between items-baseline">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-100">One-time</span>
          <span className="text-lg font-semibold text-slate-900 dark:text-white tabular-nums">
            {formatCurrency(summary.oneTime.total)}
          </span>
        </div>
      )}
    </div>
  );
}
