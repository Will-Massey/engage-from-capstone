import type { Request } from 'express';

/**
 * Native (Capacitor) client detection.
 *
 * Why this exists: production auth is cookie-based, and `cookieOptions()` in
 * authCookies.ts resolves `sameSite: 'lax'` (frontend and API share a host
 * behind the engage-proxy worker, so `crossSite` is false). A WKWebView served
 * from a `localhost`-family origin is cross-site to the API, so those cookies
 * are never sent. The iOS app therefore authenticates with a bearer token that
 * the login/refresh responses hand back in the body.
 *
 * SECURITY — why the gate is `Origin` and not the `X-Client` header alone:
 * `Origin` is a forbidden header name, so browser script cannot set it on
 * fetch or XHR; the user agent controls it. Without this gate, script injected
 * into the app origin could POST /auth/refresh (cookies ride along, same-site),
 * claim to be the iOS app, and read the long-lived refresh token out of the
 * response body — escalating a session-bound XSS into persistent account
 * access. Gating on Origin makes the branch unreachable from any browser
 * context: an injected script's requests always carry the app's own origin.
 *
 * `X-Client: ios` is required as an explicit second signal so the native
 * contract is opt-in rather than implied by an origin alone.
 *
 * The literal Origin `null` is the serialisation of an opaque origin, which is
 * what WKWebView sends for a custom-scheme document on OS versions where that
 * origin is not a tuple (WebKit bug 226760). Script on the real site cannot
 * choose that value: its requests carry `https://capstonesoftware.co.uk`. An
 * opaque iframe that does send `null` is a different site, so the production
 * SameSite=Lax session cookies are not attached, and the refresh-token-in-body
 * escalation this gate exists to prevent does not apply.
 */

/**
 * WebView origins Capacitor can serve the bundled SPA from.
 *
 * Verified on the simulator: the iOS shell reports `capacitor://localhost`
 * despite `iosScheme: 'https'` in capacitor.config.ts. `https://localhost` is
 * kept because that scheme setting can take effect on a future Capacitor
 * version or config change, and `ionic://localhost` covers the legacy scheme.
 */
const NATIVE_ORIGINS = new Set(['capacitor://localhost', 'ionic://localhost', 'https://localhost']);

/** Dev-only: `ionic serve` / simulator over plain http. */
const NATIVE_ORIGINS_DEV = new Set(['http://localhost']);

/**
 * Compare an Origin header to the Capacitor allowlist.
 *
 * WKWebView is not consistent about the bytes it sends. A custom-scheme
 * document is an opaque origin in the URL standard, and WebKit has shipped
 * that as the literal header `null` (bug 226760, and it has regressed on
 * later OS betas). The same allowlist also missed a capitalised scheme and a
 * trailing slash. None of those match an exact `capacitor://localhost` check,
 * so the preflight 500s and sign-in dies as a network error while curl with
 * the canonical origin succeeds.
 *
 * A missing Origin is not the same thing as the string "null" and stays rejected.
 */
export function canonicalNativeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '').toLowerCase();
}

/**
 * True for a Capacitor WebView origin, including the opaque `null` origin
 * WKWebView sends when the custom scheme has no tuple origin.
 *
 * This does not by itself authorise the native token contract — callers that
 * hand tokens back still require `X-Client: ios` (see `isNativeClient`).
 */
export function isNativeWebViewOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  const canonical = canonicalNativeOrigin(origin);
  // The opaque-origin serialisation. Lowercasing is safe: the spec value is
  // exactly `null`, and `NULL` is not a browser origin we need to refuse.
  if (canonical === 'null') return true;
  if (NATIVE_ORIGINS.has(canonical)) return true;
  return process.env.NODE_ENV !== 'production' && NATIVE_ORIGINS_DEV.has(canonical);
}

/**
 * True when the request comes from the Capacitor native shell and should use
 * bearer auth (tokens in the response body, no cookies set).
 */
export function isNativeClient(req: Request): boolean {
  const client = req.headers['x-client'];
  const declaresNative = typeof client === 'string' && client.trim().toLowerCase() === 'ios';
  return declaresNative && isNativeWebViewOrigin(headerOrigin(req.headers.origin));
}

function headerOrigin(origin: string | string[] | undefined): string | undefined {
  if (Array.isArray(origin)) return origin[0];
  return origin;
}

/**
 * True when a request is authenticated by bearer token rather than by the
 * ambient session cookie. CSRF defends against ambient credentials being
 * replayed by a foreign origin; an `Authorization` header is not ambient, so
 * these requests do not need (and cannot supply) a CSRF token.
 */
export function isNativeBearerRequest(req: Request): boolean {
  if (!isNativeClient(req)) return false;
  const authHeader = req.headers.authorization;
  return typeof authHeader === 'string' && authHeader.startsWith('Bearer ');
}
