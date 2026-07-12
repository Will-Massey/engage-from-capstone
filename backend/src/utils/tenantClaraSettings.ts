/**
 * Tenant-level Clara autopilot config (stored in Tenant.settings JSON under
 * the `clara` namespace). Agentic drafting is opt-in per tenant — default OFF.
 * Safety ceiling: Clara only ever creates DRAFT proposals queued into the
 * partner-approval workflow; she never sends anything.
 */
import type { RegulatoryRuleFamily } from '../services/regulatoryRules.js';

export const CLARA_REGULATORY_FAMILIES: RegulatoryRuleFamily[] = [
  'vat',
  'mtd_itsa',
  'filing_deadlines',
  'payroll',
];

export interface ClaraSettings {
  /** Master switch for agentic drafting (default OFF — explicit opt-in) */
  agenticDraftingEnabled: boolean;
  /** Regulatory rule families Clara may draft from */
  draftRegulatoryFamilies: RegulatoryRuleFamily[];
  /** Draft renewal proposals for contracts nearing their renewal date */
  draftRenewals: boolean;
  /** Percentage uplift applied to Clara-drafted renewals (0 = straight renewal) */
  renewalUpliftPercent: number;
  /** Use the LLM for cover-letter prose (facts/prices stay deterministic) */
  useAiCoverLetter: boolean;
  /** Explicit owner for Clara's net-new drafts (falls back to ADMIN → PARTNER → MD) */
  draftOwnerUserId?: string;
  /** Ceiling on drafts created in a single run (signals + renewals combined) */
  maxDraftsPerRun: number;
}

export const DEFAULT_CLARA_SETTINGS: ClaraSettings = {
  agenticDraftingEnabled: false,
  draftRegulatoryFamilies: [...CLARA_REGULATORY_FAMILIES],
  draftRenewals: true,
  renewalUpliftPercent: 0,
  useAiCoverLetter: true,
  maxDraftsPerRun: 10,
};

function boolOr(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback;
}

function normaliseFamilies(raw: unknown): RegulatoryRuleFamily[] {
  if (!Array.isArray(raw)) return [...CLARA_REGULATORY_FAMILIES];
  const families = raw.filter((f): f is RegulatoryRuleFamily =>
    CLARA_REGULATORY_FAMILIES.includes(f as RegulatoryRuleFamily)
  );
  return Array.from(new Set(families));
}

export function getClaraSettings(tenantSettingsJson?: string | null): ClaraSettings {
  try {
    const parsed = JSON.parse(tenantSettingsJson || '{}');
    const c = parsed.clara || {};
    return {
      agenticDraftingEnabled: boolOr(
        c.agenticDraftingEnabled,
        DEFAULT_CLARA_SETTINGS.agenticDraftingEnabled
      ),
      draftRegulatoryFamilies:
        c.draftRegulatoryFamilies === undefined
          ? [...CLARA_REGULATORY_FAMILIES]
          : normaliseFamilies(c.draftRegulatoryFamilies),
      draftRenewals: boolOr(c.draftRenewals, DEFAULT_CLARA_SETTINGS.draftRenewals),
      renewalUpliftPercent:
        typeof c.renewalUpliftPercent === 'number' && Number.isFinite(c.renewalUpliftPercent)
          ? c.renewalUpliftPercent
          : DEFAULT_CLARA_SETTINGS.renewalUpliftPercent,
      useAiCoverLetter: boolOr(c.useAiCoverLetter, DEFAULT_CLARA_SETTINGS.useAiCoverLetter),
      draftOwnerUserId:
        typeof c.draftOwnerUserId === 'string' && c.draftOwnerUserId.trim()
          ? c.draftOwnerUserId
          : undefined,
      maxDraftsPerRun:
        typeof c.maxDraftsPerRun === 'number' &&
        Number.isInteger(c.maxDraftsPerRun) &&
        c.maxDraftsPerRun > 0
          ? c.maxDraftsPerRun
          : DEFAULT_CLARA_SETTINGS.maxDraftsPerRun,
    };
  } catch {
    return { ...DEFAULT_CLARA_SETTINGS, draftRegulatoryFamilies: [...CLARA_REGULATORY_FAMILIES] };
  }
}
