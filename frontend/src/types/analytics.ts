/** Analytics dashboard and reporting API types. */

export interface DashboardStats {
  proposals: {
    total: number;
    thisMonth: number;
    lastMonth: number;
    growth: number;
    sent: number;
    viewed: number;
    signed: number;
    statusBreakdown: Record<string, number>;
  };
  pipeline: { value: number; currency: 'GBP' };
  revenue: {
    total: number;
    accepted: number;
    thisMonth: number;
    currency: 'GBP';
  };
  conversion: {
    rate: number;
    sent: number;
    accepted: number;
    viewRate: number;
    signRate: number;
  };
  clients: { total: number; newThisMonth: number; active: number };
  monthlyTrend: Array<{
    month: string;
    count: number;
    value: number;
    accepted: number;
  }>;
  topServices: Array<{ name: string; count: number; revenue: number }>;
  revenueData: Array<{ name: string; value: number }>;
  proposalStatusData: Array<{ name: string; value: number; color: string }>;
  weeklyActivity: Array<{ day: string; proposals: number; views: number }>;
  recentActivity: Array<{
    id: string;
    type: string;
    message: string;
    time: string;
    color: string;
  }>;
}

export type ServiceCategory =
  | 'COMPLIANCE'
  | 'ADVISORY'
  | 'TAX'
  | 'PAYROLL'
  | 'BOOKKEEPING'
  | 'AUDIT'
  | 'CONSULTING'
  | 'TECHNICAL'
  | 'SPECIALIZED';

export interface FeeBenchmarkBand {
  category: ServiceCategory;
  label: string;
  tenantCount: number;
  sampleSize: number;
  p25: number;
  p50: number;
  p75: number;
  currency: 'GBP';
  unit: 'per_month_gbp';
}

export interface FeeBenchmarksResult {
  benchmarks: FeeBenchmarkBand[];
  suppressedCategories: number;
  kAnonymityMinTenants: number;
  disclaimer: string;
  generatedAt: string;
  optedIn: boolean;
}

export interface ProposalFunnelParams {
  startDate?: string;
  endDate?: string;
}

export interface ProposalFunnelResult {
  dateRange: { start: string; end: string };
  funnel: { sent: number; opened: number; viewed: number; signed: number; paid: number };
  conversionRates: {
    sentToOpened: number;
    openedToSigned: number;
    sentToSigned: number;
    signedToPaid: number;
  };
  stages: Array<{
    key: 'sent' | 'opened' | 'viewed' | 'signed' | 'paid';
    label: string;
    count: number;
    color: string;
  }>;
}
