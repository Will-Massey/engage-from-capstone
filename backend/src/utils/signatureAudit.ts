/**
 * Forensic helpers for electronic signature authenticity.
 */
import crypto from 'crypto';
import logger from '../config/logger.js';

export const AGREEMENT_VERSION = 'ENGAGE-PRO-2026-001';

export const DEFAULT_CONSENT_TEXT =
  'I confirm that I have read and agree to the terms and conditions of this proposal, ' +
  'and that I am authorised to sign on behalf of the client organisation named in this document.';

export function hashContent(payload: unknown): string {
  const normalized = JSON.stringify(payload, Object.keys(payload as object).sort());
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export function hashProposalDocument(proposal: {
  id: string;
  reference: string;
  title: string;
  terms?: string | null;
  services: Array<{
    name: string;
    displayPricePence: number;
    billingFrequency?: string | null;
    quantity?: number | null;
    lineTotalPence: number;
    grossTotalPence: number;
  }>;
}): string {
  // Hashes the stored pence snapshot (Stage 2). Hashes are stamped at sign
  // time and never recomputed against history, so this change only affects
  // signatures made after the pence cutover.
  return hashContent({
    id: proposal.id,
    reference: proposal.reference,
    title: proposal.title,
    services: proposal.services.map((s) => ({
      name: s.name,
      displayPricePence: s.displayPricePence,
      billingFrequency: s.billingFrequency,
      quantity: s.quantity,
      lineTotalPence: s.lineTotalPence,
      grossTotalPence: s.grossTotalPence,
    })),
  });
}

export function hashTerms(terms: string | null | undefined): string {
  return crypto
    .createHash('sha256')
    .update(terms || '')
    .digest('hex');
}

export type GeoLocationPayload = {
  city: string | null;
  country: string | null;
};

/** Serialise geo payload for storage in ProposalSignature.geoLocation. */
export function formatGeoLocationJson(payload: GeoLocationPayload): string | null {
  if (!payload.city && !payload.country) return null;
  return JSON.stringify(payload);
}

/** Human-readable label from stored geoLocation (JSON or legacy string). */
export function formatGeoLocationDisplay(geoLocation: string | null | undefined): string {
  if (!geoLocation) return '—';
  try {
    const parsed = JSON.parse(geoLocation) as GeoLocationPayload;
    const parts = [parsed.city, parsed.country].filter(Boolean);
    if (parts.length) return parts.join(', ');
  } catch {
    // Legacy plain-text value
  }
  return geoLocation;
}

/** Best-effort IP geolocation via ip-api.com (no API key, 3s timeout). */
export async function lookupGeoFromIp(ip: string | null): Promise<string | null> {
  if (!ip) return null;
  const normalized = ip.replace(/^::ffff:/, '');
  if (normalized === '::1' || normalized.startsWith('127.') || normalized === 'localhost') {
    return formatGeoLocationJson({ city: 'Local', country: 'Development' });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(normalized)}?fields=status,city,country`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    const data = (await res.json()) as {
      status?: string;
      city?: string;
      country?: string;
    };
    if (data.status === 'success') {
      return formatGeoLocationJson({
        city: data.city || null,
        country: data.country || null,
      });
    }
  } catch (err) {
    logger.debug('IP geolocation lookup failed', err);
  }
  return null;
}
