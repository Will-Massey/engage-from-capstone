/**
 * Tenant-level proposal defaults (stored in Tenant.settings JSON).
 */
export interface ProposalSettings {
  /** Days from creation until the proposal expires if not set per proposal */
  defaultExpiryDays: number;
  /** Days before validUntil / renewalDate to send reminder emails */
  renewalReminderDays: number;
}

export const DEFAULT_PROPOSAL_SETTINGS: ProposalSettings = {
  defaultExpiryDays: 30,
  renewalReminderDays: 30,
};

export function getProposalSettings(tenantSettingsJson?: string | null): ProposalSettings {
  try {
    const parsed = JSON.parse(tenantSettingsJson || '{}');
    const p = parsed.proposals || {};
    return {
      defaultExpiryDays:
        typeof p.defaultExpiryDays === 'number' && p.defaultExpiryDays > 0
          ? p.defaultExpiryDays
          : DEFAULT_PROPOSAL_SETTINGS.defaultExpiryDays,
      renewalReminderDays:
        typeof p.renewalReminderDays === 'number' && p.renewalReminderDays > 0
          ? p.renewalReminderDays
          : DEFAULT_PROPOSAL_SETTINGS.renewalReminderDays,
    };
  } catch {
    return DEFAULT_PROPOSAL_SETTINGS;
  }
}

export function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

/** Parse YYYY-MM-DD or ISO datetime; returns undefined if arg omitted */
export function parseProposalDateInput(raw: unknown): Date | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  const s = String(raw).trim();
  if (!s) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s)
    ? new Date(`${s}T12:00:00.000Z`)
    : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toProposalDateIso(raw: unknown): string | undefined {
  const d = parseProposalDateInput(raw);
  if (d === undefined) return undefined;
  if (d === null) return undefined;
  return d.toISOString();
}
