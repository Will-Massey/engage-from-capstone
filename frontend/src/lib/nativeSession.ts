import { isNativeApp } from './native';

/**
 * Token store for the Capacitor shell.
 *
 * The web app authenticates with httpOnly cookies, but `cookieOptions()` on the
 * backend resolves `sameSite: 'lax'` in production (frontend and API share a
 * host behind the engage-proxy worker). The WKWebView is served from
 * `capacitor://localhost`, which is cross-site to the API, so those cookies are
 * never sent. Native therefore uses bearer auth: `/auth/login` and
 * `/auth/refresh` return the token pair in the body when the request carries
 * `X-Client: ios` from a native origin, and we hold them here.
 *
 * Persistence uses Capacitor Preferences (backed by UserDefaults on iOS) so a
 * relaunch does not log the user out. A short-lived access token plus a
 * rotating refresh token is the same shape the web session uses; the refresh
 * token is single-use and revoked server-side on rotation.
 *
 * `memory` mirrors the persisted pair so the axios request interceptor can read
 * the access token synchronously. `hydrateNativeSession()` fills it at boot.
 */

const ACCESS_KEY = 'engage_native_access_token';
const REFRESH_KEY = 'engage_native_refresh_token';

export interface NativeTokens {
  accessToken: string;
  refreshToken: string;
}

let memory: NativeTokens | null = null;

/**
 * Load the Preferences plugin, wrapped in a plain object.
 *
 * The wrapper is load-bearing. A Capacitor plugin is a Proxy that answers every
 * property access with a callable — including `then`. Returning one directly
 * from an async function makes the runtime treat it as a thenable and call
 * `Preferences.then(resolve, reject)`; Capacitor forwards that to a native
 * method named "then", which does not exist. The call rejects with
 * UNIMPLEMENTED without ever invoking `resolve` or `reject`, so the awaiting
 * promise never settles and the app hangs on its loading spinner forever.
 * Caught on the simulator; do not "simplify" this back to `return Preferences`.
 */
async function preferences() {
  const { Preferences } = await import('@capacitor/preferences');
  return { plugin: Preferences };
}

/** Access token for the current native session, or null. Synchronous by design. */
export function nativeAccessToken(): string | null {
  return memory?.accessToken ?? null;
}

/** Refresh token for the current native session, or null. */
export function nativeRefreshToken(): string | null {
  return memory?.refreshToken ?? null;
}

let hydration: Promise<NativeTokens | null> | null = null;

/**
 * Resolves once persisted tokens are in memory. Everything that makes an
 * authenticated request at startup must await this, or the first call goes out
 * without a bearer, 401s, and bounces the user to the login screen on a session
 * that was actually valid.
 */
export function nativeSessionReady(): Promise<NativeTokens | null> {
  if (!hydration) hydration = hydrateNativeSession();
  return hydration;
}

/** Load persisted tokens into memory. Call once during app bootstrap. */
export async function hydrateNativeSession(): Promise<NativeTokens | null> {
  if (!isNativeApp()) return null;
  try {
    const { plugin: Preferences } = await preferences();
    const [{ value: accessToken }, { value: refreshToken }] = await Promise.all([
      Preferences.get({ key: ACCESS_KEY }),
      Preferences.get({ key: REFRESH_KEY }),
    ]);
    memory = accessToken && refreshToken ? { accessToken, refreshToken } : null;
    return memory;
  } catch {
    memory = null;
    return null;
  }
}

/** Persist a freshly issued token pair (login, 2FA login, or refresh rotation). */
export async function saveNativeSession(tokens: NativeTokens): Promise<void> {
  if (!isNativeApp()) return;
  memory = tokens;
  try {
    const { plugin: Preferences } = await preferences();
    await Promise.all([
      Preferences.set({ key: ACCESS_KEY, value: tokens.accessToken }),
      Preferences.set({ key: REFRESH_KEY, value: tokens.refreshToken }),
    ]);
  } catch {
    // Memory copy still serves this session; the user re-authenticates next launch.
  }
}

/** Drop the native session (logout, or a refresh token the server rejected). */
export async function clearNativeSession(): Promise<void> {
  memory = null;
  if (!isNativeApp()) return;
  try {
    const { plugin: Preferences } = await preferences();
    await Promise.all([
      Preferences.remove({ key: ACCESS_KEY }),
      Preferences.remove({ key: REFRESH_KEY }),
    ]);
  } catch {
    // ignore — memory is already cleared
  }
}

/**
 * Pull a token pair out of an auth response when running native. Returns null
 * on web, where the same endpoints set cookies and return no tokens.
 */
export function tokensFromAuthResponse(data: unknown): NativeTokens | null {
  if (!isNativeApp() || !data || typeof data !== 'object') return null;
  const { accessToken, refreshToken } = data as Partial<NativeTokens>;
  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') return null;
  return { accessToken, refreshToken };
}

/**
 * Store the token pair from a successful login/2FA response. No-op on web,
 * where the response carries no tokens and cookies already hold the session.
 */
export async function persistNativeTokens(data: unknown): Promise<void> {
  const tokens = tokensFromAuthResponse(data);
  if (tokens) await saveNativeSession(tokens);
}

/** Transient (non-auth) API failures — worth retrying, never a reason to log out. */
const TRANSIENT_CODES = new Set(['NETWORK_ERROR', 'TIMEOUT', 'UNKNOWN_ERROR']);

function isTransientFailure(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const { code, status } = err as { code?: string; status?: number };
  // A rejection carrying an HTTP status came from the server and is an answer,
  // not a connectivity problem.
  if (typeof status === 'number') return status >= 500;
  return typeof code === 'string' && TRANSIENT_CODES.has(code);
}

/**
 * Run an API call, retrying transient failures with backoff. Used for the
 * launch session check, where a cold-starting API must not read as a rejection.
 */
export async function retryOnTransientFailure<T>(
  call: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 1500
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await call();
    } catch (err) {
      lastError = err;
      if (!isTransientFailure(err) || attempt === attempts - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (attempt + 1)));
    }
  }
  throw lastError;
}

/** Test seam — reset the in-memory mirror. */
export function __resetNativeSessionMemory(): void {
  memory = null;
}
