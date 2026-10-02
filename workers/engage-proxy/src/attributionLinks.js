/**
 * First-touch campaign params for practice signup.
 * The marketing page at /engage/ is static HTML. Register links on it do not
 * include the query the visitor arrived with, and links from the apex site
 * often leave the campaign on the previous URL. Copy utm_source, utm_medium
 * and utm_campaign onto /engage/register. Values are kept as given
 * (utm_source=chatgpt.com stays chatgpt.com). A later visit must not replace
 * params already present on a link.
 */

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'];

function clip(value) {
  if (!value) return '';
  let cleaned = '';
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 31 || code === 127) continue;
    cleaned += char;
  }
  return cleaned.trim().slice(0, 200);
}

function isCapstoneHost(hostname) {
  const host = String(hostname || '')
    .toLowerCase()
    .replace(/\.$/, '');
  return host === 'capstonesoftware.co.uk' || host === 'www.capstonesoftware.co.uk';
}

function utmParams(search) {
  const raw = search && search.startsWith('?') ? search.slice(1) : search || '';
  const params = new URLSearchParams(raw);
  const out = new URLSearchParams();
  for (const key of UTM_KEYS) {
    const value = clip(params.get(key));
    if (value) out.set(key, value);
  }
  return out;
}

/**
 * Page query wins. Missing keys are filled from a capstonesoftware.co.uk referrer.
 * @param {string} pageSearch
 * @param {string | null | undefined} referrer
 * @returns {string} leading '?' or ''
 */
export function firstTouchSearch(pageSearch, referrer) {
  const page = utmParams(pageSearch);
  let fromReferrer = new URLSearchParams();
  if (referrer) {
    try {
      const url = new URL(referrer);
      if (isCapstoneHost(url.hostname)) fromReferrer = utmParams(url.search);
    } catch {
      fromReferrer = new URLSearchParams();
    }
  }

  const out = new URLSearchParams();
  for (const key of UTM_KEYS) {
    const value = page.get(key) || fromReferrer.get(key);
    if (value) out.set(key, value);
  }
  const serialised = out.toString();
  return serialised ? `?${serialised}` : '';
}

/**
 * @param {string} html
 * @param {string} attributionSearch leading '?' or ''
 * @returns {string}
 */
export function rewriteEngageRegisterLinks(html, attributionSearch) {
  const incoming = utmParams(attributionSearch);
  if ([...incoming.keys()].length === 0) return html;

  return html.replace(
    /href="((?:https:\/\/capstonesoftware\.co\.uk)?\/engage\/register)(\?[^"]*)?"/g,
    (_match, base, existingQuery = '') => {
      const params = utmParams(existingQuery);
      // Keep any non-utm query that was already on the link.
      const existing = new URLSearchParams(
        existingQuery.startsWith('?') ? existingQuery.slice(1) : existingQuery
      );
      for (const [key, value] of existing.entries()) {
        if (!UTM_KEYS.includes(key) && !params.has(key)) params.append(key, value);
      }
      for (const key of UTM_KEYS) {
        if (!params.get(key) && incoming.get(key)) params.set(key, incoming.get(key));
      }
      const serialised = params.toString();
      return `href="${base}${serialised ? `?${serialised}` : ''}"`;
    }
  );
}
