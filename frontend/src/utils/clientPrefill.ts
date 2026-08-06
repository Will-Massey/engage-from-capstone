/**
 * Cross-app client prefill for /clients/new (2026-07).
 *
 * Partner apps (first consumer: the Graft accountant portal) deep-link into
 * Engage with the client's details so the practice can produce a quote
 * without retyping anything:
 *
 *   /clients/new?prefill=<base64url JSON>&next=proposal
 *
 * The blob is plain data the sender already holds (name/email/phone/type) —
 * no secrets, no auth semantics; Engage's own session decides what the user
 * can do. Parsing is strictly allowlisted: unknown keys are dropped, wrong
 * types ignored, and a malformed blob yields null (the form just starts
 * empty). `next=proposal` sends the user straight into the proposal builder
 * with the new client preselected after save.
 */

export interface ClientPrefill {
  name?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  companyType?:
    | 'LIMITED_COMPANY'
    | 'SOLE_TRADER'
    | 'PARTNERSHIP'
    | 'LLP'
    | 'CHARITY'
    | 'NON_PROFIT';
  notes?: string;
  /** Sender tag, e.g. 'graft' — used for copy only, never trusted. */
  source?: string;
}

const COMPANY_TYPES = new Set([
  'LIMITED_COMPANY',
  'SOLE_TRADER',
  'PARTNERSHIP',
  'LLP',
  'CHARITY',
  'NON_PROFIT',
]);

const MAX_FIELD = 500;

function cleanString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().slice(0, MAX_FIELD);
  return trimmed ? trimmed : undefined;
}

/** base64url → JSON, unicode-safe. Returns null on any decode failure. */
function decodeBlob(blob: string): unknown {
  try {
    const b64 = blob.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/**
 * parseClientPrefill(search) → the allowlisted prefill or null.
 * @param search window.location.search / useSearchParams().toString()
 */
export function parseClientPrefill(search: string): ClientPrefill | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const blob = params.get('prefill');
  if (!blob) return null;
  const raw = decodeBlob(blob);
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;

  const companyType = cleanString(record.companyType);
  const prefill: ClientPrefill = {
    name: cleanString(record.name),
    contactName: cleanString(record.contactName),
    contactEmail: cleanString(record.contactEmail),
    contactPhone: cleanString(record.contactPhone),
    companyType:
      companyType && COMPANY_TYPES.has(companyType)
        ? (companyType as ClientPrefill['companyType'])
        : undefined,
    notes: cleanString(record.notes),
    source: cleanString(record.source),
  };

  const hasAnything = Object.values(prefill).some((v) => v !== undefined);
  return hasAnything ? prefill : null;
}

/** The post-create destination the link asked for ('proposal' or null). */
export function parseNextAction(search: string): 'proposal' | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return params.get('next') === 'proposal' ? 'proposal' : null;
}
