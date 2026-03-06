// Shared types and utilities for Engage by Capstone

// ==================== ENUMS ====================

export enum UserRole {
  PARTNER = 'PARTNER',
  MANAGER = 'MANAGER',
  SENIOR = 'SENIOR',
  JUNIOR = 'JUNIOR',
  CLIENT = 'CLIENT'
}

export enum CompanyType {
  LIMITED_COMPANY = 'LIMITED_COMPANY',
  SOLE_TRADER = 'SOLE_TRADER',
  PARTNERSHIP = 'PARTNERSHIP',
  LLP = 'LLP',
  CHARITY = 'CHARITY',
  PROPERTY_INVESTMENT = 'PROPERTY_INVESTMENT'
}

export enum ServiceCategory {
  COMPLIANCE = 'COMPLIANCE',
  ADVISORY = 'ADVISORY',
  TECHNICAL = 'TECHNICAL',
  SPECIALIZED = 'SPECIALIZED'
}

export enum ProposalStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  SENT = 'SENT',
  VIEWED = 'VIEWED',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  EXPIRED = 'EXPIRED'
}

export enum MTDITSAStatus {
  NOT_REQUIRED = 'NOT_REQUIRED',
  REQUIRED_2026 = 'REQUIRED_2026',
  REQUIRED_2027 = 'REQUIRED_2027',
  REQUIRED_2028 = 'REQUIRED_2028',
  EXEMPT = 'EXEMPT'
}

export enum PricingFrequency {
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  ANNUALLY = 'ANNUALLY',
  ONE_OFF = 'ONE_OFF'
}

// ==================== INTERFACES ====================

export interface Tenant {
  id: string;
  subdomain: string;
  name: string;
  logo?: string;
  primaryColor?: string;
  createdAt: Date;
  updatedAt: Date;
  settings: TenantSettings;
}

export interface TenantSettings {
  defaultCurrency: string;
  defaultPaymentTerms: number;
  vatRegistered: boolean;
  vatNumber?: string;
  companyRegistration?: string;
  professionalBody?: ProfessionalBody;
  address?: Address;
}

export enum ProfessionalBody {
  ACCA = 'ACCA',
  ICAEW = 'ICAEW',
  AAT = 'AAT',
  CIMA = 'CIMA',
  ICAS = 'ICAS',
  CTA = 'CTA',
  CPAA = 'CPAA'
}

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  postcode: string;
  country: string;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  tenantId: string;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Client {
  id: string;
  tenantId: string;
  name: string;
  companyType: CompanyType;
  contactEmail: string;
  contactPhone?: string;
  address?: Address;
  companyNumber?: string;
  utr?: string;
  vatNumber?: string;
  mtditsaStatus: MTDITSAStatus;
  mtditsaIncome?: number;
  industry?: string;
  employeeCount?: number;
  turnover?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Proposal {
  id: string;
  tenantId: string;
  clientId: string;
  createdById: string;
  title: string;
  reference: string;
  status: ProposalStatus;
  validUntil: Date;
  services: ProposalService[];
  subtotal: number;
  discountAmount: number;
  vatAmount: number;
  total: number;
  paymentTerms: string;
  notes?: string;
  terms?: string;
  acceptedAt?: Date;
  acceptedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProposalService {
  id: string;
  serviceId: string;
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  total: number;
  frequency: PricingFrequency;
}

export interface ServiceTemplate {
  id: string;
  tenantId: string;
  category: ServiceCategory;
  name: string;
  description: string;
  basePrice: number;
  baseHours: number;
  complexityFactors: ComplexityFactor[];
  frequencyOptions: PricingFrequency[];
  isActive: boolean;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ComplexityFactor {
  name: string;
  description: string;
  multiplier: number;
  appliesTo: CompanyType[];
}

export interface PricingRule {
  id: string;
  tenantId: string;
  serviceId: string;
  name: string;
  condition: PricingCondition;
  adjustment: number;
  adjustmentType: 'PERCENTAGE' | 'FIXED';
  priority: number;
  isActive: boolean;
}

export interface PricingCondition {
  field: string;
  operator: 'EQ' | 'GT' | 'LT' | 'GTE' | 'LTE' | 'IN';
  value: any;
}

// ==================== MTD ITSA TYPES ====================

export interface MTDITSACalculator {
  calculateStatus(annualIncome: number, incomeSources: IncomeSource[]): MTDITSAStatus;
  calculateQuarterlyDeadlines(taxYear: number): QuarterlyDeadline[];
  getEligibilityCriteria(): EligibilityCriteria;
}

export interface IncomeSource {
  type: 'SELF_EMPLOYMENT' | 'PROPERTY' | 'PARTNERSHIP' | 'OTHER';
  amount: number;
}

export interface QuarterlyDeadline {
  quarter: number;
  periodStart: Date;
  periodEnd: Date;
  filingDeadline: Date;
  paymentDeadline: Date;
}

export interface EligibilityCriteria {
  threshold2026: number;
  threshold2027: number;
  threshold2028: number;
  exemptCategories: string[];
}

// ==================== API RESPONSE TYPES ====================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ApiMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

export interface ApiMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
}

// ==================== UTILITY FUNCTIONS ====================

export const formatCurrency = (amount: number, currency: string = 'GBP'): string => {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency,
  }).format(amount);
};

export const formatDate = (date: Date | string, format: 'short' | 'long' = 'short'): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (format === 'short') {
    return d.toLocaleDateString('en-GB');
  }
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

export const generateReference = (prefix: string = 'PROP'): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};

export const calculateVAT = (amount: number, vatRate: number = 20): number => {
  return Math.round(amount * (vatRate / 100) * 100) / 100;
};

export const calculateMargin = (revenue: number, costs: number): number => {
  if (revenue === 0) return 0;
  return ((revenue - costs) / revenue) * 100;
};

// ==================== VALIDATION ====================

export const validateUKPostcode = (postcode: string): boolean => {
  const postcodeRegex = /^[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}$/i;
  return postcodeRegex.test(postcode);
};

export const validateUTR = (utr: string): boolean => {
  const utrRegex = /^\d{10}$/;
  return utrRegex.test(utr);
};

export const validateCompanyNumber = (number: string): boolean => {
  const companyNumberRegex = /^[A-Za-z0-9]{6,8}$/;
  return companyNumberRegex.test(number);
};

// ==================== PRICING ENGINE ====================

export interface PricingCalculation {
  basePrice: number;
  complexityMultiplier: number;
  volumeDiscount: number;
  geographicAdjustment: number;
  finalPrice: number;
  margin: number;
  breakdown: PricingBreakdown;
}

export interface PricingBreakdown {
  directCosts: number;
  indirectCosts: number;
  overheadAllocation: number;
  targetMargin: number;
  minimumPrice: number;
}

export const calculatePrice = (
  basePrice: number,
  complexityFactors: number[],
  volume: number,
  region: string,
  targetMargin: number = 30
): PricingCalculation => {
  const complexityMultiplier = complexityFactors.reduce((acc, f) => acc * f, 1);
  const volumeDiscount = volume > 10 ? 0.9 : volume > 5 ? 0.95 : 1;
  
  const geographicMultipliers: Record<string, number> = {
    'LONDON': 1.25,
    'SOUTH_EAST': 1.15,
    'SOUTH_WEST': 1.05,
    'EAST': 1.1,
    'WEST_MIDLANDS': 0.95,
    'EAST_MIDLANDS': 0.9,
    'YORKSHIRE': 0.9,
    'NORTH_WEST': 0.95,
    'NORTH_EAST': 0.85,
    'WALES': 0.9,
    'SCOTLAND': 0.95,
    'NORTHERN_IRELAND': 0.85,
  };
  
  const geographicAdjustment = geographicMultipliers[region] || 1;
  
  const adjustedBase = basePrice * complexityMultiplier;
  const costs = adjustedBase * 0.6;
  const minimumPrice = costs / (1 - (targetMargin / 100));
  
  const finalPrice = Math.max(
    minimumPrice,
    adjustedBase * volumeDiscount * geographicAdjustment
  );
  
  return {
    basePrice,
    complexityMultiplier,
    volumeDiscount,
    geographicAdjustment,
    finalPrice: Math.round(finalPrice * 100) / 100,
    margin: calculateMargin(finalPrice, costs),
    breakdown: {
      directCosts: Math.round(costs * 0.5 * 100) / 100,
      indirectCosts: Math.round(costs * 0.3 * 100) / 100,
      overheadAllocation: Math.round(costs * 0.2 * 100) / 100,
      targetMargin,
      minimumPrice: Math.round(minimumPrice * 100) / 100,
    },
  };
};

// MTD ITSA Calculator
export const mtditsaCalculator: MTDITSACalculator = {
  calculateStatus: (annualIncome: number, incomeSources: IncomeSource[]): MTDITSAStatus => {
    const hasExemptSource = incomeSources.some(source => 
      source.type === 'PARTNERSHIP' && source.amount < 10000
    );
    
    if (hasExemptSource) {
      return MTDITSAStatus.EXEMPT;
    }
    
    if (annualIncome >= 50000) {
      return MTDITSAStatus.REQUIRED_2026;
    } else if (annualIncome >= 30000) {
      return MTDITSAStatus.REQUIRED_2027;
    } else if (annualIncome >= 20000) {
      return MTDITSAStatus.REQUIRED_2028;
    }
    
    return MTDITSAStatus.NOT_REQUIRED;
  },
  
  calculateQuarterlyDeadlines: (taxYear: number): QuarterlyDeadline[] => {
    const year = taxYear;
    return [
      {
        quarter: 1,
        periodStart: new Date(`${year}-04-06`),
        periodEnd: new Date(`${year}-07-05`),
        filingDeadline: new Date(`${year}-08-05`),
        paymentDeadline: new Date(`${year}-01-31`),
      },
      {
        quarter: 2,
        periodStart: new Date(`${year}-07-06`),
        periodEnd: new Date(`${year}-10-05`),
        filingDeadline: new Date(`${year}-11-05`),
        paymentDeadline: new Date(`${year + 1}-01-31`),
      },
      {
        quarter: 3,
        periodStart: new Date(`${year}-10-06`),
        periodEnd: new Date(`${year + 1}-01-05`),
        filingDeadline: new Date(`${year + 1}-02-05`),
        paymentDeadline: new Date(`${year + 1}-01-31`),
      },
      {
        quarter: 4,
        periodStart: new Date(`${year + 1}-01-06`),
        periodEnd: new Date(`${year + 1}-04-05`),
        filingDeadline: new Date(`${year + 1}-05-05`),
        paymentDeadline: new Date(`${year + 1}-01-31`),
      },
    ];
  },
  
  getEligibilityCriteria: (): EligibilityCriteria => ({
    threshold2026: 50000,
    threshold2027: 30000,
    threshold2028: 20000,
    exemptCategories: [
      'Trustees of registered pension schemes',
      'Non-resident companies',
      'Partnerships with turnover below £10,000',
      'Estate administrators'
    ],
  }),
};
