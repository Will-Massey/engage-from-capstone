import type {
  CompanyType,
  PricingFrequency,
  PricingModel,
  ServiceCategory,
} from '@uk-proposal-platform/shared';

export type { CompanyType, PricingFrequency, PricingModel, ServiceCategory };

export interface ServiceComplexityFactor {
  name: string;
  description: string;
  multiplier: number;
  appliesTo?: Array<CompanyType | string>;
}

export interface CreateServicePayload {
  category: ServiceCategory | string;
  subcategory?: string;
  name: string;
  description: string;
  longDescription?: string;
  basePrice: number;
  priceAmount?: number;
  baseHours?: number;
  pricingModel?: PricingModel | string;
  frequencyOptions?: Array<PricingFrequency | string>;
  defaultFrequency?: PricingFrequency | string;
  billingCycle?: PricingFrequency | string;
  complexityFactors?: ServiceComplexityFactor[];
  requirements?: string[];
  deliverables?: string[];
  applicableEntityTypes?: Array<CompanyType | string>;
  regulatoryNotes?: string;
  tags?: string[];
}

export type UpdateServicePayload = Partial<CreateServicePayload>;

export type PricingRuleOperator = 'EQ' | 'GT' | 'LT' | 'GTE' | 'LTE' | 'IN';
export type PricingRuleAdjustment = 'PERCENTAGE' | 'FIXED' | 'PER_EMPLOYEE';

export interface CreatePricingRulePayload {
  name: string;
  description?: string;
  conditionField: string;
  conditionOperator: PricingRuleOperator;
  conditionValue: unknown;
  adjustmentType: PricingRuleAdjustment;
  adjustmentValue: number;
  priority?: number;
}

export interface PricingRuleRecord {
  id: string;
  name: string;
  description?: string | null;
  conditionField: string;
  conditionOperator: string;
  conditionValue: unknown;
  adjustmentType: string;
  adjustmentValue: number;
  priority?: number;
  isActive?: boolean;
}

export interface ServiceListParams {
  category?: ServiceCategory | string;
  entityType?: string;
  search?: string;
  includeInactive?: boolean | string;
  /** Passed by some UI call sites; backend list route ignores but kept for compatibility */
  limit?: number;
  isActive?: boolean;
}

export interface ServiceRecord {
  id: string;
  tenantId?: string;
  category: ServiceCategory | string;
  subcategory?: string | null;
  name: string;
  description: string;
  longDescription?: string | null;
  basePrice: number;
  priceAmount?: number;
  baseHours?: number | null;
  pricingModel?: PricingModel | string;
  defaultFrequency?: PricingFrequency | string;
  billingCycle?: string;
  priceDisplayMode?: string;
  frequencyOptions?: string;
  applicableEntityTypes?: string;
  complexityFactors?: string | ServiceComplexityFactor[];
  requirements?: string | string[];
  deliverables?: string | string[];
  regulatoryNotes?: string | null;
  tags?: string;
  isVatApplicable?: boolean;
  isPopular?: boolean;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  pricingRules?: PricingRuleRecord[];
}

export interface ServiceCategoryOption {
  id: string;
  name: string;
  description: string;
  icon: string;
}
