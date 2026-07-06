/**
 * Phase W2.9 — Value-based pricing methodology (rule engine, NOT LLM).
 * Maps client profile inputs to suggested fee bands per service category.
 * Baseline fees from ukAccountancyServices.ts with turnover/complexity multipliers.
 */

import {
  allServices,
  type ServiceTemplate,
  type ComplexityFactor,
} from '../data/ukAccountancyServices.js';

// ─── Input types ───────────────────────────────────────────────────────────

export const TURNOVER_BANDS = [
  'UNDER_50K',
  'BAND_50K_100K',
  'BAND_100K_250K',
  'BAND_250K_500K',
  'BAND_500K_1M',
  'OVER_1M',
] as const;

export type TurnoverBand = (typeof TURNOVER_BANDS)[number];

export const ENTITY_TYPES = ['LIMITED_COMPANY', 'SOLE_TRADER', 'LLP', 'PARTNERSHIP'] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export const MTD_STATUSES = [
  'NOT_APPLICABLE',
  'NOT_REGISTERED',
  'REGISTERED',
  'FULLY_COMPLIANT',
] as const;

export type MtdStatus = (typeof MTD_STATUSES)[number];

export interface PricingComplexityFlags {
  hasPayroll: boolean;
  hasRd: boolean;
  multiSite: boolean;
}

export interface PricingMethodologyInput {
  turnoverBand: TurnoverBand;
  entityType: EntityType;
  employeeCount: number;
  vatRegistered: boolean;
  mtdStatus: MtdStatus;
  complexity: PricingComplexityFlags;
}

export interface AppliedMultiplier {
  name: string;
  value: number;
  description: string;
}

export interface SuggestedServiceFee {
  catalogName: string;
  category: string;
  subcategory?: string;
  description: string;
  billingCycle: string;
  baselinePrice: number;
  suggestedPrice: number;
  feeLow: number;
  feeHigh: number;
  annualEquivalent: number;
  multipliers: AppliedMultiplier[];
  rationale: string;
  /** Resolved when tenant catalogue is matched by name */
  serviceTemplateId?: string;
}

export interface CategoryFeeSummary {
  category: string;
  label: string;
  serviceCount: number;
  monthlyLow: number;
  monthlyHigh: number;
  monthlySuggested: number;
  annualSuggested: number;
}

export interface PricingMethodologyResult {
  inputs: PricingMethodologyInput;
  services: SuggestedServiceFee[];
  byCategory: CategoryFeeSummary[];
  totals: {
    monthlyLow: number;
    monthlyHigh: number;
    monthlySuggested: number;
    annualSuggested: number;
    currency: 'GBP';
  };
  formulaNotes: string[];
}

// ─── Multiplier tables ─────────────────────────────────────────────────────

const TURNOVER_MULTIPLIERS: Record<TurnoverBand, { multiplier: number; label: string }> = {
  UNDER_50K: { multiplier: 0.85, label: 'Under £50,000' },
  BAND_50K_100K: { multiplier: 0.92, label: '£50,000 – £99,999' },
  BAND_100K_250K: { multiplier: 1.0, label: '£100,000 – £249,999' },
  BAND_250K_500K: { multiplier: 1.15, label: '£250,000 – £499,999' },
  BAND_500K_1M: { multiplier: 1.3, label: '£500,000 – £999,999' },
  OVER_1M: { multiplier: 1.5, label: '£1,000,000+' },
};

const ENTITY_MULTIPLIERS: Record<EntityType, number> = {
  LIMITED_COMPANY: 1.0,
  SOLE_TRADER: 0.95,
  LLP: 1.05,
  PARTNERSHIP: 0.98,
};

const CATEGORY_LABELS: Record<string, string> = {
  COMPLIANCE: 'Compliance',
  ADVISORY: 'Advisory',
  TAX: 'Tax',
  BOOKKEEPING: 'Bookkeeping',
  CONSULTING: 'Consulting',
  SPECIALIZED: 'Specialist',
};

/** Core compliance packages by entity type (catalogue service names). */
const CORE_SERVICE_NAMES: Record<EntityType, string[]> = {
  LIMITED_COMPANY: [
    'Statutory Annual Accounts',
    'CT600 Corporation Tax Return',
    'Confirmation Statement (CS01)',
  ],
  LLP: ['Statutory Annual Accounts'],
  SOLE_TRADER: ['Sole Trader Annual Accounts', 'Personal Tax Return (SA100)'],
  PARTNERSHIP: ['Personal Tax Return (SA100)'],
};

const FEE_BAND_TOLERANCE = 0.1; // ±10%

// ─── Helpers ───────────────────────────────────────────────────────────────

function annualFromBilling(basePrice: number, billingCycle: string): number {
  switch (billingCycle) {
    case 'WEEKLY':
      return basePrice * 52;
    case 'MONTHLY':
      return basePrice * 12;
    case 'QUARTERLY':
      return basePrice * 4;
    case 'ANNUALLY':
    case 'ONE_TIME':
      return basePrice;
    default:
      return basePrice * 12;
  }
}

function monthlyEquivalent(annual: number): number {
  return Math.round(annual / 12);
}

function findCatalogService(name: string): ServiceTemplate | undefined {
  return allServices.find((s) => s.name === name);
}

function normaliseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function resolveCatalogServices(input: PricingMethodologyInput): ServiceTemplate[] {
  const names = new Set<string>();

  for (const name of CORE_SERVICE_NAMES[input.entityType]) {
    names.add(name);
  }

  if (input.vatRegistered) {
    names.add('VAT Return Preparation');
  }

  if (input.complexity.hasPayroll || input.employeeCount > 0) {
    names.add('Monthly Payroll Processing');
  }

  if (input.complexity.hasRd && input.entityType === 'LIMITED_COMPANY') {
    names.add('R&D Tax Credit Claim');
  }

  if (
    input.complexity.multiSite ||
    input.turnoverBand === 'BAND_500K_1M' ||
    input.turnoverBand === 'OVER_1M'
  ) {
    names.add('Full Bookkeeping Service');
  }

  if (input.entityType === 'SOLE_TRADER' && input.mtdStatus !== 'NOT_APPLICABLE') {
    if (input.mtdStatus === 'NOT_REGISTERED') {
      names.add('MTD Digital Setup & Training');
    } else {
      names.add('MTD ITSA Quarterly Return');
    }
  }

  const selected: ServiceTemplate[] = [];
  for (const name of names) {
    const svc = findCatalogService(name);
    if (!svc) continue;
    if (!svc.applicableEntityTypes.includes(input.entityType)) continue;
    selected.push(svc);
  }

  return selected;
}

function buildPricingContext(input: PricingMethodologyInput): Record<string, unknown> {
  const turnoverMidpoints: Record<TurnoverBand, number> = {
    UNDER_50K: 25_000,
    BAND_50K_100K: 75_000,
    BAND_100K_250K: 175_000,
    BAND_250K_500K: 375_000,
    BAND_500K_1M: 750_000,
    OVER_1M: 1_500_000,
  };

  return {
    turnover: turnoverMidpoints[input.turnoverBand],
    employeeCount: input.employeeCount,
    hasPayroll: input.complexity.hasPayroll || input.employeeCount > 0,
    hasRAndD: input.complexity.hasRd,
    multiSite: input.complexity.multiSite,
    vatRegistered: input.vatRegistered,
    mtdStatus: input.mtdStatus,
    transactionCount:
      input.turnoverBand === 'OVER_1M' ? 600 : input.turnoverBand === 'BAND_500K_1M' ? 400 : 200,
  };
}

function evaluateComplexityFactor(
  factor: ComplexityFactor,
  context: Record<string, unknown>
): boolean {
  const fieldValue = context[factor.field];
  switch (factor.operator) {
    case 'gt':
      return typeof fieldValue === 'number' && fieldValue > factor.value;
    case 'lt':
      return typeof fieldValue === 'number' && fieldValue < factor.value;
    case 'eq':
      return fieldValue === factor.value;
    case 'in':
      return Array.isArray(factor.value) && factor.value.includes(fieldValue);
    case 'contains':
      return (
        typeof fieldValue === 'string' &&
        typeof factor.value === 'string' &&
        fieldValue.includes(factor.value)
      );
    default:
      return false;
  }
}

function applyComplexityAdjustment(
  price: number,
  factor: ComplexityFactor,
  context: Record<string, unknown>
): { price: number; applied: boolean } {
  if (!evaluateComplexityFactor(factor, context)) {
    return { price, applied: false };
  }

  switch (factor.adjustmentType) {
    case 'PERCENTAGE':
      return { price: price * (1 + factor.adjustmentValue / 100), applied: true };
    case 'MULTIPLIER':
      return { price: price * factor.adjustmentValue, applied: true };
    case 'FIXED':
      return { price: price + factor.adjustmentValue, applied: true };
    default:
      return { price, applied: false };
  }
}

function usesTurnoverMultiplier(service: ServiceTemplate): boolean {
  if (service.subcategory === 'Payroll' || service.tags.includes('payroll')) {
    return false;
  }
  const tags = service.tags.join(' ');
  return (
    service.category === 'COMPLIANCE' ||
    service.category === 'BOOKKEEPING' ||
    tags.includes('accounts') ||
    tags.includes('bookkeeping')
  );
}

function calculateServiceFee(
  service: ServiceTemplate,
  input: PricingMethodologyInput,
  baselineOverride?: number
): SuggestedServiceFee {
  const context = buildPricingContext(input);
  let price = baselineOverride ?? service.basePrice;
  const multipliers: AppliedMultiplier[] = [];

  // Catalogue complexity factors (e.g. per-employee payroll, R&D uplift)
  for (const factor of service.complexityFactors) {
    const { price: next, applied } = applyComplexityAdjustment(price, factor, context);
    if (applied) {
      price = next;
      multipliers.push({
        name: factor.field,
        value:
          factor.adjustmentType === 'PERCENTAGE'
            ? 1 + factor.adjustmentValue / 100
            : factor.adjustmentValue,
        description: factor.description,
      });
    }
  }

  // Payroll: per-employee pricing (skip duplicate catalogue gt-1 factor; use explicit count)
  if (service.name === 'Monthly Payroll Processing') {
    price = service.basePrice;
    multipliers.length = 0;
    if (input.employeeCount > 1) {
      const extra = (input.employeeCount - 1) * 8;
      price += extra;
      multipliers.push({
        name: 'employeeCount',
        value: extra,
        description: `£8 per additional employee (${input.employeeCount - 1} extra)`,
      });
    }
  }

  const turnoverMeta = TURNOVER_MULTIPLIERS[input.turnoverBand];
  if (usesTurnoverMultiplier(service)) {
    price *= turnoverMeta.multiplier;
    multipliers.push({
      name: 'turnoverBand',
      value: turnoverMeta.multiplier,
      description: `Turnover band: ${turnoverMeta.label}`,
    });
  }

  if (input.complexity.multiSite) {
    price *= 1.15;
    multipliers.push({
      name: 'multiSite',
      value: 1.15,
      description: 'Multi-site operations (+15%)',
    });
  }

  const entityMult = ENTITY_MULTIPLIERS[input.entityType];
  if (entityMult !== 1) {
    price *= entityMult;
    multipliers.push({
      name: 'entityType',
      value: entityMult,
      description: `${input.entityType.replace(/_/g, ' ').toLowerCase()} adjustment`,
    });
  }

  const rounded = Math.round(Number(price.toFixed(2)));
  const feeLow = Math.round(Number((rounded * (1 - FEE_BAND_TOLERANCE)).toFixed(2)));
  const feeHigh = Math.round(Number((rounded * (1 + FEE_BAND_TOLERANCE)).toFixed(2)));
  const annualEquivalent =
    service.annualEquivalent ?? annualFromBilling(service.basePrice, service.billingCycle);
  const adjustedAnnual = Math.round(
    annualEquivalent *
      (usesTurnoverMultiplier(service) ? turnoverMeta.multiplier : 1) *
      (input.complexity.multiSite ? 1.15 : 1) *
      entityMult
  );

  // Payroll annual includes employee adjustments
  const finalAnnual = service.name === 'Monthly Payroll Processing' ? rounded * 12 : adjustedAnnual;

  return {
    catalogName: service.name,
    category: service.category,
    subcategory: service.subcategory,
    description: service.description,
    billingCycle: service.billingCycle,
    baselinePrice: baselineOverride ?? service.basePrice,
    suggestedPrice: rounded,
    feeLow,
    feeHigh,
    annualEquivalent: finalAnnual,
    multipliers,
    rationale: buildRationale(service, input, multipliers),
  };
}

function buildRationale(
  service: ServiceTemplate,
  input: PricingMethodologyInput,
  multipliers: AppliedMultiplier[]
): string {
  const parts = [`Baseline £${service.basePrice} (${service.billingCycle.toLowerCase()})`];
  if (multipliers.length) {
    parts.push(multipliers.map((m) => m.description).join('; '));
  }
  return parts.join(' → ');
}

function summariseByCategory(services: SuggestedServiceFee[]): CategoryFeeSummary[] {
  const map = new Map<string, CategoryFeeSummary>();

  for (const svc of services) {
    const existing = map.get(svc.category);
    const monthlySuggested =
      svc.billingCycle === 'QUARTERLY'
        ? Math.round(svc.suggestedPrice / 3)
        : svc.billingCycle === 'ANNUALLY' || svc.billingCycle === 'ONE_TIME'
          ? Math.round(svc.suggestedPrice / 12)
          : svc.suggestedPrice;

    const monthlyLow =
      svc.billingCycle === 'QUARTERLY'
        ? Math.round(svc.feeLow / 3)
        : svc.billingCycle === 'ANNUALLY' || svc.billingCycle === 'ONE_TIME'
          ? Math.round(svc.feeLow / 12)
          : svc.feeLow;

    const monthlyHigh =
      svc.billingCycle === 'QUARTERLY'
        ? Math.round(svc.feeHigh / 3)
        : svc.billingCycle === 'ANNUALLY' || svc.billingCycle === 'ONE_TIME'
          ? Math.round(svc.feeHigh / 12)
          : svc.feeHigh;

    if (existing) {
      existing.serviceCount += 1;
      existing.monthlyLow += monthlyLow;
      existing.monthlyHigh += monthlyHigh;
      existing.monthlySuggested += monthlySuggested;
      existing.annualSuggested += svc.annualEquivalent;
    } else {
      map.set(svc.category, {
        category: svc.category,
        label: CATEGORY_LABELS[svc.category] || svc.category,
        serviceCount: 1,
        monthlyLow,
        monthlyHigh,
        monthlySuggested,
        annualSuggested: svc.annualEquivalent,
      });
    }
  }

  return [...map.values()].sort((a, b) => a.category.localeCompare(b.category));
}

export function suggestFees(
  input: PricingMethodologyInput,
  tenantBaselines?: Map<string, number>
): PricingMethodologyResult {
  const catalogServices = resolveCatalogServices(input);
  const services = catalogServices.map((svc) => {
    const baseline = tenantBaselines?.get(normaliseName(svc.name));
    return calculateServiceFee(svc, input, baseline);
  });

  const byCategory = summariseByCategory(services);

  const totals = services.reduce(
    (acc, svc) => {
      const monthly =
        svc.billingCycle === 'QUARTERLY'
          ? Math.round(svc.suggestedPrice / 3)
          : svc.billingCycle === 'ANNUALLY' || svc.billingCycle === 'ONE_TIME'
            ? Math.round(svc.suggestedPrice / 12)
            : svc.suggestedPrice;
      const low =
        svc.billingCycle === 'QUARTERLY'
          ? Math.round(svc.feeLow / 3)
          : svc.billingCycle === 'ANNUALLY' || svc.billingCycle === 'ONE_TIME'
            ? Math.round(svc.feeLow / 12)
            : svc.feeLow;
      const high =
        svc.billingCycle === 'QUARTERLY'
          ? Math.round(svc.feeHigh / 3)
          : svc.billingCycle === 'ANNUALLY' || svc.billingCycle === 'ONE_TIME'
            ? Math.round(svc.feeHigh / 12)
            : svc.feeHigh;

      acc.monthlySuggested += monthly;
      acc.monthlyLow += low;
      acc.monthlyHigh += high;
      acc.annualSuggested += svc.annualEquivalent;
      return acc;
    },
    {
      monthlyLow: 0,
      monthlyHigh: 0,
      monthlySuggested: 0,
      annualSuggested: 0,
      currency: 'GBP' as const,
    }
  );

  return {
    inputs: input,
    services,
    byCategory,
    totals,
    formulaNotes: [
      'Baseline fees from UK accountancy catalogue (ukAccountancyServices.ts).',
      'Turnover band multiplier applied to compliance and bookkeeping services.',
      'Catalogue complexity factors (e.g. per-employee payroll, R&D) applied first.',
      'Multi-site flag adds +15% to all adjusted fees.',
      'Entity-type multiplier adjusts for Ltd / sole trader / LLP / partnership.',
      `Suggested band = calculated fee ±${FEE_BAND_TOLERANCE * 100}% (value-based range).`,
    ],
  };
}

/** Match tenant catalogue services by normalised name for "Apply to proposal". */
export function attachTenantServiceIds(
  result: PricingMethodologyResult,
  tenantServices: Array<{ id: string; name: string; priceAmount?: number | null }>
): PricingMethodologyResult {
  const byName = new Map(tenantServices.map((s) => [normaliseName(s.name), s]));

  const services = result.services.map((svc) => {
    const match = byName.get(normaliseName(svc.catalogName));
    if (!match) return svc;
    return {
      ...svc,
      serviceTemplateId: match.id,
      baselinePrice: match.priceAmount ?? svc.baselinePrice,
    };
  });

  return { ...result, services };
}

export { normaliseName, monthlyEquivalent, CATEGORY_LABELS, TURNOVER_MULTIPLIERS };
