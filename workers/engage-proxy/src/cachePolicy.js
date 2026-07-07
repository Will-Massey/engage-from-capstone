/** @typedef {{ edge: boolean, cacheControl: string | null, normalizeToIndex?: boolean }} CachePolicy */

export const PREFIX = '/engage';
export const ASSET_MAX_AGE = 31_536_000;
export const INDEX_MAX_AGE = 60;

/**
 * Edge cache policy for worker-handled paths.
 * @param {string} pathname
 * @param {{ spaFallback?: boolean }} [opts]
 * @returns {CachePolicy}
 */
export function cachePolicyForPath(pathname, opts = {}) {
  if (pathname.startsWith(`${PREFIX}/assets/`)) {
    return {
      edge: true,
      cacheControl: `public, max-age=${ASSET_MAX_AGE}, immutable`,
    };
  }

  if (opts.spaFallback) {
    return {
      edge: true,
      cacheControl: `public, max-age=${INDEX_MAX_AGE}`,
      normalizeToIndex: true,
    };
  }

  return { edge: false, cacheControl: null };
}

/**
 * SPA shell routes all serve the same index.html — one cache entry is enough.
 * @param {Request} request
 * @returns {Request}
 */
export function spaIndexCacheKey(request) {
  const url = new URL(request.url);
  url.pathname = `${PREFIX}/index.html`;
  url.search = '';
  return new Request(url.toString(), { method: 'GET' });
}

/**
 * @param {Headers} headers
 * @param {string} cacheControl
 * @returns {Headers}
 */
export function withCacheControl(headers, cacheControl) {
  const out = new Headers(headers);
  out.delete('content-encoding');
  out.set('Cache-Control', cacheControl);
  return out;
}
