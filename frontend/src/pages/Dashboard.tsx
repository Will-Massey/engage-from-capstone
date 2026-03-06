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

// Mock data for charts
const revenueData = [
  { name: 'Jan', value: 12500 },
  { name: 'Feb', value: 15200 },
  { name: 'Mar', value: 18900 },
  { name: 'Apr', value: 16400 },
  { name: 'May', value: 22100 },
  { name: 'Jun', value: 25800 },
];

const proposalStatusData = [
  { name: 'Draft', value: 12, color: '#9CA3AF' },
  { name: 'Sent', value: 8, color: '#3B82F6' },
  { name: 'Accepted', value: 15, color: '#10B981' },
  { name: 'Declined', value: 3, color: '#EF4444' },
];

const weeklyActivity = [
  { day: 'Mon', proposals: 3, views: 12 },
  { day: 'Tue', proposals: 5, views: 18 },
  { day: 'Wed', proposals: 2, views: 8 },
  { day: 'Thu', proposals: 7, views: 24 },
  { day: 'Fri', proposals: 4, views: 15 },
  { day: 'Sat', proposals: 1, views: 5 },
  { day: 'Sun', proposals: 0, views: 3 },
];

const recentActivity = [
  { id: 1, type: 'proposal_sent', message: 'Proposal sent to TechStart Ltd', time: '2 hours ago', icon: EnvelopeIcon, color: 'blue' },
  { id: 2, type: 'proposal_accepted', message: 'Sarah Smith accepted proposal PROP-2024-002', time: '4 hours ago', icon: CheckCircleIcon, color: 'green' },
  { id: 3, type: 'client_added', message: 'New client added: Green Energy Solutions LLP', time: '6 hours ago', icon: UsersIcon, color: 'purple' },
  { id: 4, type: 'mtd_reminder', message: 'MTD ITSA deadline approaching for 3 clients', time: '1 day ago', icon: ClockIcon, color: 'orange' },
  { id: 5, type: 'proposal_viewed', message: 'Proposal PROP-2024-001 viewed by TechStart Ltd', time: '1 day ago', icon: DocumentTextIcon, color: 'gray' },
];

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
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30days');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);
      
      const [proposalsRes, clientsRes] = await Promise.all([
        apiClient.getProposals({ limit: 5 }) as Promise<any>,
        apiClient.getClients({ limit: 5 }) as Promise<any>,
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
    } catch (error) {
      // Error handled by UI
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
      color: 'from-green-500 to-green-600',
      bgColor: 'bg-green-50',
    },
    {
      name: 'Active Proposals',
      value: stats.totalProposals,
      change: '+3 this week',
      trend: 'up',
      icon: DocumentTextIcon,
      color: 'from-blue-500 to-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      name: 'Conversion Rate',
      value: `${stats.conversionRate}%`,
      change: '+5.2%',
      trend: 'up',
      icon: ChartBarIcon,
      color: 'from-purple-500 to-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      name: 'Total Clients',
      value: stats.totalClients,
      change: `+${stats.mtditsaClients} MTD ITSA`,
      trend: 'neutral',
      icon: UsersIcon,
      color: 'from-orange-500 to-orange-600',
      bgColor: 'bg-orange-50',
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

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsCards.map((stat, index) => (
          <div
            key={stat.name}
            className={`rounded-xl border-2 p-6 hover:shadow-lg transition-all duration-300 ${stat.bgColor} ${
              stat.name.includes('Revenue') ? 'border-green-400' :
              stat.name.includes('Proposals') ? 'border-blue-400' :
              stat.name.includes('Conversion') ? 'border-purple-400' :
              'border-orange-400'
            }`}
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="flex items-center justify-between">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} text-white shadow-lg flex items-center justify-center`}>
                <stat.icon className="h-6 w-6" />
              </div>
              <div className={`flex items-center text-sm font-bold px-2 py-1 rounded-full ${
                stat.trend === 'up' ? 'bg-green-100 text-green-700' : 
                stat.trend === 'down' ? 'bg-red-100 text-red-700' : 
                'bg-slate-100 text-slate-600'
              }`}>
                {stat.trend === 'up' && <ArrowUpIcon className="h-4 w-4 mr-1" />}
                {stat.trend === 'down' && <ArrowDownIcon className="h-4 w-4 mr-1" />}
                {stat.change}
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm font-bold text-slate-700 uppercase tracking-wide">{stat.name}</p>
              <p className={`text-3xl font-extrabold mt-1 ${
                stat.name.includes('Revenue') ? 'text-green-700' :
                stat.name.includes('Proposals') ? 'text-blue-700' :
                stat.name.includes('Conversion') ? 'text-purple-700' :
                'text-orange-700'
              }`}>{stat.value}</p>
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

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="section-title">Revenue Overview</h2>
              <p className="section-subtitle">Monthly revenue from accepted proposals</p>
            </div>
            <div className="flex items-center space-x-2">
              <span className="flex items-center text-sm text-slate-600">
                <span className="w-3 h-3 rounded-full bg-primary-500 mr-2"></span>
                Revenue
              </span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="name" stroke="#374151" fontSize={12} tick={{fill: '#374151'}} />
                <YAxis stroke="#374151" fontSize={12} tick={{fill: '#374151'}} tickFormatter={(value) => `£${value/1000}k`} />
                <Tooltip
                  formatter={(value: number) => [`£${value.toLocaleString()}`, 'Revenue']}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Proposal Status */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="section-title mb-1">Proposal Status</h2>
          <p className="section-subtitle mb-6">Current proposal distribution</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={proposalStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {proposalStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-2">
            {proposalStatusData.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-sm text-slate-700">
                <span className="flex items-center">
                  <span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: item.color }}></span>
                  {item.name}
                </span>
                <span className="font-medium text-slate-900">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Activity & Recent Items */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weekly Activity Chart */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 lg:col-span-2">
          <h2 className="section-title mb-1">Weekly Activity</h2>
          <p className="section-subtitle mb-6">Proposals created vs views this week</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyActivity}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="day" stroke="#374151" fontSize={12} tick={{fill: '#374151'}} />
                <YAxis stroke="#374151" fontSize={12} tick={{fill: '#374151'}} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                />
                <Bar dataKey="proposals" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                <Bar dataKey="views" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title">Recent Activity</h2>
            <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              View all
            </button>
          </div>
          <div className="space-y-4">
            {recentActivity.map((activity) => (
              <div key={activity.id} className="flex items-start space-x-3">
                <div className={`icon-box-sm rounded-lg flex-shrink-0 ${
                  activity.color === 'blue' ? 'bg-blue-100 text-blue-600' :
                  activity.color === 'green' ? 'bg-green-100 text-green-600' :
                  activity.color === 'purple' ? 'bg-purple-100 text-purple-600' :
                  activity.color === 'orange' ? 'bg-orange-100 text-orange-600' :
                  'bg-slate-100 text-slate-700'
                }`}>
                  <activity.icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-900">{activity.message}</p>
                  <p className="text-xs text-slate-600 mt-1">{activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Proposals */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="section-title">Recent Proposals</h2>
              <p className="text-sm text-slate-600">Latest proposal activity</p>
            </div>
            <Link to="/proposals" className="text-sm text-primary-600 hover:text-primary-500 font-medium">
              View all
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {stats.recentProposals.length === 0 ? (
              <div className="p-6 text-center text-slate-600">
                <SparklesIcon className="mx-auto h-12 w-12 text-slate-300 mb-3" />
                <p>No proposals yet.</p>
                <Link to="/proposals/new" className="text-primary-600 font-medium">
                  Create your first proposal
                </Link>
              </div>
            ) : (
              stats.recentProposals.map((proposal: any) => (
                <Link
                  key={proposal.id}
                  to={`/proposals/${proposal.id}`}
                  className="block px-6 py-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{proposal.title}</p>
                      <p className="text-xs text-slate-600 mt-1">
                        {proposal.client?.name} • {proposal.reference}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <span className={`badge ${
                        proposal.status === 'ACCEPTED' ? 'badge-green' :
                        proposal.status === 'SENT' ? 'badge-blue' :
                        proposal.status === 'DRAFT' ? 'badge-gray' :
                        'badge-yellow'
                      }`}>
                        {proposal.status}
                      </span>
                      <p className="text-sm font-medium text-slate-900 mt-1">
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
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="section-title">Recent Clients</h2>
              <p className="text-sm text-slate-600">New and updated clients</p>
            </div>
            <Link to="/clients" className="text-sm text-primary-600 hover:text-primary-500 font-medium">
              View all
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {stats.recentClients.length === 0 ? (
              <div className="p-6 text-center text-slate-600">
                <UsersIcon className="mx-auto h-12 w-12 text-slate-300 mb-3" />
                <p>No clients yet.</p>
                <Link to="/clients/new" className="text-primary-600 font-medium">
                  Add your first client
                </Link>
              </div>
            ) : (
              stats.recentClients.map((client: any) => (
                <Link
                  key={client.id}
                  to={`/clients/${client.id}`}
                  className="block px-6 py-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center min-w-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-medium text-sm">
                        {client.name?.charAt(0)}
                      </div>
                      <div className="ml-3 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{client.name}</p>
                        <p className="text-xs text-slate-600">
                          {client.companyType?.replace(/_/g, ' ')} • {client.contactEmail}
                        </p>
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      {client.mtditsaEligible && (
                        <span className="badge badge-orange">MTD ITSA</span>
                      )}
                      <p className="text-xs text-slate-600 mt-1">
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

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="section-title mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Link to="/proposals/new" className="group p-4 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200 transition-all text-center">
            <div className="icon-box-lg mx-auto bg-blue-500 text-white rounded-xl shadow-lg mb-3 group-hover:scale-110 transition-transform">
              <DocumentTextIcon className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-slate-900">New Proposal</p>
          </Link>
          <Link to="/clients/new" className="group p-4 rounded-xl bg-gradient-to-br from-green-50 to-green-100 hover:from-green-100 hover:to-green-200 transition-all text-center">
            <div className="icon-box-lg mx-auto bg-green-500 text-white rounded-xl shadow-lg mb-3 group-hover:scale-110 transition-transform">
              <UsersIcon className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-slate-900">Add Client</p>
          </Link>
          <Link to="/services" className="group p-4 rounded-xl bg-gradient-to-br from-purple-50 to-purple-100 hover:from-purple-100 hover:to-purple-200 transition-all text-center">
            <div className="icon-box-lg mx-auto bg-purple-500 text-white rounded-xl shadow-lg mb-3 group-hover:scale-110 transition-transform">
              <SparklesIcon className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-slate-900">Services</p>
          </Link>
          <button className="group p-4 rounded-xl bg-gradient-to-br from-orange-50 to-orange-100 hover:from-orange-100 hover:to-orange-200 transition-all text-center">
            <div className="icon-box-lg mx-auto bg-orange-500 text-white rounded-xl shadow-lg mb-3 group-hover:scale-110 transition-transform">
              <BellIcon className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-slate-900">Reminders</p>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
