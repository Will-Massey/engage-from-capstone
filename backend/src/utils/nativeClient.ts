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

function isNativeOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  if (NATIVE_ORIGINS.has(origin)) return true;
  return process.env.NODE_ENV !== 'production' && NATIVE_ORIGINS_DEV.has(origin);
}

/**
 * True when the request comes from the Capacitor native shell and should use
 * bearer auth (tokens in the response body, no cookies set).
 */
export function isNativeClient(req: Request): boolean {
  const client = req.headers['x-client'];
  const declaresNative = typeof client === 'string' && client.trim().toLowerCase() === 'ios';
  return declaresNative && isNativeOrigin(req.headers.origin);
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
