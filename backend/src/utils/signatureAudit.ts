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
    displayPrice?: number | null;
    billingFrequency?: string | null;
    quantity?: number | null;
    lineTotal?: number | null;
    grossTotal?: number | null;
  }>;
}): string {
  return hashContent({
    id: proposal.id,
    reference: proposal.reference,
    title: proposal.title,
    services: proposal.services.map((s) => ({
      name: s.name,
      displayPrice: s.displayPrice,
      billingFrequency: s.billingFrequency,
      quantity: s.quantity,
      lineTotal: s.lineTotal,
      grossTotal: s.grossTotal,
    })),
  });
}

export function hashTerms(terms: string | null | undefined): string {
  return crypto.createHash('sha256').update(terms || '').digest('hex');
}

/** Best-effort IP geolocation (no API key required). */
export async function lookupGeoFromIp(ip: string | null): Promise<string | null> {
  if (!ip) return null;
  const normalized = ip.replace(/^::ffff:/, '');
  if (normalized === '::1' || normalized.startsWith('127.') || normalized === 'localhost') {
    return 'Local development';
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(normalized)}?fields=status,city,regionName,country`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    const data = (await res.json()) as {
      status?: string;
      city?: string;
      regionName?: string;
      country?: string;
    };
    if (data.status === 'success') {
      const parts = [data.city, data.regionName, data.country].filter(Boolean);
      return parts.join(', ') || null;
    }
  } catch (err) {
    logger.debug('IP geolocation lookup failed', err);
  }
  return null;
}
