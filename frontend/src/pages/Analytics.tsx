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
} from '@heroicons/react/24/outline';
import { apiClient } from '../utils/api';
import { useAuthStore } from '../stores/authStore';
import { format, parseISO } from 'date-fns';
import { SkeletonStats } from '../components/skeleton';

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
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Proposal Activity (6 Months)</h3>
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
          <span className="text-sm text-slate-600 dark:text-slate-400">Created</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-3 bg-green-500 rounded mr-2" />
          <span className="text-sm text-slate-600 dark:text-slate-400">Accepted</span>
        </div>
      </div>
    </div>
  );
};

const ConversionFunnel = ({ data }: { data: FunnelData }) => {
  const maxCount = Math.max(...data.stages.map((s) => s.count), 1);

  return (
    <div className="glass-tile p-6">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Conversion Funnel</h3>
      <div className="space-y-4">
        {data.stages.map((stage, index) => {
          const prevCount = index > 0 ? data.stages[index - 1].count : stage.count;
          const dropOff = index > 0 && prevCount > 0 ? Math.round(((prevCount - stage.count) / prevCount) * 100) : 0;

          return (
            <div key={stage.name}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{stage.name}</span>
                <div className="flex items-center gap-2">
                  {dropOff > 0 && index > 0 && (
                    <span className="text-xs text-red-500">-{dropOff}%</span>
                  )}
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">{stage.count}</span>
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
          <p className="text-xs text-slate-500 dark:text-slate-400">Sent → Viewed</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">{data.conversionRates.sentToViewed}%</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500 dark:text-slate-400">Viewed → Accepted</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">{data.conversionRates.viewedToAccepted}%</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500 dark:text-slate-400">Sent → Accepted</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">{data.conversionRates.sentToAccepted}%</p>
        </div>
      </div>
    </div>
  );
};

const RevenuePipeline = ({ data, formatCurrency }: { data: PipelineData; formatCurrency: (n: number) => string }) => (
  <div className="glass-tile p-6">
    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Revenue Pipeline</h3>
    <div className="grid grid-cols-2 gap-4 mb-4">
      <div className="p-4 bg-white/40 dark:bg-slate-700/40 rounded-lg">
        <p className="text-xs text-slate-500 dark:text-slate-400">Pipeline Value</p>
        <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(data.pipeline.value)}</p>
        <p className="text-xs text-slate-500">{data.pipeline.count} proposals</p>
      </div>
      <div className="p-4 bg-white/40 dark:bg-slate-700/40 rounded-lg">
        <p className="text-xs text-slate-500 dark:text-slate-400">Accepted Revenue</p>
        <p className="text-xl font-bold text-green-600">{formatCurrency(data.accepted.value)}</p>
      </div>
      <div className="p-4 bg-white/40 dark:bg-slate-700/40 rounded-lg">
        <p className="text-xs text-slate-500 dark:text-slate-400">Monthly Recurring</p>
        <p className="text-xl font-bold text-primary-600">{formatCurrency(data.monthlyRecurring)}</p>
        <p className="text-xs text-slate-500">/month</p>
      </div>
      <div className="p-4 bg-white/40 dark:bg-slate-700/40 rounded-lg">
        <p className="text-xs text-slate-500 dark:text-slate-400">Forecast (30% conv.)</p>
        <p className="text-xl font-bold text-amber-600">{formatCurrency(data.forecast.expectedValue)}</p>
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
        <p className="text-xs text-slate-500 dark:text-slate-400">Avg. to View</p>
      </div>
      <div className="text-center p-4 bg-white/40 dark:bg-slate-700/40 rounded-lg">
        <CheckCircleIcon className="h-6 w-6 text-green-500 mx-auto mb-2" />
        <p className="text-2xl font-bold text-slate-900 dark:text-white">{data.avgDaysToAccept}d</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">Avg. to Accept</p>
      </div>
      <div className="text-center p-4 bg-white/40 dark:bg-slate-700/40 rounded-lg">
        <FunnelIcon className="h-6 w-6 text-red-500 mx-auto mb-2" />
        <p className="text-2xl font-bold text-slate-900 dark:text-white">{data.avgDaysToDecline}d</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">Avg. to Decline</p>
      </div>
    </div>
    <p className="text-xs text-slate-500 text-center mt-3">
      Based on {data.sampleSize.accepted} accepted, {data.sampleSize.declined} declined proposals
    </p>
  </div>
);

const TopServicesTable = ({ services }: { services: AnalyticsData['topServices'] }) => (
  <div className="glass-tile p-6">
    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Top Services</h3>
    <div className="space-y-3">
      {services.map((service, index) => (
        <div key={index} className="flex items-center justify-between p-3 bg-white/40 dark:bg-slate-700/40 rounded-lg">
          <div className="flex items-center">
            <span className="w-6 h-6 flex items-center justify-center bg-primary-100 dark:bg-primary-900/30 text-primary-600 text-xs font-bold rounded-full mr-3">
              {index + 1}
            </span>
            <span className="font-medium text-slate-900 dark:text-white">{service.name}</span>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(service.revenue)}
            </p>
            <p className="text-xs text-slate-500">{service.count} proposals</p>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const Analytics = () => {
  const { tenant } = useAuthStore();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [timeToDecision, setTimeToDecision] = useState<TimeToDecisionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setIsLoading(true);
      const [dashboardRes, funnelRes, pipelineRes, timeRes] = await Promise.all([
        apiClient.get('/analytics/dashboard') as any,
        apiClient.get('/analytics/funnel') as any,
        apiClient.get('/analytics/revenue-pipeline') as any,
        apiClient.get('/analytics/time-to-decision') as any,
      ]);

      if (dashboardRes.success) setData(dashboardRes.data);
      if (funnelRes.success) setFunnel(funnelRes.data);
      if (pipelineRes.success) setPipeline(pipelineRes.data);
      if (timeRes.success) setTimeToDecision(timeRes.data);
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
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Analytics</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Track your proposal performance and revenue</p>
        </div>
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
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">No data available</h2>
          <p className="text-slate-600 dark:text-slate-400 mb-4">Start creating proposals to see analytics</p>
          <button onClick={loadAnalytics} className="btn-secondary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Analytics</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Track your proposal performance and revenue</p>
        </div>
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

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SimpleBarChart data={data.monthlyTrend} />
        {funnel && <ConversionFunnel data={funnel} />}
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopServicesTable services={data.topServices} />

        {/* Status Breakdown */}
        <div className="glass-tile p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Proposal Status Breakdown</h3>
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
                            : status === 'DECLINED'
                              ? 'bg-red-500'
                              : status === 'VIEWED'
                                ? 'bg-amber-500'
                                : 'bg-slate-300'
                    }`}
                  />
                  <span className="font-medium text-slate-900 dark:text-white">
                    {status.charAt(0) + status.slice(1).toLowerCase()}
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
