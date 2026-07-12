import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

export type RevenueDatum = { name: string; value: number };
export type ProposalStatusDatum = { name: string; value: number; color: string };
export type WeeklyActivityDatum = { day: string; proposals: number; views: number };

type RevenuePieProps = {
  revenueData: RevenueDatum[];
  proposalStatusData: ProposalStatusDatum[];
};

/** Lazy-loaded: revenue area + proposal status pie */
export function RevenueAndPieCharts({ revenueData, proposalStatusData }: RevenuePieProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
            <AreaChart data={revenueData}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563EB" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" />
              <XAxis dataKey="name" stroke="#94A3B8" fontSize={12} tick={{ fill: '#94A3B8' }} />
              <YAxis
                stroke="#94A3B8"
                fontSize={12}
                tick={{ fill: '#94A3B8' }}
                tickFormatter={(value) => `£${value / 1000}k`}
              />
              <Tooltip
                formatter={(value: number) => [`£${value.toLocaleString()}`, 'Revenue']}
                contentStyle={{
                  borderRadius: '12px',
                  border: 'none',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
                  background: 'rgba(255, 255, 255, 0.95)',
                  backdropFilter: 'blur(12px)',
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#2563EB"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorRevenue)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card p-6">
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
              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  border: 'none',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
                  background: 'rgba(255, 255, 255, 0.95)',
                  backdropFilter: 'blur(12px)',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 space-y-2">
          {proposalStatusData.map((item) => (
            <div
              key={item.name}
              className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-300"
            >
              <span className="flex items-center">
                <span
                  className="w-3 h-3 rounded-full mr-2"
                  style={{ backgroundColor: item.color }}
                ></span>
                {item.name}
              </span>
              <span className="font-medium text-slate-900 dark:text-slate-100">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type WeeklyProps = { weeklyActivity: WeeklyActivityDatum[] };

/** Lazy-loaded: weekly bar chart card (use inside `lg:grid-cols-3` row) */
export function WeeklyActivityChart({ weeklyActivity }: WeeklyProps) {
  return (
    <div className="card p-6 lg:col-span-2">
      <h2 className="section-title mb-1">Weekly Activity</h2>
      <p className="section-subtitle mb-6">Proposals created vs views this week</p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={weeklyActivity}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" />
            <XAxis dataKey="day" stroke="#94A3B8" fontSize={12} tick={{ fill: '#94A3B8' }} />
            <YAxis stroke="#94A3B8" fontSize={12} tick={{ fill: '#94A3B8' }} />
            <Tooltip
              contentStyle={{
                borderRadius: '12px',
                border: 'none',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
                background: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(12px)',
              }}
            />
            <Bar dataKey="proposals" fill="#2563EB" radius={[4, 4, 0, 0]} />
            <Bar dataKey="views" fill="#60A5FA" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
