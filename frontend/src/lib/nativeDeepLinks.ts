/**
 * Native deep links for the Capacitor shells.
 *
 * Staff use the tab bar. Clients open the same app via a portal / sign /
 * letter URL. Production web URLs include `/engage`; the native Vite build
 * uses a relative base, so we always strip that prefix here rather than
 * trusting APP_BASENAME.
 */

export const NATIVE_DEEP_LINK_EVENT = 'engage:native-deep-link';
export const LAST_CLIENT_DEEP_LINK_KEY = 'engage.native.lastClientPath';

const PUBLIC_PREFIXES = [
  '/portal/',
  '/proposals/view/',
  '/letters/view/',
  '/onboarding/aml/',
] as const;

function stripEngagePrefix(pathname: string): string {
  let path = pathname || '/';
  if (!path.startsWith('/')) path = `/${path}`;
  if (path === '/engage' || path === '/engage/') return '/';
  if (path.startsWith('/engage/')) return path.slice('/engage'.length) || '/';
  return path;
}

function withSearchAndHash(path: string, search: string, hash: string): string {
  return `${path}${search || ''}${hash || ''}`;
}

function isClientFacingPath(pathOnly: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathOnly.startsWith(prefix) && pathOnly.length > prefix.length
  );
}

/** SPA path (`/portal/…`) or null if the URL is not a client-facing Engage link. */
export function parseNativeOpenUrl(raw: string): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  let pathOnly = '';
  let search = '';
  let hash = '';

  try {
    const url = new URL(trimmed);
    const scheme = url.protocol.replace(':', '').toLowerCase();
    search = url.search;
    hash = url.hash;

    if (scheme === 'http' || scheme === 'https') {
      pathOnly = stripEngagePrefix(url.pathname);
    } else {
      const host = (url.hostname || '').toLowerCase();
      const rest = url.pathname || '';
      if (!host || host === 'localhost' || host === 'engage') {
        pathOnly = rest.startsWith('/') ? rest : `/${rest}`;
      } else {
        pathOnly = `/${host}${rest === '/' ? '' : rest}`;
      }
      pathOnly = stripEngagePrefix(pathOnly);
    }
  } catch {
    if (trimmed.startsWith('/')) {
      const [base, query] = trimmed.split('?');
      const [pathname, fragment] = base.split('#');
      pathOnly = stripEngagePrefix(pathname);
      search = query ? `?${query.split('#')[0]}` : '';
      hash = fragment
        ? `#${fragment}`
        : trimmed.includes('#')
          ? `#${trimmed.split('#').slice(1).join('#')}`
          : '';
    } else {
      return null;
    }
  }

  if (!isClientFacingPath(pathOnly)) return null;
  return withSearchAndHash(pathOnly, search, hash);
}

export function rememberClientDeepLink(path: string): void {
  try {
    localStorage.setItem(LAST_CLIENT_DEEP_LINK_KEY, path);
  } catch {
    // Private mode / storage full — portal still opens this time
  }
}

export function lastClientDeepLink(): string | null {
  try {
    const stored = localStorage.getItem(LAST_CLIENT_DEEP_LINK_KEY);
    return stored &&
      parseNativeOpenUrl(stored.startsWith('/') ? stored : `https://example.invalid${stored}`)
      ? stored
      : stored && isClientFacingPath(stored.split('?')[0])
        ? stored
        : null;
  } catch {
    return null;
  }
}

let pendingDeepLink: string | null = null;

export function emitNativeDeepLink(path: string): void {
  pendingDeepLink = path;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(NATIVE_DEEP_LINK_EVENT, { detail: { path } }));
}

/**
 * Capacitor `appUrlOpen` / `getLaunchUrl` entry. Returns the SPA path when
 * the URL is a client portal, proposal, letter, or AML link; otherwise null
 * so a staff-tab launch is left alone.
 */
export function handleNativeOpenUrl(raw: string): string | null {
  const path = parseNativeOpenUrl(raw);
  if (!path) return null;
  rememberClientDeepLink(path);
  emitNativeDeepLink(path);
  return path;
}

export function consumePendingNativeDeepLink(): string | null {
  const path = pendingDeepLink;
  pendingDeepLink = null;
  return path;
}
