import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  DocumentTextIcon,
  UsersIcon,
  CurrencyPoundIcon,
  ChartPieIcon,
  EyeIcon,
  CheckCircleIcon,
  ClockIcon,
  FunnelIcon,
  BoltIcon,
  ScaleIcon,
} from '@heroicons/react/24/outline';
import { DECLINE_REASON_LABELS, type DeclineReason } from '../constants/declineReasons';
import { apiClient } from '../utils/api';
import { useAuthStore } from '../stores/authStore';
import { format, parseISO } from 'date-fns';
import { SkeletonStats } from '../components/skeleton';
import FeeBenchmarkWidget from '../components/analytics/FeeBenchmarkWidget';
import RecurringRevenueWidget from '../components/analytics/RecurringRevenueWidget';

interface AnalyticsData {
  proposals: {
    total: number;
    thisMonth: number;
    lastMonth: number;
    growth: number;
    statusBreakdown: Record<string, number>;
  };
  revenue: {
    total: number;
    thisMonth: number;
    currency: string;
  };
  conversion: {
    rate: number;
    sent: number;
    accepted: number;
  };
  clients: {
    total: number;
    newThisMonth: number;
    active: number;
  };
  monthlyTrend: Array<{
    month: string;
    count: number;
    value: number;
    accepted: number;
  }>;
  topServices: Array<{
    name: string;
    count: number;
    revenue: number;
  }>;
}

interface FunnelData {
  stages: Array<{ name: string; count: number; color: string }>;
  outcomes: Array<{ name: string; count: number; color: string }>;
  conversionRates: {
    sentToViewed: number;
    viewedToAccepted: number;
    sentToAccepted: number;
  };
}

interface PipelineData {
  pipeline: { value: number; subtotal: number; count: number };
  accepted: { value: number };
  monthlyRecurring: number;
  forecast: { expectedValue: number };
}

interface TimeToDecisionData {
  avgDaysToAccept: number;
  avgDaysToDecline: number;
  avgDaysToView: number;
  sampleSize: { accepted: number; declined: number };
}

interface ProposalFunnelData {
  dateRange: { start: string; end: string };
  funnel: {
    sent: number;
    opened: number;
    viewed: number;
    signed: number;
    paid: number;
  };
  conversionRates: {
    sentToOpened: number;
    openedToSigned: number;
    sentToSigned: number;
    signedToPaid: number;
  };
  stages: Array<{ key: string; label: string; count: number; color: string }>;
}

interface WinLossData {
  summary: {
    wins: number;
    losses: number;
    decided: number;
    winRate: number;
    untaggedDeclines: number;
    taggedDeclines: number;
  };
  byReason: Array<{
    reason: DeclineReason;
    label: string;
    declined: number;
    shareOfLosses: number;
  }>;
  byServiceMix: Array<{
    name: string;
    accepted: number;
    declined: number;
    conversionRate: number;
    acceptedValue: number;
    declinedValue: number;
  }>;
  byClientType: Array<{
    key: string;
    label: string;
    accepted: number;
    declined: number;
    conversionRate: number;
  }>;
  byClientRelationship: Array<{
    key: string;
    label: string;
    accepted: number;
    declined: number;
    conversionRate: number;
  }>;
  recentLosses: Array<{
    id: string;
    reason: DeclineReason | null;
    reasonLabel: string;
    text: string | null;
    total: number;
    declinedAt: string | null;
  }>;
}

const StatCard = ({
  title,
  value,
  change,
  changeType,
  icon: Icon,
  suffix = '',
  subtitle,
}: {
  title: string;
  value: string | number;
  change?: number;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: any;
  suffix?: string;
  subtitle?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="glass-tile p-6"
  >
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-slate-600">{title}</p>
        <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
          {value}
          {suffix && <span className="text-lg font-normal text-slate-500">{suffix}</span>}
        </p>
        {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
        {change !== undefined && (
          <div className="mt-2 flex items-center">
            {changeType === 'positive' ? (
              <ArrowTrendingUpIcon className="h-4 w-4 text-green-500 mr-1" />
            ) : changeType === 'negative' ? (
              <ArrowTrendingDownIcon className="h-4 w-4 text-red-500 mr-1" />
            ) : null}
            <span
              className={`text-sm font-medium ${
                changeType === 'positive'
                  ? 'text-green-600'
                  : changeType === 'negative'
                    ? 'text-red-600'
                    : 'text-slate-600'
              }`}
            >
              {change > 0 ? '+' : ''}
              {change}%
            </span>
            <span className="text-sm text-slate-500 ml-1">vs last month</span>
          </div>
        )}
      </div>
      <div className="p-3 bg-white/50 dark:bg-slate-700/50 rounded-lg">
        <Icon className="h-6 w-6 text-slate-600 dark:text-slate-300" />
      </div>
    </div>
  </motion.div>
);

const SimpleBarChart = ({ data }: { data: AnalyticsData['monthlyTrend'] }) => {
  const maxValue = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="glass-tile p-6">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
        Proposal Activity (6 Months)
      </h3>
      <div className="h-64 flex items-end justify-between gap-2">
        {data.map((item, index) => (
          <div key={index} className="flex-1 flex flex-col items-center">
            <div className="w-full flex gap-1 justify-center">
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${(item.count / maxValue) * 100}%` }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="w-4 bg-primary-500 rounded-t"
                title={`${item.count} proposals`}
              />
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${(item.accepted / maxValue) * 100}%` }}
                transition={{ duration: 0.5, delay: index * 0.1 + 0.05 }}
                className="w-4 bg-green-500 rounded-t"
                title={`${item.accepted} accepted`}
              />
            </div>
            <span className="text-xs text-slate-500 mt-2">
              {format(parseISO(item.month), 'MMM')}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-6 mt-4">
        <div className="flex items-center">
          <div className="w-3 h-3 bg-primary-500 rounded mr-2" />
          <span className="text-sm text-slate-600 dark:text-slate-300">Created</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-3 bg-green-500 rounded mr-2" />
          <span className="text-sm text-slate-600 dark:text-slate-300">Accepted</span>
        </div>
      </div>
    </div>
  );
};

const ProposalFunnelChart = ({ data }: { data: ProposalFunnelData }) => {
  const maxCount = Math.max(...data.stages.map((s) => s.count), 1);
  const { funnel, conversionRates } = data;

  return (
    <div className="glass-tile p-6">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Proposal funnel</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        {format(parseISO(data.dateRange.start), 'd MMM yyyy')} –{' '}
        {format(parseISO(data.dateRange.end), 'd MMM yyyy')}
      </p>
      <div className="space-y-3">
        {data.stages.map((stage, index) => {
          const prevCount = index > 0 ? data.stages[index - 1].count : stage.count;
          const dropOff =
            index > 0 && prevCount > 0
              ? Math.round(((prevCount - stage.count) / prevCount) * 100)
              : 0;

          return (
            <div key={stage.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {stage.label}
                </span>
                <div className="flex items-center gap-2">
                  {dropOff > 0 && index > 0 && stage.key !== 'viewed' && (
                    <span className="text-xs text-red-500">-{dropOff}%</span>
                  )}
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    {stage.count}
                  </span>
                </div>
              </div>
              <div className="h-7 bg-white/30 dark:bg-slate-700/30 rounded-lg overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(stage.count / maxCount) * 100}%` }}
                  transition={{ duration: 0.5, delay: index * 0.08 }}
                  className={`h-full ${stage.color} rounded-lg`}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-4 border-t border-white/10 dark:border-slate-700/50 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="text-center">
          <p className="text-xs text-slate-500 dark:text-slate-400">Sent → Opened</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">
            {conversionRates.sentToOpened}%
          </p>
          <p className="text-xs text-slate-400">
            {funnel.opened}/{funnel.sent}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500 dark:text-slate-400">Opened → Signed</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">
            {conversionRates.openedToSigned}%
          </p>
          <p className="text-xs text-slate-400">
            {funnel.signed}/{funnel.opened}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500 dark:text-slate-400">Sent → Signed</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">
            {conversionRates.sentToSigned}%
          </p>
          <p className="text-xs text-slate-400">
            {funnel.signed}/{funnel.sent}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500 dark:text-slate-400">Signed → Paid</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">
            {conversionRates.signedToPaid}%
          </p>
          <p className="text-xs text-slate-400">
            {funnel.paid}/{funnel.signed}
          </p>
        </div>
      </div>
    </div>
  );
};

const ConversionFunnel = ({ data }: { data: FunnelData }) => {
  const maxCount = Math.max(...data.stages.map((s) => s.count), 1);

  return (
    <div className="glass-tile p-6">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
        Conversion Funnel
      </h3>
      <div className="space-y-4">
        {data.stages.map((stage, index) => {
          const prevCount = index > 0 ? data.stages[index - 1].count : stage.count;
          const dropOff =
            index > 0 && prevCount > 0
              ? Math.round(((prevCount - stage.count) / prevCount) * 100)
              : 0;

          return (
            <div key={stage.name}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {stage.name}
                </span>
                <div className="flex items-center gap-2">
                  {dropOff > 0 && index > 0 && (
                    <span className="text-xs text-red-500">-{dropOff}%</span>
                  )}
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    {stage.count}
                  </span>
                </div>
              </div>
              <div className="h-8 bg-white/30 dark:bg-slate-700/30 rounded-lg overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(stage.count / maxCount) * 100}%` }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className={`h-full ${stage.color} rounded-lg`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Conversion rates */}
      <div className="mt-4 pt-4 border-t border-white/10 dark:border-slate-700/50 grid grid-cols-3 gap-4">
        <div className="text-center">
          <p className="text-xs text-slate-500 dark:text-slate-300">Sent → Viewed</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">
            {data.conversionRates.sentToViewed}%
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500 dark:text-slate-300">Viewed → Accepted</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">
            {data.conversionRates.viewedToAccepted}%
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500 dark:text-slate-300">Sent → Accepted</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">
            {data.conversionRates.sentToAccepted}%
          </p>
        </div>
      </div>
    </div>
  );
};

const RevenuePipeline = ({
  data,
  formatCurrency,
}: {
  data: PipelineData;
  formatCurrency: (n: number) => string;
}) => (
  <div className="glass-tile p-6">
    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Revenue Pipeline</h3>
    <div className="grid grid-cols-2 gap-4 mb-4">
      <div className="p-4 bg-white/40 dark:bg-slate-700/40 rounded-lg">
        <p className="text-xs text-slate-500 dark:text-slate-300">Pipeline Value</p>
        <p className="text-xl font-bold text-slate-900 dark:text-white">
          {formatCurrency(data.pipeline.value)}
        </p>
        <p className="text-xs text-slate-500">{data.pipeline.count} proposals</p>
      </div>
      <div className="p-4 bg-white/40 dark:bg-slate-700/40 rounded-lg">
        <p className="text-xs text-slate-500 dark:text-slate-300">Accepted Revenue</p>
        <p className="text-xl font-bold text-green-600">{formatCurrency(data.accepted.value)}</p>
      </div>
      <div className="p-4 bg-white/40 dark:bg-slate-700/40 rounded-lg">
        <p className="text-xs text-slate-500 dark:text-slate-300">Monthly Recurring</p>
        <p className="text-xl font-bold text-primary-600">
          {formatCurrency(data.monthlyRecurring)}
        </p>
        <p className="text-xs text-slate-500">/month</p>
      </div>
      <div className="p-4 bg-white/40 dark:bg-slate-700/40 rounded-lg">
        <p className="text-xs text-slate-500 dark:text-slate-300">Forecast (30% conv.)</p>
        <p className="text-xl font-bold text-amber-600">
          {formatCurrency(data.forecast.expectedValue)}
        </p>
      </div>
    </div>
  </div>
);

const TimeToDecision = ({ data }: { data: TimeToDecisionData }) => (
  <div className="glass-tile p-6">
    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Time to Decision</h3>
    <div className="grid grid-cols-3 gap-4">
      <div className="text-center p-4 bg-white/40 dark:bg-slate-700/40 rounded-lg">
        <ClockIcon className="h-6 w-6 text-blue-500 mx-auto mb-2" />
        <p className="text-2xl font-bold text-slate-900 dark:text-white">{data.avgDaysToView}d</p>
        <p className="text-xs text-slate-500 dark:text-slate-300">Avg. to View</p>
      </div>
      <div className="text-center p-4 bg-white/40 dark:bg-slate-700/40 rounded-lg">
        <CheckCircleIcon className="h-6 w-6 text-green-500 mx-auto mb-2" />
        <p className="text-2xl font-bold text-slate-900 dark:text-white">{data.avgDaysToAccept}d</p>
        <p className="text-xs text-slate-500 dark:text-slate-300">Avg. to Accept</p>
      </div>
      <div className="text-center p-4 bg-white/40 dark:bg-slate-700/40 rounded-lg">
        <FunnelIcon className="h-6 w-6 text-red-500 mx-auto mb-2" />
        <p className="text-2xl font-bold text-slate-900 dark:text-white">
          {data.avgDaysToDecline}d
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-300">Avg. to Decline</p>
      </div>
    </div>
    <p className="text-xs text-slate-500 text-center mt-3">
      Based on {data.sampleSize.accepted} accepted, {data.sampleSize.declined} declined proposals
    </p>
  </div>
);

const WinLossSection = ({
  data,
  formatCurrency,
}: {
  data: WinLossData;
  formatCurrency: (n: number) => string;
}) => {
  const maxReasonCount = Math.max(...data.byReason.map((r) => r.declined), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ScaleIcon className="h-6 w-6 text-slate-600 dark:text-slate-300" />
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Win / Loss</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-tile p-5">
          <p className="text-sm text-slate-600 dark:text-slate-400">Win rate</p>
          <p className="text-3xl font-bold text-green-600 mt-1">{data.summary.winRate}%</p>
          <p className="text-xs text-slate-500 mt-1">
            {data.summary.wins} won / {data.summary.decided} decided
          </p>
        </div>
        <div className="glass-tile p-5">
          <p className="text-sm text-slate-600 dark:text-slate-400">Losses tagged</p>
          <p className="text-3xl font-bold text-red-600 mt-1">{data.summary.taggedDeclines}</p>
          <p className="text-xs text-slate-500 mt-1">
            {data.summary.untaggedDeclines} without a reason
          </p>
        </div>
        <div className="glass-tile p-5">
          <p className="text-sm text-slate-600 dark:text-slate-400">Top loss driver</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">
            {data.byReason[0]?.label || '—'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {data.byReason[0] ? `${data.byReason[0].declined} declines` : 'No tagged losses yet'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-tile p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            Losses by reason
          </h3>
          {data.byReason.length === 0 ? (
            <p className="text-sm text-slate-500">
              Loss reasons will appear here when clients decline on the portal or you mark
              quotations as lost.
            </p>
          ) : (
            <div className="space-y-3">
              {[...data.byReason]
                .sort((a, b) => b.declined - a.declined)
                .map((item) => (
                  <div key={item.reason}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {item.label}
                      </span>
                      <span className="text-slate-600 dark:text-slate-400">
                        {item.declined} ({item.shareOfLosses}%)
                      </span>
                    </div>
                    <div className="h-2 bg-white/30 dark:bg-slate-700/30 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(item.declined / maxReasonCount) * 100}%` }}
                        className="h-full bg-red-500 rounded-full"
                      />
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="glass-tile p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            Conversion by client type
          </h3>
          <div className="space-y-3">
            {data.byClientType.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between p-3 bg-white/40 dark:bg-slate-700/40 rounded-lg"
              >
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{item.label}</p>
                  <p className="text-xs text-slate-500">
                    {item.accepted} won · {item.declined} lost
                  </p>
                </div>
                <span
                  className={`text-lg font-bold ${
                    item.conversionRate >= 50 ? 'text-green-600' : 'text-amber-600'
                  }`}
                >
                  {item.conversionRate}%
                </span>
              </div>
            ))}
            {data.byClientRelationship.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between p-3 bg-white/40 dark:bg-slate-700/40 rounded-lg border border-dashed border-slate-200 dark:border-slate-600"
              >
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{item.label}</p>
                  <p className="text-xs text-slate-500">
                    {item.accepted} won · {item.declined} lost
                  </p>
                </div>
                <span
                  className={`text-lg font-bold ${
                    item.conversionRate >= 50 ? 'text-green-600' : 'text-amber-600'
                  }`}
                >
                  {item.conversionRate}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-tile p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            Conversion by service mix
          </h3>
          {data.byServiceMix.length === 0 ? (
            <p className="text-sm text-slate-500">No service-level win/loss data yet.</p>
          ) : (
            <div className="space-y-3">
              {data.byServiceMix.map((svc) => (
                <div
                  key={svc.name}
                  className="flex items-center justify-between p-3 bg-white/40 dark:bg-slate-700/40 rounded-lg"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <p className="font-medium text-slate-900 dark:text-white truncate">
                      {svc.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {svc.accepted} won · {svc.declined} lost
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`text-sm font-bold ${
                        svc.conversionRate >= 50 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {svc.conversionRate}%
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {formatCurrency(svc.declinedValue)} at risk
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-tile p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            Recent tagged losses
          </h3>
          {data.recentLosses.length === 0 ? (
            <p className="text-sm text-slate-500">No tagged decline feedback yet.</p>
          ) : (
            <div className="space-y-3">
              {data.recentLosses.map((loss) => (
                <div
                  key={loss.id}
                  className="p-3 bg-white/40 dark:bg-slate-700/40 rounded-lg border-l-4 border-red-400"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {loss.reason
                          ? DECLINE_REASON_LABELS[loss.reason] || loss.reasonLabel
                          : loss.reasonLabel}
                      </p>
                      {loss.text && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                          {loss.text}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {formatCurrency(loss.total)}
                      </p>
                      {loss.declinedAt && (
                        <p className="text-[10px] text-slate-500">
                          {format(parseISO(loss.declinedAt), 'd MMM yyyy')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const TopServicesTable = ({ services }: { services: AnalyticsData['topServices'] }) => (
  <div className="glass-tile p-6">
    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Top Services</h3>
    <div className="space-y-3">
      {services.map((service, index) => (
        <div
          key={index}
          className="flex items-center justify-between p-3 bg-white/40 dark:bg-slate-700/40 rounded-lg"
        >
          <div className="flex items-center">
            <span className="w-6 h-6 flex items-center justify-center bg-primary-100 dark:bg-primary-900/30 text-primary-600 text-xs font-bold rounded-full mr-3">
              {index + 1}
            </span>
            <span className="font-medium text-slate-900 dark:text-white">{service.name}</span>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(
                service.revenue
              )}
            </p>
            <p className="text-xs text-slate-500">{service.count} proposals</p>
          </div>
        </div>
      ))}
    </div>
  </div>
);

/** Map synthesiseWinLoss API shape to WinLossSection props (full analytics adds byReason etc.). */
function normalizeWinLoss(raw: unknown): WinLossData | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (Array.isArray(data.byReason)) {
    return data as unknown as WinLossData;
  }

  const summary = (data.summary ?? {}) as Record<string, number>;
  const wins = summary.wins ?? summary.won ?? 0;
  const losses = summary.losses ?? summary.lost ?? 0;
  const decided = wins + losses;
  const stallReasons = Array.isArray(data.stallReasons)
    ? (data.stallReasons as Array<{ reason: string; count: number }>)
    : [];

  return {
    summary: {
      wins,
      losses,
      decided,
      winRate:
        typeof summary.winRate === 'number'
          ? summary.winRate
          : decided > 0
            ? Math.round((wins / decided) * 100)
            : 0,
      untaggedDeclines: losses,
      taggedDeclines: 0,
    },
    byReason: stallReasons.map((row) => ({
      reason: 'OTHER' as DeclineReason,
      label: row.reason,
      declined: row.count,
      shareOfLosses: losses > 0 ? Math.round((row.count / losses) * 100) : 0,
    })),
    byServiceMix: [],
    byClientType: [],
    byClientRelationship: [],
    recentLosses: [],
  };
}

const Analytics = () => {
  const { tenant } = useAuthStore();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [timeToDecision, setTimeToDecision] = useState<TimeToDecisionData | null>(null);
  const [winLoss, setWinLoss] = useState<WinLossData | null>(null);
  const [proposalFunnel, setProposalFunnel] = useState<ProposalFunnelData | null>(null);
  const [funnelDateRange, setFunnelDateRange] = useState<'30' | '90' | '180' | '365'>('90');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadAnalytics is recreated each render; funnelDateRange is its only real input
  }, [funnelDateRange]);

  const loadAnalytics = async () => {
    try {
      setIsLoading(true);
      const endDate = new Date().toISOString();
      const startDate = new Date(
        Date.now() - Number(funnelDateRange) * 24 * 60 * 60 * 1000
      ).toISOString();

      const [dashboardRes, funnelRes, pipelineRes, timeRes, winLossRes, proposalFunnelRes] =
        await Promise.all([
          apiClient.get('/analytics/dashboard') as any,
          apiClient.get('/analytics/funnel') as any,
          apiClient.get('/analytics/revenue-pipeline') as any,
          apiClient.get('/analytics/time-to-decision') as any,
          apiClient.get('/analytics/win-loss') as any,
          apiClient.getProposalFunnel({ startDate, endDate }) as any,
        ]);

      if (dashboardRes.success) setData(dashboardRes.data);
      if (funnelRes.success) setFunnel(funnelRes.data);
      if (pipelineRes.success) setPipeline(pipelineRes.data);
      if (timeRes.success) setTimeToDecision(timeRes.data);
      if (winLossRes.success) setWinLoss(normalizeWinLoss(winLossRes.data));
      if (proposalFunnelRes.success) setProposalFunnel(proposalFunnelRes.data);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      maximumFractionDigits: 0,
    }).format(value);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <SkeletonStats count={4} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass-tile p-6 h-80 animate-pulse" />
          <div className="glass-tile p-6 h-80 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="glass-tile p-12 text-center">
          <ChartPieIcon className="mx-auto h-16 w-16 text-slate-300 mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
            No data available
          </h2>
          <p className="text-slate-600 dark:text-slate-300 mb-4">
            Start creating proposals to see analytics
          </p>
          <button onClick={loadAnalytics} className="btn-secondary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-4 -mt-2">
        <select
          value={funnelDateRange}
          onChange={(e) => setFunnelDateRange(e.target.value as typeof funnelDateRange)}
          className="input-field w-auto text-sm"
          aria-label="Proposal funnel date range"
        >
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="180">Last 6 months</option>
          <option value="365">Last 12 months</option>
        </select>
        <button onClick={loadAnalytics} className="btn-secondary">
          <BoltIcon className="h-4 w-4 mr-2" />
          Refresh Data
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Proposals"
          value={data.proposals.total}
          change={data.proposals.growth}
          changeType={data.proposals.growth >= 0 ? 'positive' : 'negative'}
          icon={DocumentTextIcon}
        />
        <StatCard
          title="Total Revenue"
          value={formatCurrency(data.revenue.total)}
          icon={CurrencyPoundIcon}
        />
        <StatCard
          title="Conversion Rate"
          value={data.conversion.rate}
          suffix="%"
          icon={CheckCircleIcon}
        />
        <StatCard title="Active Clients" value={data.clients.active} icon={UsersIcon} />
      </div>

      {/* Pipeline + Time to Decision */}
      {pipeline && timeToDecision && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RevenuePipeline data={pipeline} formatCurrency={formatCurrency} />
          <TimeToDecision data={timeToDecision} />
        </div>
      )}

      {/* Proposal funnel (sent → paid) */}
      {proposalFunnel && (
        <div className="grid grid-cols-1 gap-6">
          <ProposalFunnelChart data={proposalFunnel} />
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SimpleBarChart data={data.monthlyTrend} />
        {funnel && <ConversionFunnel data={funnel} />}
      </div>

      {/* Win / Loss analytics (W3.6) */}
      {winLoss && <WinLossSection data={winLoss} formatCurrency={formatCurrency} />}

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopServicesTable services={data.topServices} />

        <RecurringRevenueWidget />

        <FeeBenchmarkWidget />

        {/* Status Breakdown */}
        <div className="glass-tile p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            Proposal Status Breakdown
          </h3>
          <div className="space-y-3">
            {Object.entries(data.proposals.statusBreakdown).map(([status, count]) => (
              <div
                key={status}
                className="flex items-center justify-between p-3 bg-white/40 dark:bg-slate-700/40 rounded-lg"
              >
                <div className="flex items-center">
                  <span
                    className={`w-3 h-3 rounded-full mr-3 ${
                      status === 'ACCEPTED'
                        ? 'bg-green-500'
                        : status === 'SENT'
                          ? 'bg-blue-500'
                          : status === 'DRAFT'
                            ? 'bg-slate-400'
                            : status === 'DECLINED' || status === 'LOST'
                              ? 'bg-red-500'
                              : status === 'VIEWED'
                                ? 'bg-amber-500'
                                : status === 'WITHDRAWN'
                                  ? 'bg-orange-500'
                                  : status === 'ARCHIVED'
                                    ? 'bg-slate-500'
                                    : 'bg-slate-300'
                    }`}
                  />
                  <span className="font-medium text-slate-900 dark:text-white">
                    {status === 'LOST'
                      ? 'Lost'
                      : status === 'ARCHIVED'
                        ? 'Archived'
                        : status === 'WITHDRAWN'
                          ? 'Rescinded'
                          : status.charAt(0) + status.slice(1).toLowerCase()}
                  </span>
                </div>
                <span className="font-semibold text-slate-900 dark:text-white">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
