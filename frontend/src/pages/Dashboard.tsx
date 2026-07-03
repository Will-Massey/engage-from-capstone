import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  DocumentTextIcon,
  UsersIcon,
  CurrencyPoundIcon,
  CheckCircleIcon,
  ArrowTrendingUpIcon,
  ClockIcon,
  ChartBarIcon,
  SparklesIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  CalendarIcon,
  EnvelopeIcon,
  BellIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../utils/api';
import { useAuthStore } from '../stores/authStore';
import QuickStart from '../components/dashboard/QuickStart';
import ClaraAttentionQueue from '../components/dashboard/ClaraAttentionQueue';
import FirstProposalWizard from '../components/onboarding/FirstProposalWizard';
import { isFirstProposalWizardDismissed } from '../components/onboarding/firstProposalWizardStorage';

const RevenueAndPieCharts = lazy(() =>
  import('./DashboardRecharts').then((m) => ({ default: m.RevenueAndPieCharts }))
);
const WeeklyActivityChart = lazy(() =>
  import('./DashboardRecharts').then((m) => ({ default: m.WeeklyActivityChart }))
);

// Default/loading data for charts (will be replaced with API data)
const defaultRevenueData = [
  { name: 'Jan', value: 0 },
  { name: 'Feb', value: 0 },
  { name: 'Mar', value: 0 },
  { name: 'Apr', value: 0 },
  { name: 'May', value: 0 },
  { name: 'Jun', value: 0 },
];

const defaultProposalStatusData = [
  { name: 'Draft', value: 0, color: '#9CA3AF' },
  { name: 'Sent', value: 0, color: '#3B82F6' },
  { name: 'Accepted', value: 0, color: '#10B981' },
  { name: 'Declined', value: 0, color: '#EF4444' },
];

const defaultWeeklyActivity = [
  { day: 'Mon', proposals: 0, views: 0 },
  { day: 'Tue', proposals: 0, views: 0 },
  { day: 'Wed', proposals: 0, views: 0 },
  { day: 'Thu', proposals: 0, views: 0 },
  { day: 'Fri', proposals: 0, views: 0 },
  { day: 'Sat', proposals: 0, views: 0 },
  { day: 'Sun', proposals: 0, views: 0 },
];

const defaultRecentActivity: any[] = [];

function ChartsRowSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse" aria-hidden>
      <div className="card lg:col-span-2 p-6 h-80 rounded-xl bg-slate-100/80 dark:bg-slate-800/40" />
      <div className="card p-6 h-80 rounded-xl bg-slate-100/80 dark:bg-slate-800/40" />
    </div>
  );
}

function WeeklyChartSkeleton() {
  return (
    <div
      className="card p-6 lg:col-span-2 h-80 rounded-xl animate-pulse bg-slate-100/80 dark:bg-slate-800/40"
      aria-hidden
    />
  );
}

const Dashboard = () => {
  const { tenant, user } = useAuthStore();
  const [stats, setStats] = useState({
    totalProposals: 0,
    sentProposals: 0,
    viewedProposals: 0,
    acceptedProposals: 0,
    pipelineValue: 0,
    totalClients: 0,
    mtditsaClients: 0,
    totalRevenue: 0,
    conversionRate: 0,
    viewRate: 0,
    signRate: 0,
    recentProposals: [] as any[],
    recentClients: [] as any[],
  });
  const [chartData, setChartData] = useState({
    revenueData: defaultRevenueData,
    proposalStatusData: defaultProposalStatusData,
    weeklyActivity: defaultWeeklyActivity,
    recentActivity: defaultRecentActivity,
  });
  const [attentionClients, setAttentionClients] = useState<any[]>([]);
  const [renewalProposals, setRenewalProposals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30days');
  const [sentProposalCount, setSentProposalCount] = useState<number | null>(null);
  const [showFirstProposalWizard, setShowFirstProposalWizard] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    loadDashboardData();
  }, []);

  useEffect(() => {
    if (searchParams.get('openWizard') === '1') {
      setShowFirstProposalWizard(true);
      const next = new URLSearchParams(searchParams);
      next.delete('openWizard');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (isLoading || sentProposalCount === null) return;
    if (sentProposalCount === 0 && !isFirstProposalWizardDismissed(tenant?.id)) {
      setShowFirstProposalWizard(true);
    }
  }, [isLoading, sentProposalCount, tenant?.id]);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);

      // Guard against hanging requests during backend cold-start
      const timeout = (promise: Promise<any>, ms: number) =>
        Promise.race([
          promise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timed out')), ms)
          ),
        ]);

      const [proposalsRes, clientsRes, dashboardRes] = await Promise.all([
        timeout(apiClient.getProposals({ limit: 5 }) as Promise<any>, 15000),
        timeout(apiClient.getClients({ limit: 5 }) as Promise<any>, 15000),
        timeout(apiClient.getDashboardStats() as Promise<any>, 15000),
      ]);

      const proposals = proposalsRes.data || [];
      const clients = clientsRes.data || [];

      const dash = dashboardRes.success ? dashboardRes.data : null;

      setStats({
        totalProposals: dash?.proposals?.total ?? proposalsRes.meta?.total ?? 0,
        sentProposals: dash?.proposals?.sent ?? 0,
        viewedProposals: dash?.proposals?.viewed ?? 0,
        acceptedProposals: dash?.proposals?.signed ?? dash?.revenue?.accepted ?? 0,
        pipelineValue: dash?.pipeline?.value ?? 0,
        totalClients: dash?.clients?.total ?? clientsRes.meta?.total ?? 0,
        mtditsaClients: clients.filter((c: any) => c.mtditsaEligible).length,
        totalRevenue: dash?.revenue?.total ?? 0,
        conversionRate: dash?.conversion?.rate ?? 0,
        viewRate: dash?.conversion?.viewRate ?? 0,
        signRate: dash?.conversion?.signRate ?? 0,
        recentProposals: proposals.slice(0, 5),
        recentClients: clients.slice(0, 5),
      });

      if (dash) {
        setChartData({
          revenueData:
            dash.revenueData?.length > 0 ? dash.revenueData : defaultRevenueData,
          proposalStatusData:
            dash.proposalStatusData?.length > 0
              ? dash.proposalStatusData
              : defaultProposalStatusData,
          weeklyActivity:
            dash.weeklyActivity?.length > 0 ? dash.weeklyActivity : defaultWeeklyActivity,
          recentActivity: dash.recentActivity || [],
        });
      }

      // Fetch clients needing attention (new automated lifecycle feature)
      try {
        const clientsRes = (await timeout(apiClient.getClients({ limit: 100 }) as Promise<any>, 10000)) as any;
        const attentionStages = ['AML_PENDING', 'INFO_REQUESTED', 'ENGAGEMENT_LETTER_SENT'];
        const needing = (clientsRes.data || []).filter((c: any) => attentionStages.includes(c.lifecycleStage));
        setAttentionClients(needing.slice(0, 8));
      } catch {}

      try {
        const sentCountRes = (await timeout(
          apiClient.getProposals({ limit: 1, status: 'SENT' }) as Promise<any>,
          10000
        )) as any;
        setSentProposalCount(sentCountRes.meta?.total ?? 0);
      } catch {
        setSentProposalCount(null);
      }

      try {
        const allProposals = (await timeout(
          apiClient.getProposals({ limit: 50, status: 'SENT' }) as Promise<any>,
          10000
        )) as any;
        const viewed = (await timeout(
          apiClient.getProposals({ limit: 50, status: 'VIEWED' }) as Promise<any>,
          10000
        )) as any;
        const accepted = (await timeout(
          apiClient.getProposals({ limit: 50, status: 'ACCEPTED' }) as Promise<any>,
          10000
        )) as any;
        const combined = [
          ...(allProposals.data || []),
          ...(viewed.data || []),
          ...(accepted.data || []),
        ];
        const seen = new Set<string>();
        const unique = combined.filter((p: any) => {
          if (seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        });
        const now = Date.now();
        const in14Days = 14 * 24 * 60 * 60 * 1000;
        const in30Days = 30 * 24 * 60 * 60 * 1000;
        const expiring = unique
          .filter((p: any) => {
            if (p.renewalDate) {
              const renewalMs = new Date(p.renewalDate).getTime();
              return renewalMs >= now && renewalMs - now <= in30Days;
            }
            if (['SENT', 'VIEWED'].includes(p.status) && p.validUntil) {
              return new Date(p.validUntil).getTime() - now <= in14Days;
            }
            return false;
          })
          .sort((a: any, b: any) => {
            const aDate = a.renewalDate || a.validUntil;
            const bDate = b.renewalDate || b.validUntil;
            return new Date(aDate).getTime() - new Date(bDate).getTime();
          })
          .slice(0, 8);
        setRenewalProposals(expiring);
      } catch {}
    } catch (error) {
      // Error handled by UI - will use default empty data
    } finally {
      setIsLoading(false);
    }
  };

  const statsCards = [
    {
      name: 'Pipeline Value',
      value: `£${stats.pipelineValue.toLocaleString()}`,
      change: `${stats.sentProposals} sent · ${stats.viewedProposals} viewed`,
      trend: 'neutral' as 'up' | 'down' | 'neutral',
      icon: CurrencyPoundIcon,
      color: 'from-emerald-500 to-emerald-600',
      bgGradient: 'from-emerald-500/10 to-emerald-600/5',
    },
    {
      name: 'Signed Proposals',
      value: stats.acceptedProposals,
      change: `£${stats.totalRevenue.toLocaleString()} accepted`,
      trend: 'up' as const,
      icon: CheckCircleIcon,
      color: 'from-blue-500 to-blue-600',
      bgGradient: 'from-blue-500/10 to-blue-600/5',
    },
    {
      name: 'Conversion Rate',
      value: `${stats.conversionRate}%`,
      change: `${stats.viewRate}% viewed · ${stats.signRate}% signed`,
      trend: stats.conversionRate > 0 ? ('up' as const) : ('neutral' as const),
      icon: ChartBarIcon,
      color: 'from-purple-500 to-purple-600',
      bgGradient: 'from-purple-500/10 to-purple-600/5',
    },
    {
      name: 'Total Clients',
      value: stats.totalClients,
      change: `${stats.totalProposals} proposals`,
      trend: 'neutral' as 'up' | 'down' | 'neutral',
      icon: UsersIcon,
      color: 'from-amber-500 to-orange-500',
      bgGradient: 'from-amber-500/10 to-orange-500/5',
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <FirstProposalWizard
        open={showFirstProposalWizard}
        onClose={() => setShowFirstProposalWizard(false)}
        onSent={() => {
          setSentProposalCount(1);
          void loadDashboardData();
        }}
      />

      {sentProposalCount === 0 && (
        <div className="rounded-2xl border border-violet-200/80 dark:border-violet-800/60 bg-gradient-to-r from-violet-50/90 via-white to-indigo-50/70 dark:from-violet-950/40 dark:via-slate-900/50 dark:to-indigo-950/30 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Ready to send your first proposal?</p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              The guided wizard walks you from client to sent email in five steps.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowFirstProposalWizard(true)}
            className="btn-primary text-sm shrink-0"
          >
            Open first proposal wizard
          </button>
        </div>
      )}

      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <img src="/images/capstone-icon.svg" alt="Capstone" className="h-10 w-10" />
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Good{' '}
                {new Date().getHours() < 12
                  ? 'morning'
                  : new Date().getHours() < 17
                    ? 'afternoon'
                    : 'evening'}
                , {user?.firstName}! 👋
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Here's what's happening with {tenant?.name || 'your practice'} today
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="input-field w-40"
          >
            <option value="7days">Last 7 days</option>
            <option value="30days">Last 30 days</option>
            <option value="90days">Last 90 days</option>
            <option value="year">This year</option>
          </select>
          <Link
            to="/proposals/wizard"
            className="btn-primary bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700"
          >
            <SparklesIcon className="h-4 w-4 mr-2" />
            Create proposal in 5 minutes
          </Link>
        </div>
      </div>

      <QuickStart />

      <ClaraAttentionQueue />

      {/* Quick Stats - Glassmorphism Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsCards.map((stat, index) => (
          <div
            key={stat.name}
            className="glass-tile group cursor-pointer"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="flex items-center justify-between">
              <div
                className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} text-white shadow-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}
              >
                <stat.icon className="h-6 w-6" />
              </div>
              <div
                className={`flex items-center text-sm font-medium px-2.5 py-1 rounded-full backdrop-blur-sm ${
                  stat.trend === 'up'
                    ? 'bg-emerald-100/80 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : stat.trend === 'down'
                      ? 'bg-red-100/80 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                      : 'bg-slate-100/80 text-slate-600 dark:bg-slate-800/80 dark:text-slate-400'
                }`}
              >
                {stat.trend === 'up' && <ArrowUpIcon className="h-3.5 w-3.5 mr-1" />}
                {stat.trend === 'down' && <ArrowDownIcon className="h-3.5 w-3.5 mr-1" />}
                {stat.change}
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {stat.name}
              </p>
              <p className="text-3xl font-bold mt-1 text-slate-900 dark:text-slate-100">
                {stat.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* New: Client Lifecycle / Automation Attention (makes the touchpoint system visible and useful) */}
      <div className="glass-tile p-5 border border-primary-100 dark:border-primary-900/60 bg-gradient-to-br from-white to-primary-50/40 dark:from-slate-900 dark:to-primary-950/20">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-2xl bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-300">
              <SparklesIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold">Automated client journeys are running</div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                Proposals that get signed now trigger a beautiful sequence of emails and reminders. Visit any client’s <span className="font-medium">Lifecycle</span> tab to see progress and take action.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link to="/clients" className="btn-secondary text-sm">View clients</Link>
            <Link to="/settings?tab=automation" className="btn-primary text-sm">Manage automation</Link>
          </div>
        </div>
      </div>

      {/* Clients Needing Attention - directly surfaces the touchpoint automation */}
      {attentionClients.length > 0 && (
        <div className="glass-tile p-6 border border-amber-200 dark:border-amber-900/50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BellIcon className="h-5 w-5 text-amber-500" />
              <h2 className="font-semibold text-lg">Clients needing attention</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40">{attentionClients.length}</span>
            </div>
            <Link to="/clients" className="text-sm text-primary-600 hover:underline">View all clients</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {attentionClients.map((client: any) => (
              <Link
                key={client.id}
                to={`/clients/${client.id}`}
                className="group flex items-center justify-between rounded-2xl border border-slate-200 dark:border-slate-700 p-4 hover:border-amber-300 hover:bg-amber-50/40 dark:hover:bg-amber-950/10 transition-all"
              >
                <div>
                  <div className="font-medium text-sm group-hover:text-primary-600">{client.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{client.lifecycleStage?.replace(/_/g, ' ')}</div>
                </div>
                <div className="text-amber-600 opacity-70 group-hover:opacity-100 transition">→</div>
              </Link>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">These clients are in stages that usually require action or have pending automated touchpoints.</p>
        </div>
      )}

      {/* Renewal pipeline — proposals expiring soon */}
      {renewalProposals.length > 0 && (
        <div className="glass-tile p-6 border border-blue-200 dark:border-blue-900/50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-blue-500" />
              <h2 className="font-semibold text-lg">Renewals & expiring proposals</h2>
            </div>
            <Link to="/proposals" className="text-sm text-primary-600 hover:underline">
              View all proposals
            </Link>
          </div>
          <div className="space-y-2">
            {renewalProposals.map((p: any) => (
              <Link
                key={p.id}
                to={`/proposals/${p.id}`}
                className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 hover:border-blue-300 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition"
              >
                <div>
                  <div className="font-medium text-sm">{p.title || p.reference}</div>
                  <div className="text-xs text-slate-500">{p.client?.name}</div>
                </div>
                <div className="text-xs text-blue-600 dark:text-blue-300 font-medium">
                  {p.renewalDate
                    ? `Renewal ${new Date(p.renewalDate).toLocaleDateString('en-GB')}`
                    : `Expires ${new Date(p.validUntil).toLocaleDateString('en-GB')}`}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* MTD ITSA Alert */}
      {stats.mtditsaClients > 0 && (
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 p-6 text-white shadow-lg">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
          <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
          <div className="relative flex items-start">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              <ClockIcon className="h-6 w-6" />
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-semibold">MTD ITSA Compliance</h3>
              <p className="mt-1 text-blue-100">
                You have <strong>{stats.mtditsaClients} clients</strong> who need to maintain
                Making Tax Digital compliance. Review your clients and ensure they're up to date.
              </p>
              <Link
                to="/clients"
                className="mt-3 inline-flex items-center text-sm font-medium text-white hover:text-blue-100"
              >
                Review clients
                <ArrowTrendingUpIcon className="ml-1 h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Charts: Recharts loaded on demand (separate chunk) */}
      <Suspense fallback={<ChartsRowSkeleton />}>
        <RevenueAndPieCharts
          revenueData={chartData.revenueData}
          proposalStatusData={chartData.proposalStatusData}
        />
      </Suspense>

      {/* Activity & Recent Items - Glass Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Suspense fallback={<WeeklyChartSkeleton />}>
          <WeeklyActivityChart weeklyActivity={chartData.weeklyActivity} />
        </Suspense>

        {/* Recent Activity */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title">Recent Activity</h2>
            <button className="text-sm text-primary-600 hover:text-primary-700 font-medium">
              View all
            </button>
          </div>
          <div className="space-y-4">
            {chartData.recentActivity.length === 0 ? (
              <div className="text-center py-8">
                <ClockIcon className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-sm text-slate-500 dark:text-slate-400">No recent activity</p>
              </div>
            ) : (
              chartData.recentActivity.map((activity: any) => (
                <div
                  key={activity.id}
                  className="flex items-start space-x-3 p-2 rounded-lg hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      activity.color === 'blue'
                        ? 'bg-blue-100/80 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300'
                        : activity.color === 'green'
                          ? 'bg-emerald-100/80 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : activity.color === 'purple'
                            ? 'bg-purple-100/80 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300'
                            : activity.color === 'orange'
                              ? 'bg-amber-100/80 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300'
                              : 'bg-slate-100/80 text-slate-600 dark:bg-slate-800/80 dark:text-slate-400'
                    }`}
                  >
                    <DocumentTextIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900 dark:text-slate-100">{activity.message}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {activity.time}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Two column layout - Glass Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Proposals */}
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
            <div>
              <h2 className="section-title">Recent Proposals</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">Latest proposal activity</p>
            </div>
            <Link
              to="/proposals"
              className="text-sm text-primary-600 hover:text-primary-500 font-medium"
            >
              View all
            </Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {stats.recentProposals.length === 0 ? (
              <div className="p-6 text-center">
                <SparklesIcon className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-slate-600 dark:text-slate-400">No proposals yet.</p>
                <Link
                  to="/proposals/wizard"
                  className="text-primary-600 font-medium hover:text-primary-700"
                >
                  Create your first proposal
                </Link>
              </div>
            ) : (
              stats.recentProposals.map((proposal: any) => (
                <Link
                  key={proposal.id}
                  to={`/proposals/${proposal.id}`}
                  className="block px-6 py-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {proposal.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {proposal.client?.name} • {proposal.reference}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <span
                        className={`badge ${
                          proposal.status === 'ACCEPTED'
                            ? 'badge-green'
                            : proposal.status === 'SENT'
                              ? 'badge-blue'
                              : proposal.status === 'DRAFT'
                                ? 'badge-gray'
                                : 'badge-amber'
                        }`}
                      >
                        {proposal.status}
                      </span>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mt-1">
                        £{proposal.total?.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Recent Clients */}
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
            <div>
              <h2 className="section-title">Recent Clients</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">New and updated clients</p>
            </div>
            <Link
              to="/clients"
              className="text-sm text-primary-600 hover:text-primary-500 font-medium"
            >
              View all
            </Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {stats.recentClients.length === 0 ? (
              <div className="p-6 text-center">
                <UsersIcon className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-slate-600 dark:text-slate-400">No clients yet.</p>
                <Link
                  to="/clients/new"
                  className="text-primary-600 font-medium hover:text-primary-700"
                >
                  Add your first client
                </Link>
              </div>
            ) : (
              stats.recentClients.map((client: any) => (
                <Link
                  key={client.id}
                  to={`/clients/${client.id}`}
                  className="block px-6 py-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center min-w-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-medium text-sm">
                        {client.name?.charAt(0)}
                      </div>
                      <div className="ml-3 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                          {client.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {client.companyType?.replace(/_/g, ' ')} • {client.contactEmail}
                        </p>
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      {client.mtditsaEligible && (
                        <span className="badge badge-amber">MTD ITSA</span>
                      )}
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {client._count?.proposals || 0} proposals
                      </p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions - Glass Tiles */}
      <div className="card p-6">
        <h2 className="section-title mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Link
            to="/proposals/wizard"
            className="glass-tile group text-center hover:border-violet-300 dark:hover:border-violet-700"
          >
            <div className="w-14 h-14 mx-auto bg-gradient-to-br from-violet-500 to-indigo-600 text-white rounded-xl shadow-lg mb-3 group-hover:scale-110 transition-transform flex items-center justify-center">
              <SparklesIcon className="h-7 w-7" />
            </div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">5-min wizard</p>
          </Link>
          <Link
            to="/clients/new"
            className="glass-tile group text-center hover:border-emerald-300 dark:hover:border-emerald-700"
          >
            <div className="w-14 h-14 mx-auto bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-xl shadow-lg mb-3 group-hover:scale-110 transition-transform flex items-center justify-center">
              <UsersIcon className="h-7 w-7" />
            </div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Add Client</p>
          </Link>
          <Link
            to="/services"
            className="glass-tile group text-center hover:border-purple-300 dark:hover:border-purple-700"
          >
            <div className="w-14 h-14 mx-auto bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-xl shadow-lg mb-3 group-hover:scale-110 transition-transform flex items-center justify-center">
              <SparklesIcon className="h-7 w-7" />
            </div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Services</p>
          </Link>
          <button className="glass-tile group text-center hover:border-amber-300 dark:hover:border-amber-700">
            <div className="w-14 h-14 mx-auto bg-gradient-to-br from-amber-500 to-orange-500 text-white rounded-xl shadow-lg mb-3 group-hover:scale-110 transition-transform flex items-center justify-center">
              <BellIcon className="h-7 w-7" />
            </div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Reminders</p>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
