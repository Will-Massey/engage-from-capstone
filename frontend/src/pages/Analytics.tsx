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

const StatCard = ({
  title,
  value,
  change,
  changeType,
  icon: Icon,
  suffix = '',
}: {
  title: string;
  value: string | number;
  change?: number;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: any;
  suffix?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="glass-tile p-6"
  >
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-slate-600">{title}</p>
        <p className="mt-2 text-3xl font-bold text-slate-900">
          {value}
          {suffix && <span className="text-lg font-normal text-slate-500">{suffix}</span>}
        </p>
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
      <div className="p-3 bg-white/50 rounded-lg">
        <Icon className="h-6 w-6 text-slate-600" />
      </div>
    </div>
  </motion.div>
);

const SimpleBarChart = ({ data }: { data: AnalyticsData['monthlyTrend'] }) => {
  const maxValue = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="glass-tile p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">Proposal Activity (6 Months)</h3>
      <div className="h-64 flex items-end justify-between gap-2">
        {data.map((item, index) => (
          <div key={index} className="flex-1 flex flex-col items-center">
            <div className="w-full flex gap-1 justify-center">
              {/* Total proposals bar */}
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${(item.count / maxValue) * 100}%` }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="w-4 bg-primary-500 rounded-t"
                title={`${item.count} proposals`}
              />
              {/* Accepted proposals bar */}
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
          <span className="text-sm text-slate-600">Created</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-3 bg-green-500 rounded mr-2" />
          <span className="text-sm text-slate-600">Accepted</span>
        </div>
      </div>
    </div>
  );
};

const TopServicesTable = ({ services }: { services: AnalyticsData['topServices'] }) => (
  <div className="glass-tile p-6">
    <h3 className="text-lg font-semibold text-slate-900 mb-4">Top Services</h3>
    <div className="space-y-4">
      {services.map((service, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1 }}
          className="flex items-center justify-between p-3 bg-white/40 rounded-lg"
        >
          <div className="flex items-center">
            <span className="w-6 h-6 flex items-center justify-center text-sm font-medium text-slate-500 bg-white/50 rounded-full mr-3">
              {index + 1}
            </span>
            <span className="font-medium text-slate-900">{service.name}</span>
          </div>
          <div className="text-right">
            <p className="font-semibold text-slate-900">£{service.revenue.toLocaleString()}</p>
            <p className="text-xs text-slate-500">{service.count} proposals</p>
          </div>
        </motion.div>
      ))}
    </div>
  </div>
);

const ConversionFunnel = ({ data }: { data: AnalyticsData['conversion'] }) => {
  const stages = [
    { name: 'Sent', count: data.sent, color: 'bg-blue-500' },
    { name: 'Accepted', count: data.accepted, color: 'bg-green-500' },
  ];

  return (
    <div className="glass-tile p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">Conversion Funnel</h3>
      <div className="space-y-3">
        {stages.map((stage, index) => (
          <div key={stage.name}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-slate-700">{stage.name}</span>
              <span className="text-sm font-semibold text-slate-900">{stage.count}</span>
            </div>
            <div className="h-8 bg-white/30 rounded-lg overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{
                  width: `${(stage.count / Math.max(data.sent, 1)) * 100}%`,
                }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className={`h-full ${stage.color} rounded-lg`}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-white/10">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-600">Conversion Rate</span>
          <span className="text-2xl font-bold text-slate-900">{data.rate}%</span>
        </div>
      </div>
    </div>
  );
};

const Analytics = () => {
  const { tenant } = useAuthStore();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setIsLoading(true);
      const response = (await apiClient.get('/analytics/dashboard')) as any;
      if (response.success) {
        setData(response.data);
      }
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
          <p className="mt-1 text-sm text-slate-600">Track your proposal performance and revenue</p>
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
          <h2 className="text-xl font-semibold text-slate-900 mb-2">No data available</h2>
          <p className="text-slate-600 mb-4">Start creating proposals to see analytics</p>
          <button onClick={loadAnalytics} className="btn-secondary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      maximumFractionDigits: 0,
    }).format(value);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
          <p className="mt-1 text-sm text-slate-600">Track your proposal performance and revenue</p>
        </div>
        <button onClick={loadAnalytics} className="btn-secondary">
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

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SimpleBarChart data={data.monthlyTrend} />
        <ConversionFunnel data={data.conversion} />
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopServicesTable services={data.topServices} />

        {/* Status Breakdown */}
        <div className="glass-tile p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Proposal Status Breakdown</h3>
          <div className="space-y-3">
            {Object.entries(data.proposals.statusBreakdown).map(([status, count]) => (
              <div
                key={status}
                className="flex items-center justify-between p-3 bg-white/40 rounded-lg"
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
                              : 'bg-amber-500'
                    }`}
                  />
                  <span className="font-medium text-slate-900">
                    {status.charAt(0) + status.slice(1).toLowerCase()}
                  </span>
                </div>
                <span className="font-semibold text-slate-900">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
