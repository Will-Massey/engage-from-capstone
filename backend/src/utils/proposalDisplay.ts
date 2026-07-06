/**
 * Shared display helpers for proposals — settings-driven names and roles.
 */

export interface ClientAddress {
  line1?: string;
  line2?: string;
  city?: string;
  postcode?: string;
  country?: string;
}

export interface PreparedForClient {
  name: string;
  contactName?: string | null;
  contactEmail?: string;
  contactPhone?: string | null;
  companyNumber?: string | null;
  address?: unknown;
}

export interface PreparedByUser {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle?: string | null;
  role?: string | null;
}

/** Parse client address whether stored as JSON string or object. */
export function parseClientAddress(raw: unknown): ClientAddress | null {
  if (!raw) return null;
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const a = parsed as Record<string, unknown>;
  return {
    line1: typeof a.line1 === 'string' ? a.line1 : undefined,
    line2: typeof a.line2 === 'string' ? a.line2 : undefined,
    city: typeof a.city === 'string' ? a.city : undefined,
    postcode: typeof a.postcode === 'string' ? a.postcode : undefined,
    country: typeof a.country === 'string' ? a.country : undefined,
  };
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  PARTNER: 'Partner',
  MD: 'Managing Director',
  MANAGER: 'Manager',
  SENIOR: 'Senior',
  JUNIOR: 'Junior',
};

/** Human-readable role when job title is not set in Settings. */
export function formatUserRole(role?: string | null): string | undefined {
  if (!role?.trim()) return undefined;
  const key = role.trim().toUpperCase();
  if (ROLE_LABELS[key]) return ROLE_LABELS[key];
  return role
    .trim()
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Job title from Settings Profile, else formatted system role. */
export function senderPosition(user: PreparedByUser): string | undefined {
  const title = user.jobTitle?.trim();
  if (title) return title;
  return formatUserRole(user.role);
}

/** Salutation / addressee — contact name preferred. */
export function coverLetterAddressee(client: PreparedForClient): string {
  const contact = client.contactName?.trim();
  return contact || client.name;
}

/** Lines for "Prepared for" block: contact name then company when different. */
export function preparedForLines(client: PreparedForClient): string[] {
  const contact = client.contactName?.trim();
  const company = client.name?.trim();
  const lines: string[] = [];
  if (contact) lines.push(contact);
  if (company && company !== contact) lines.push(company);
  if (!lines.length && company) lines.push(company);
  return lines;
}
