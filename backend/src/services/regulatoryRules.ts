/**
 * Regulatory rule engine — deterministic rules, not LLM (W3.5)
 * MTD ITSA thresholds (£50k / £30k) and VAT registration (£90k)
 */

import { CompanyType, MTDITSAStatus } from '@prisma/client';

export type RegulatoryRuleSeverity = 'info' | 'warning' | 'action_required';

export interface RegulatoryRule {
  id: string;
  title: string;
  description: string;
  severity: RegulatoryRuleSeverity;
  category: 'mtd_itsa' | 'vat' | 'compliance';
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

const MTD_ITSA_THRESHOLD_2026 = 50_000;
const MTD_ITSA_THRESHOLD_2027 = 30_000;
const VAT_REGISTRATION_THRESHOLD = 90_000;

const MTD_APPLICABLE_TYPES: CompanyType[] = [
  CompanyType.SOLE_TRADER,
  CompanyType.PARTNERSHIP,
];

function effectiveIncome(input: RegulatoryCheckInput): number {
  return input.mtditsaIncome ?? input.turnover ?? 0;
}

function isMtdItsaApplicable(companyType: CompanyType): boolean {
  return MTD_APPLICABLE_TYPES.includes(companyType);
}

/**
 * Evaluate applicable regulatory rules for a client.
 */
export function checkRegulatoryRules(
  clientId: string,
  input: RegulatoryCheckInput
): RegulatoryCheckResult {
  const rules: RegulatoryRule[] = [];
  const income = effectiveIncome(input);

  if (isMtdItsaApplicable(input.companyType)) {
    if (income >= MTD_ITSA_THRESHOLD_2026) {
      rules.push({
        id: 'mtd-itsa-2026-mandatory',
        title: 'MTD ITSA mandatory from April 2026',
        description: `Gross income of £${income.toLocaleString('en-GB')} exceeds the £50,000 threshold. Quarterly digital updates, an End of Period Statement, and a Final Declaration are required from 6 April 2026.`,
        severity: 'action_required',
        category: 'mtd_itsa',
        effectiveFrom: '2026-04-06',
        threshold: MTD_ITSA_THRESHOLD_2026,
        source: 'HMRC MTD ITSA mandation timetable',
      });
    } else if (income >= MTD_ITSA_THRESHOLD_2027) {
      rules.push({
        id: 'mtd-itsa-2027-mandatory',
        title: 'MTD ITSA mandatory from April 2027',
        description: `Gross income of £${income.toLocaleString('en-GB')} exceeds the £30,000 threshold. MTD ITSA obligations apply from 6 April 2027.`,
        severity: 'warning',
        category: 'mtd_itsa',
        effectiveFrom: '2027-04-06',
        threshold: MTD_ITSA_THRESHOLD_2027,
        source: 'HMRC MTD ITSA mandation timetable',
      });
    } else if (income >= MTD_ITSA_THRESHOLD_2027 * 0.8) {
      rules.push({
        id: 'mtd-itsa-approaching-2027',
        title: 'Approaching MTD ITSA £30,000 threshold',
        description: `Income is within 20% of the £30,000 MTD ITSA threshold for April 2027. Monitor turnover and plan MTD-compatible software.`,
        severity: 'info',
        category: 'mtd_itsa',
        threshold: MTD_ITSA_THRESHOLD_2027,
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
        source: 'Engage client record',
      });
    }
  }

  if (!input.vatRegistered && income >= VAT_REGISTRATION_THRESHOLD) {
    rules.push({
      id: 'vat-registration-required',
      title: 'VAT registration likely required',
      description: `Taxable turnover of £${income.toLocaleString('en-GB')} exceeds the £90,000 VAT registration threshold. The client should register for VAT unless a specific exemption applies.`,
      severity: 'action_required',
      category: 'vat',
      threshold: VAT_REGISTRATION_THRESHOLD,
      source: 'HMRC VAT registration threshold 2024/25 onwards',
    });
  } else if (!input.vatRegistered && income >= VAT_REGISTRATION_THRESHOLD * 0.85) {
    rules.push({
      id: 'vat-registration-approaching',
      title: 'Approaching VAT registration threshold',
      description: `Turnover is approaching the £90,000 VAT registration threshold. Review rolling 12-month taxable turnover monthly.`,
      severity: 'warning',
      category: 'vat',
      threshold: VAT_REGISTRATION_THRESHOLD,
      source: 'HMRC VAT registration threshold',
    });
  }

  if (input.vatRegistered && income < VAT_REGISTRATION_THRESHOLD * 0.5) {
    rules.push({
      id: 'vat-deregistration-review',
      title: 'Review VAT registration status',
      description:
        'Turnover is well below the VAT threshold. Consider whether VAT deregistration or a VAT scheme review is appropriate.',
      severity: 'info',
      category: 'vat',
      threshold: VAT_REGISTRATION_THRESHOLD,
      source: 'HMRC VAT deregistration guidance',
    });
  }

  const summary = {
    actionRequired: rules.filter((r) => r.severity === 'action_required').length,
    warnings: rules.filter((r) => r.severity === 'warning').length,
    info: rules.filter((r) => r.severity === 'info').length,
  };

  return {
    clientId,
    assessedAt: new Date().toISOString(),
    incomeUsed: income,
    rules,
    summary,
  };
}