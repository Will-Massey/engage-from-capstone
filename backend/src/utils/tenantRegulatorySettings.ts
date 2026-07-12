/**
 * Tenant-level regulatory rule engine config (stored in Tenant.settings JSON
 * under the `regulatory` namespace). Defaults mirror the exported constants in
 * services/regulatoryRules.ts — all four rule families enabled.
 */
import {
  VAT_REGISTRATION_THRESHOLD,
  MTD_ITSA_THRESHOLD_2026,
  MTD_ITSA_THRESHOLD_2027,
} from '../services/regulatoryRules.js';

export interface RegulatorySettings {
  /** VAT registration threshold rules (family: vat) */
  vatEnabled: boolean;
  /** MTD ITSA mandation wave rules (family: mtd_itsa) */
  mtdItsaEnabled: boolean;
  /** Filing-deadline coverage gap rules (family: filing_deadlines) */
  filingDeadlinesEnabled: boolean;
  /** Payroll / auto-enrolment gap rules (family: payroll) */
  payrollEnabled: boolean;
  /** VAT registration threshold in £ (statutory default £90,000) */
  vatThreshold: number;
  /** MTD ITSA gross income threshold for the April 2026 wave (£50,000) */
  mtdItsaThreshold2026: number;
  /** MTD ITSA gross income threshold for the April 2027 wave (£30,000) */
  mtdItsaThreshold2027: number;
  /** How far ahead (days) to flag filing deadlines with no covering service */
  deadlineWindowDays: number;
}

export const DEFAULT_REGULATORY_SETTINGS: RegulatorySettings = {
  vatEnabled: true,
  mtdItsaEnabled: true,
  filingDeadlinesEnabled: true,
  payrollEnabled: true,
  vatThreshold: VAT_REGISTRATION_THRESHOLD,
  mtdItsaThreshold2026: MTD_ITSA_THRESHOLD_2026,
  mtdItsaThreshold2027: MTD_ITSA_THRESHOLD_2027,
  deadlineWindowDays: 60,
};

function boolOr(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback;
}

function positiveNumberOr(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

export function getRegulatorySettings(tenantSettingsJson?: string | null): RegulatorySettings {
  try {
    const parsed = JSON.parse(tenantSettingsJson || '{}');
    const r = parsed.regulatory || {};
    return {
      vatEnabled: boolOr(r.vatEnabled, DEFAULT_REGULATORY_SETTINGS.vatEnabled),
      mtdItsaEnabled: boolOr(r.mtdItsaEnabled, DEFAULT_REGULATORY_SETTINGS.mtdItsaEnabled),
      filingDeadlinesEnabled: boolOr(
        r.filingDeadlinesEnabled,
        DEFAULT_REGULATORY_SETTINGS.filingDeadlinesEnabled
      ),
      payrollEnabled: boolOr(r.payrollEnabled, DEFAULT_REGULATORY_SETTINGS.payrollEnabled),
      vatThreshold: positiveNumberOr(r.vatThreshold, DEFAULT_REGULATORY_SETTINGS.vatThreshold),
      mtdItsaThreshold2026: positiveNumberOr(
        r.mtdItsaThreshold2026,
        DEFAULT_REGULATORY_SETTINGS.mtdItsaThreshold2026
      ),
      mtdItsaThreshold2027: positiveNumberOr(
        r.mtdItsaThreshold2027,
        DEFAULT_REGULATORY_SETTINGS.mtdItsaThreshold2027
      ),
      deadlineWindowDays: positiveNumberOr(
        r.deadlineWindowDays,
        DEFAULT_REGULATORY_SETTINGS.deadlineWindowDays
      ),
    };
  } catch {
    return { ...DEFAULT_REGULATORY_SETTINGS };
  }
}
