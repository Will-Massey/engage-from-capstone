/**
 * Regulatory rule engine — deterministic rules, not LLM (W3.5, extended R5.2).
 *
 * Rule families:
 *  - vat              — VAT registration threshold (£90k default)
 *  - mtd_itsa         — MTD ITSA mandation waves (£50k Apr 2026 / £30k Apr 2027)
 *  - filing_deadlines — statutory filings due soon with no covering engaged service
 *  - payroll          — staff on record but no payroll service engaged (AE duties)
 *
 * Income basis: point-in-time `mtditsaIncome ?? turnover ?? 0` from the client
 * record. Rolling 12-month turnover data does not exist in Engage, so threshold
 * rules are indicative snapshots, not statutory rolling-period tests.
 *
 * No CT600 / corporation tax deadline rule: the Client model has no corporation
 * tax due date field, so a deterministic rule cannot be evaluated (skipped).
 */

import { CompanyType, MTDITSAStatus } from '@prisma/client';
import type { RegulatorySettings } from '../utils/tenantRegulatorySettings.js';

export type RegulatoryRuleSeverity = 'info' | 'warning' | 'action_required';

export type RegulatoryRuleFamily = 'vat' | 'mtd_itsa' | 'filing_deadlines' | 'payroll';

export interface RegulatoryRule {
  id: string;
  title: string;
  description: string;
  severity: RegulatoryRuleSeverity;
  category: 'mtd_itsa' | 'vat' | 'compliance' | 'filing' | 'payroll';
  family: RegulatoryRuleFamily;
  effectiveFrom?: string;
  threshold?: number;
  source: string;
}

export interface RegulatoryCheckInput {
  companyType: CompanyType;
  turnover?: number | null;
  mtditsaIncome?: number | null;
  mtditsaStatus?: MTDITSAStatus;
  vatRegistered?: boolean;
}

/** Full client input for the R5.2 engine (superset of the W3.5 check input). */
export interface ClientRuleInput extends RegulatoryCheckInput {
  employeeCount?: number | null;
  nextVatDueDate?: Date | null;
  nextAccountsDueDate?: Date | null;
  nextConfirmationStatementDue?: Date | null;
}

/** Engaged service line derived from accepted proposals (see engagedServices.ts). */
export interface EngagedService {
  name: string;
  /** ServiceTemplate.category when the line was built from the catalog */
  category?: string | null;
}

export interface RegulatoryCheckResult {
  clientId: string;
  assessedAt: string;
  incomeUsed: number;
  rules: RegulatoryRule[];
  summary: {
    actionRequired: number;
    warnings: number;
    info: number;
  };
}

export const MTD_ITSA_THRESHOLD_2026 = 50_000;
export const MTD_ITSA_THRESHOLD_2027 = 30_000;
export const VAT_REGISTRATION_THRESHOLD = 90_000;

const MTD_APPLICABLE_TYPES: CompanyType[] = [CompanyType.SOLE_TRADER, CompanyType.PARTNERSHIP];

/** Built-in defaults — mirror DEFAULT_REGULATORY_SETTINGS without a runtime import cycle. */
const BUILTIN_SETTINGS: RegulatorySettings = {
  vatEnabled: true,
  mtdItsaEnabled: true,
  filingDeadlinesEnabled: true,
  payrollEnabled: true,
  vatThreshold: VAT_REGISTRATION_THRESHOLD,
  mtdItsaThreshold2026: MTD_ITSA_THRESHOLD_2026,
  mtdItsaThreshold2027: MTD_ITSA_THRESHOLD_2027,
  deadlineWindowDays: 60,
};

/**
 * Conservative engaged-service coverage matchers per filing. A filing counts as
 * covered when any accepted-proposal service line matches by name (regex) or by
 * catalog category. Reuses the accounts regex style from scanTenantRegulatoryAlerts.
 */
export const ACCOUNTS_SERVICE_PATTERN =
  /annual accounts|statutory accounts|year[\s-]?end accounts|accounts preparation|financial statements/i;
export const CONFIRMATION_STATEMENT_SERVICE_PATTERN =
  /confirmation statement|annual return|company secretarial/i;
export const VAT_SERVICE_PATTERN = /\bvat\b/i;
export const PAYROLL_SERVICE_PATTERN = /payroll|\bpaye\b|auto[\s-]?enrol?lment|\bpension\b/i;

export function hasAccountsCoverage(services: EngagedService[]): boolean {
  return services.some(
    (s) =>
      ACCOUNTS_SERVICE_PATTERN.test(s.name) ||
      (s.category === 'COMPLIANCE' && /\baccounts\b/i.test(s.name))
  );
}

export function hasConfirmationStatementCoverage(services: EngagedService[]): boolean {
  return services.some((s) => CONFIRMATION_STATEMENT_SERVICE_PATTERN.test(s.name));
}

export function hasVatReturnCoverage(services: EngagedService[]): boolean {
  return services.some((s) => VAT_SERVICE_PATTERN.test(s.name));
}

export function hasPayrollCoverage(services: EngagedService[]): boolean {
  return services.some((s) => s.category === 'PAYROLL' || PAYROLL_SERVICE_PATTERN.test(s.name));
}

function effectiveIncome(input: RegulatoryCheckInput): number {
  // Point-in-time snapshot — see module docblock re: no rolling 12-month data.
  return input.mtditsaIncome ?? input.turnover ?? 0;
}

function isMtdItsaApplicable(companyType: CompanyType): boolean {
  return MTD_APPLICABLE_TYPES.includes(companyType);
}

function daysUntil(date: Date, now: Date): number {
  return Math.ceil((date.getTime() - now.getTime()) / 86_400_000);
}

function formatDueDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function duePhrase(date: Date, now: Date): string {
  const days = daysUntil(date, now);
  if (days < 0) return `was due ${formatDueDate(date)} (${Math.abs(days)} days overdue)`;
  if (days === 0) return `is due today (${formatDueDate(date)})`;
  return `is due ${formatDueDate(date)} (${days} days away)`;
}

function evaluateMtdItsaRules(
  input: ClientRuleInput,
  settings: RegulatorySettings,
  income: number
): RegulatoryRule[] {
  const rules: RegulatoryRule[] = [];
  if (!isMtdItsaApplicable(input.companyType)) return rules;

  if (income >= settings.mtdItsaThreshold2026) {
    rules.push({
      id: 'mtd-itsa-2026-mandatory',
      title: 'MTD ITSA mandatory from April 2026',
      description: `Gross income of £${income.toLocaleString('en-GB')} exceeds the £${settings.mtdItsaThreshold2026.toLocaleString('en-GB')} threshold. Quarterly digital updates, an End of Period Statement, and a Final Declaration are required from 6 April 2026.`,
      severity: 'action_required',
      category: 'mtd_itsa',
      family: 'mtd_itsa',
      effectiveFrom: '2026-04-06',
      threshold: settings.mtdItsaThreshold2026,
      source: 'HMRC MTD ITSA mandation timetable',
    });
  } else if (income >= settings.mtdItsaThreshold2027) {
    rules.push({
      id: 'mtd-itsa-2027-mandatory',
      title: 'MTD ITSA mandatory from April 2027',
      description: `Gross income of £${income.toLocaleString('en-GB')} exceeds the £${settings.mtdItsaThreshold2027.toLocaleString('en-GB')} threshold. MTD ITSA obligations apply from 6 April 2027.`,
      severity: 'warning',
      category: 'mtd_itsa',
      family: 'mtd_itsa',
      effectiveFrom: '2027-04-06',
      threshold: settings.mtdItsaThreshold2027,
      source: 'HMRC MTD ITSA mandation timetable',
    });
  } else if (income >= settings.mtdItsaThreshold2027 * 0.8) {
    rules.push({
      id: 'mtd-itsa-approaching-2027',
      title: `Approaching MTD ITSA £${settings.mtdItsaThreshold2027.toLocaleString('en-GB')} threshold`,
      description: `Income is within 20% of the £${settings.mtdItsaThreshold2027.toLocaleString('en-GB')} MTD ITSA threshold for April 2027. Monitor turnover and plan MTD-compatible software.`,
      severity: 'info',
      category: 'mtd_itsa',
      family: 'mtd_itsa',
      threshold: settings.mtdItsaThreshold2027,
      source: 'HMRC MTD ITSA mandation timetable',
    });
  }

  const flaggedMtdStatuses: MTDITSAStatus[] = [
    MTDITSAStatus.REQUIRED_2026,
    MTDITSAStatus.REQUIRED_2027,
    MTDITSAStatus.MANDATORY,
  ];
  if (input.mtditsaStatus && flaggedMtdStatuses.includes(input.mtditsaStatus)) {
    rules.push({
      id: 'mtd-itsa-status-flagged',
      title: 'MTD ITSA status flagged on client record',
      description: `Client MTD ITSA status is ${input.mtditsaStatus.replace(/_/g, ' ').toLowerCase()}. Ensure proposal services include MTD ITSA support where appropriate.`,
      severity: 'action_required',
      category: 'mtd_itsa',
      family: 'mtd_itsa',
      source: 'Engage client record',
    });
  }

  return rules;
}

function evaluateVatRules(
  input: ClientRuleInput,
  settings: RegulatorySettings,
  income: number
): RegulatoryRule[] {
  const rules: RegulatoryRule[] = [];

  if (!input.vatRegistered && income >= settings.vatThreshold) {
    rules.push({
      id: 'vat-registration-required',
      title: 'VAT registration likely required',
      description: `Taxable turnover of £${income.toLocaleString('en-GB')} exceeds the £${settings.vatThreshold.toLocaleString('en-GB')} VAT registration threshold. The client should register for VAT unless a specific exemption applies.`,
      severity: 'action_required',
      category: 'vat',
      family: 'vat',
      threshold: settings.vatThreshold,
      source: 'HMRC VAT registration threshold 2024/25 onwards',
    });
  } else if (!input.vatRegistered && income >= settings.vatThreshold * 0.85) {
    rules.push({
      id: 'vat-registration-approaching',
      title: 'Approaching VAT registration threshold',
      description: `Turnover is approaching the £${settings.vatThreshold.toLocaleString('en-GB')} VAT registration threshold. Review rolling 12-month taxable turnover monthly.`,
      severity: 'warning',
      category: 'vat',
      family: 'vat',
      threshold: settings.vatThreshold,
      source: 'HMRC VAT registration threshold',
    });
  }

  if (input.vatRegistered && income < settings.vatThreshold * 0.5) {
    rules.push({
      id: 'vat-deregistration-review',
      title: 'Review VAT registration status',
      description:
        'Turnover is well below the VAT threshold. Consider whether VAT deregistration or a VAT scheme review is appropriate.',
      severity: 'info',
      category: 'vat',
      family: 'vat',
      threshold: settings.vatThreshold,
      source: 'HMRC VAT deregistration guidance',
    });
  }

  return rules;
}

function evaluateFilingDeadlineRules(
  input: ClientRuleInput,
  engagedServices: EngagedService[],
  settings: RegulatorySettings,
  now: Date
): RegulatoryRule[] {
  const rules: RegulatoryRule[] = [];
  const windowMs = settings.deadlineWindowDays * 86_400_000;
  const withinWindow = (date: Date | null | undefined): date is Date =>
    date != null && date.getTime() <= now.getTime() + windowMs;

  if (
    withinWindow(input.nextConfirmationStatementDue) &&
    !hasConfirmationStatementCoverage(engagedServices)
  ) {
    rules.push({
      id: 'filing-confirmation-statement-gap',
      title: 'Confirmation statement due with no covering service',
      description: `The confirmation statement ${duePhrase(input.nextConfirmationStatementDue, now)}, but no engaged service covers company secretarial / confirmation statement filing. Propose or confirm coverage before the deadline.`,
      severity: 'warning',
      category: 'filing',
      family: 'filing_deadlines',
      source: 'Companies House filing requirements',
    });
  }

  if (withinWindow(input.nextAccountsDueDate) && !hasAccountsCoverage(engagedServices)) {
    rules.push({
      id: 'filing-accounts-gap',
      title: 'Annual accounts due with no covering service',
      description: `Annual accounts ${duePhrase(input.nextAccountsDueDate, now)}, but no engaged service covers statutory accounts preparation. Late filing incurs automatic Companies House penalties — propose or confirm coverage now.`,
      severity: 'action_required',
      category: 'filing',
      family: 'filing_deadlines',
      source: 'Companies House filing requirements',
    });
  }

  if (
    input.vatRegistered &&
    withinWindow(input.nextVatDueDate) &&
    !hasVatReturnCoverage(engagedServices)
  ) {
    rules.push({
      id: 'filing-vat-return-gap',
      title: 'VAT return due with no covering service',
      description: `The next VAT return ${duePhrase(input.nextVatDueDate, now)}, but no engaged service covers VAT returns. Confirm who is filing, or propose a VAT service.`,
      severity: 'warning',
      category: 'filing',
      family: 'filing_deadlines',
      source: 'HMRC VAT return deadlines',
    });
  }

  return rules;
}

function evaluatePayrollRules(
  input: ClientRuleInput,
  engagedServices: EngagedService[]
): RegulatoryRule[] {
  const rules: RegulatoryRule[] = [];

  if ((input.employeeCount ?? 0) >= 1 && !hasPayrollCoverage(engagedServices)) {
    const staff = input.employeeCount ?? 0;
    rules.push({
      id: 'payroll-no-service-gap',
      title: 'Staff on record but no payroll service engaged',
      description: `${staff} employee${staff === 1 ? '' : 's'} on record but no engaged payroll service. Employers must run PAYE and meet auto-enrolment pension duties (assess staff, enrol eligible jobholders, and submit declarations of compliance) — propose a payroll service or confirm who operates payroll.`,
      severity: 'warning',
      category: 'payroll',
      family: 'payroll',
      source: 'PAYE and Pensions Act 2008 auto-enrolment duties',
    });
  }

  return rules;
}

/**
 * Pure R5.2 rule evaluation — no DB access, fully unit-testable.
 * Family toggles and thresholds come from tenant RegulatorySettings.
 */
export function evaluateClientRules(
  input: ClientRuleInput,
  engagedServices: EngagedService[],
  settings: RegulatorySettings,
  now: Date
): RegulatoryRule[] {
  const income = effectiveIncome(input);
  const rules: RegulatoryRule[] = [];

  if (settings.mtdItsaEnabled) {
    rules.push(...evaluateMtdItsaRules(input, settings, income));
  }
  if (settings.vatEnabled) {
    rules.push(...evaluateVatRules(input, settings, income));
  }
  if (settings.filingDeadlinesEnabled) {
    rules.push(...evaluateFilingDeadlineRules(input, engagedServices, settings, now));
  }
  if (settings.payrollEnabled) {
    rules.push(...evaluatePayrollRules(input, engagedServices));
  }

  return rules;
}

/**
 * Evaluate applicable regulatory rules for a client (W3.5 point-in-time check).
 * Backward-compatible contract for GET /api/regulatory/check/:clientId — the
 * input carries no deadline/employee data, so only vat + mtd_itsa rules fire.
 */
export function checkRegulatoryRules(
  clientId: string,
  input: RegulatoryCheckInput
): RegulatoryCheckResult {
  const rules = evaluateClientRules(input, [], BUILTIN_SETTINGS, new Date());

  const summary = {
    actionRequired: rules.filter((r) => r.severity === 'action_required').length,
    warnings: rules.filter((r) => r.severity === 'warning').length,
    info: rules.filter((r) => r.severity === 'info').length,
  };

  return {
    clientId,
    assessedAt: new Date().toISOString(),
    incomeUsed: effectiveIncome(input),
    rules,
    summary,
  };
}
