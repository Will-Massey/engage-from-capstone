/**
 * First-touch URL params for practice signup.
 * Captured in this browser only, then sent once with the signup request.
 * Not shown on screen. A later visit does not replace the first one.
 */

export const FIRST_TOUCH_STORAGE_KEY = 'engage-first-touch';

export interface SignupAttribution {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrer?: string;
}

function clip(value: string | null | undefined, max: number): string | undefined {
  if (!value) return undefined;
  let cleaned = '';
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 31 || code === 127) continue;
    cleaned += char;
  }
  cleaned = cleaned.trim().slice(0, max);
  return cleaned || undefined;
}

export function externalReferrer(referrer: string, pageOrigin: string): string | undefined {
  const trimmed = clip(referrer, 500);
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    if (url.origin === pageOrigin) return undefined;
    return clip(url.href, 500);
  } catch {
    return undefined;
  }
}

/** Null means "do not write" — either nothing useful, or a first touch is already stored. */
export function nextFirstTouchRecord(
  existingRaw: string | null,
  search: string,
  referrer: string,
  pageOrigin: string
): SignupAttribution | null {
  if (existingRaw && existingRaw.trim()) return null;

  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const record: SignupAttribution = {};
  const utmSource = clip(params.get('utm_source'), 200);
  const utmMedium = clip(params.get('utm_medium'), 200);
  const utmCampaign = clip(params.get('utm_campaign'), 200);
  const ref = externalReferrer(referrer, pageOrigin);
  if (utmSource) record.utmSource = utmSource;
  if (utmMedium) record.utmMedium = utmMedium;
  if (utmCampaign) record.utmCampaign = utmCampaign;
  if (ref) record.referrer = ref;

  if (!record.utmSource && !record.utmMedium && !record.utmCampaign && !record.referrer) {
    return null;
  }
  return record;
}

export function captureFirstTouchAttribution(): void {
  if (typeof window === 'undefined') return;
  try {
    const next = nextFirstTouchRecord(
      window.localStorage.getItem(FIRST_TOUCH_STORAGE_KEY),
      window.location.search,
      document.referrer,
      window.location.origin
    );
    if (next) {
      window.localStorage.setItem(FIRST_TOUCH_STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // Private browsing can block storage. Signup still works.
  }
}

export function readFirstTouchAttribution(): SignupAttribution {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(FIRST_TOUCH_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SignupAttribution;
    return {
      utmSource: clip(parsed.utmSource, 200),
      utmMedium: clip(parsed.utmMedium, 200),
      utmCampaign: clip(parsed.utmCampaign, 200),
      referrer: clip(parsed.referrer, 500),
    };
  } catch {
    return {};
  }
}
