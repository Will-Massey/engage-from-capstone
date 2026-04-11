export declare enum UserRole {
    PARTNER = "PARTNER",
    MANAGER = "MANAGER",
    SENIOR = "SENIOR",
    JUNIOR = "JUNIOR",
    CLIENT = "CLIENT"
}
export declare enum CompanyType {
    LIMITED_COMPANY = "LIMITED_COMPANY",
    SOLE_TRADER = "SOLE_TRADER",
    PARTNERSHIP = "PARTNERSHIP",
    LLP = "LLP",
    CHARITY = "CHARITY",
    PROPERTY_INVESTMENT = "PROPERTY_INVESTMENT"
}
export declare enum ServiceCategory {
    COMPLIANCE = "COMPLIANCE",
    ADVISORY = "ADVISORY",
    TECHNICAL = "TECHNICAL",
    SPECIALIZED = "SPECIALIZED"
}
export declare enum ProposalStatus {
    DRAFT = "DRAFT",
    PENDING = "PENDING",
    SENT = "SENT",
    VIEWED = "VIEWED",
    ACCEPTED = "ACCEPTED",
    DECLINED = "DECLINED",
    EXPIRED = "EXPIRED"
}
export declare enum MTDITSAStatus {
    NOT_REQUIRED = "NOT_REQUIRED",
    REQUIRED_2026 = "REQUIRED_2026",
    REQUIRED_2027 = "REQUIRED_2027",
    REQUIRED_2028 = "REQUIRED_2028",
    EXEMPT = "EXEMPT"
}
export declare enum PricingFrequency {
    MONTHLY = "MONTHLY",
    QUARTERLY = "QUARTERLY",
    ANNUALLY = "ANNUALLY",
    ONE_OFF = "ONE_OFF"
}
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
export declare enum ProfessionalBody {
    ACCA = "ACCA",
    ICAEW = "ICAEW",
    AAT = "AAT",
    CIMA = "CIMA",
    ICAS = "ICAS",
    CTA = "CTA",
    CPAA = "CPAA"
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
export declare const formatCurrency: (amount: number, currency?: string) => string;
export declare const formatDate: (date: Date | string, format?: "short" | "long") => string;
export declare const generateReference: (prefix?: string) => string;
export declare const calculateVAT: (amount: number, vatRate?: number) => number;
export declare const calculateMargin: (revenue: number, costs: number) => number;
export declare const validateUKPostcode: (postcode: string) => boolean;
export declare const validateUTR: (utr: string) => boolean;
export declare const validateCompanyNumber: (number: string) => boolean;
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
export declare const calculatePrice: (basePrice: number, complexityFactors: number[], volume: number, region: string, targetMargin?: number) => PricingCalculation;
export declare const mtditsaCalculator: MTDITSACalculator;
//# sourceMappingURL=index.d.ts.map