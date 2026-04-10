import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { apiClient } from '../utils/api';
import { useAuthStore } from '../stores/authStore';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';

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

const Dashboard = () => {
  const { tenant, user } = useAuthStore();
  const [stats, setStats] = useState({
    totalProposals: 0,
    acceptedProposals: 0,
    totalClients: 0,
    mtditsaClients: 0,
    totalRevenue: 0,
    conversionRate: 0,
    recentProposals: [],
    recentClients: [],
  });
  const [chartData, setChartData] = useState({
    revenueData: defaultRevenueData,
    proposalStatusData: defaultProposalStatusData,
    weeklyActivity: defaultWeeklyActivity,
    recentActivity: defaultRecentActivity,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30days');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);
      
      const [proposalsRes, clientsRes, dashboardRes] = await Promise.all([
        apiClient.getProposals({ limit: 5 }) as Promise<any>,
        apiClient.getClients({ limit: 5 }) as Promise<any>,
        apiClient.getDashboardStats() as Promise<any>,
      ]);

      const proposals = proposalsRes.data || [];
      const clients = clientsRes.data || [];

      const acceptedCount = proposals.filter((p: any) => p.status === 'ACCEPTED').length;
      const totalRevenue = proposals
        .filter((p: any) => p.status === 'ACCEPTED')
        .reduce((sum: number, p: any) => sum + (p.total || 0), 0);

      setStats({
        totalProposals: proposalsRes.meta?.total || 0,
        acceptedProposals: acceptedCount,
        totalClients: clientsRes.meta?.total || 0,
        mtditsaClients: clients.filter((c: any) => c.mtditsaEligible).length,
        totalRevenue,
        conversionRate: proposals.length > 0 ? Math.round((acceptedCount / proposals.length) * 100) : 0,
        recentProposals: proposals.slice(0, 5),
        recentClients: clients.slice(0, 5),
      });

      // Set chart data from API
      if (dashboardRes.success && dashboardRes.data) {
        setChartData({
          revenueData: dashboardRes.data.revenueData?.length > 0 ? dashboardRes.data.revenueData : defaultRevenueData,
          proposalStatusData: dashboardRes.data.proposalStatusData?.length > 0 ? dashboardRes.data.proposalStatusData : defaultProposalStatusData,
          weeklyActivity: dashboardRes.data.weeklyActivity?.length > 0 ? dashboardRes.data.weeklyActivity : defaultWeeklyActivity,
          recentActivity: dashboardRes.data.recentActivity || [],
        });
      }
    } catch (error) {
      // Error handled by UI - will use default empty data
    } finally {
      setIsLoading(false);
    }
  };

  const statsCards = [
    {
      name: 'Total Revenue',
      value: `£${stats.totalRevenue.toLocaleString()}`,
      change: '+12.5%',
      trend: 'up',
      icon: CurrencyPoundIcon,
      color: 'from-emerald-500 to-emerald-600',
      bgGradient: 'from-emerald-500/10 to-emerald-600/5',
    },
    {
      name: 'Active Proposals',
      value: stats.totalProposals,
      change: '+3 this week',
      trend: 'up',
      icon: DocumentTextIcon,
      color: 'from-blue-500 to-blue-600',
      bgGradient: 'from-blue-500/10 to-blue-600/5',
    },
    {
      name: 'Conversion Rate',
      value: `${stats.conversionRate}%`,
      change: '+5.2%',
      trend: 'up',
      icon: ChartBarIcon,
      color: 'from-purple-500 to-purple-600',
      bgGradient: 'from-purple-500/10 to-purple-600/5',
    },
    {
      name: 'Total Clients',
      value: stats.totalClients,
      change: `+${stats.mtditsaClients} MTD ITSA`,
      trend: 'neutral',
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
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <img src="/images/capstone-icon.svg" alt="Capstone" className="h-10 w-10" />
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {user?.firstName}! 👋
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
            to="/proposals/new"
            className="btn-primary bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800"
          >
            <DocumentTextIcon className="h-4 w-4 mr-2" />
            New Proposal
          </Link>
        </div>
      </div>

      {/* Quick Stats - Glassmorphism Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsCards.map((stat, index) => (
          <div
            key={stat.name}
            className="glass-tile group cursor-pointer"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="flex items-center justify-between">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} text-white shadow-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                <stat.icon className="h-6 w-6" />
              </div>
              <div className={`flex items-center text-sm font-medium px-2.5 py-1 rounded-full backdrop-blur-sm ${
                stat.trend === 'up' ? 'bg-emerald-100/80 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 
                stat.trend === 'down' ? 'bg-red-100/80 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 
                'bg-slate-100/80 text-slate-600 dark:bg-slate-800/80 dark:text-slate-400'
              }`}>
                {stat.trend === 'up' && <ArrowUpIcon className="h-3.5 w-3.5 mr-1" />}
                {stat.trend === 'down' && <ArrowDownIcon className="h-3.5 w-3.5 mr-1" />}
                {stat.change}
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{stat.name}</p>
              <p className="text-3xl font-bold mt-1 text-slate-900 dark:text-slate-100">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* MTD ITSA Alert */}
      {stats.mtditsaClients > 0 && (
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-orange-500 to-red-500 p-6 text-white shadow-lg">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
          <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
          <div className="relative flex items-start">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              <ClockIcon className="h-6 w-6" />
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-semibold">MTD ITSA Deadline: April 2026</h3>
              <p className="mt-1 text-orange-100">
                You have <strong>{stats.mtditsaClients} clients</strong> who need to be ready for Making Tax Digital 
                by April 2026. Review your clients and ensure they're prepared.
              </p>
              <Link
                to="/clients"
                className="mt-3 inline-flex items-center text-sm font-medium text-white hover:text-orange-100"
              >
                Review clients
                <ArrowTrendingUpIcon className="ml-1 h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Charts Row - Glass Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <div className="card lg:col-span-2 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="section-title">Revenue Overview</h2>
              <p className="section-subtitle">Monthly revenue from accepted proposals</p>
            </div>
            <div className="flex items-center space-x-2">
              <span className="flex items-center text-sm text-slate-600 dark:text-slate-400">
                <span className="w-3 h-3 rounded-full bg-primary-500 mr-2"></span>
                Revenue
              </span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData.revenueData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" />
                <XAxis dataKey="name" stroke="#94A3B8" fontSize={12} tick={{fill: '#94A3B8'}} />
                <YAxis stroke="#94A3B8" fontSize={12} tick={{fill: '#94A3B8'}} tickFormatter={(value) => `£${value/1000}k`} />
                <Tooltip
                  formatter={(value: number) => [`£${value.toLocaleString()}`, 'Revenue']}
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
                    background: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(12px)'
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#6366F1"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Proposal Status */}
        <div className="card p-6">
          <h2 className="section-title mb-1">Proposal Status</h2>
          <p className="section-subtitle mb-6">Current proposal distribution</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData.proposalStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {chartData.proposalStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
                    background: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(12px)'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-2">
            {chartData.proposalStatusData.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-300">
                <span className="flex items-center">
                  <span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: item.color }}></span>
                  {item.name}
                </span>
                <span className="font-medium text-slate-900 dark:text-slate-100">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Activity & Recent Items - Glass Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weekly Activity Chart */}
        <div className="card p-6 lg:col-span-2">
          <h2 className="section-title mb-1">Weekly Activity</h2>
          <p className="section-subtitle mb-6">Proposals created vs views this week</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData.weeklyActivity}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" />
                <XAxis dataKey="day" stroke="#94A3B8" fontSize={12} tick={{fill: '#94A3B8'}} />
                <YAxis stroke="#94A3B8" fontSize={12} tick={{fill: '#94A3B8'}} />
                <Tooltip
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
                    background: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(12px)'
                  }}
                />
                <Bar dataKey="proposals" fill="#6366F1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="views" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

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
                <div key={activity.id} className="flex items-start space-x-3 p-2 rounded-lg hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    activity.color === 'blue' ? 'bg-blue-100/80 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300' :
                    activity.color === 'green' ? 'bg-emerald-100/80 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300' :
                    activity.color === 'purple' ? 'bg-purple-100/80 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300' :
                    activity.color === 'orange' ? 'bg-amber-100/80 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300' :
                    'bg-slate-100/80 text-slate-600 dark:bg-slate-800/80 dark:text-slate-400'
                  }`}>
                    <DocumentTextIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900 dark:text-slate-100">{activity.message}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{activity.time}</p>
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
            <Link to="/proposals" className="text-sm text-primary-600 hover:text-primary-500 font-medium">
              View all
            </Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {stats.recentProposals.length === 0 ? (
              <div className="p-6 text-center">
                <SparklesIcon className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-slate-600 dark:text-slate-400">No proposals yet.</p>
                <Link to="/proposals/new" className="text-primary-600 font-medium hover:text-primary-700">
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
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{proposal.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {proposal.client?.name} • {proposal.reference}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <span className={`badge ${
                        proposal.status === 'ACCEPTED' ? 'badge-green' :
                        proposal.status === 'SENT' ? 'badge-blue' :
                        proposal.status === 'DRAFT' ? 'badge-gray' :
                        'badge-amber'
                      }`}>
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
            <Link to="/clients" className="text-sm text-primary-600 hover:text-primary-500 font-medium">
              View all
            </Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {stats.recentClients.length === 0 ? (
              <div className="p-6 text-center">
                <UsersIcon className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-slate-600 dark:text-slate-400">No clients yet.</p>
                <Link to="/clients/new" className="text-primary-600 font-medium hover:text-primary-700">
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
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{client.name}</p>
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
          <Link to="/proposals/new" className="glass-tile group text-center hover:border-primary-300 dark:hover:border-primary-700">
            <div className="w-14 h-14 mx-auto bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl shadow-lg mb-3 group-hover:scale-110 transition-transform flex items-center justify-center">
              <DocumentTextIcon className="h-7 w-7" />
            </div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">New Proposal</p>
          </Link>
          <Link to="/clients/new" className="glass-tile group text-center hover:border-emerald-300 dark:hover:border-emerald-700">
            <div className="w-14 h-14 mx-auto bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-xl shadow-lg mb-3 group-hover:scale-110 transition-transform flex items-center justify-center">
              <UsersIcon className="h-7 w-7" />
            </div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Add Client</p>
          </Link>
          <Link to="/services" className="glass-tile group text-center hover:border-purple-300 dark:hover:border-purple-700">
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
