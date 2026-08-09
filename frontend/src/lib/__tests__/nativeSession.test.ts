import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const isNativeApp = vi.fn(() => true);
vi.mock('../native', () => ({ isNativeApp: () => isNativeApp() }));

const store = new Map<string, string>();
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: store.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => {
      store.set(key, value);
    },
    remove: async ({ key }: { key: string }) => {
      store.delete(key);
    },
  },
}));

import {
  __resetNativeSessionMemory,
  clearNativeSession,
  hydrateNativeSession,
  nativeAccessToken,
  nativeRefreshToken,
  persistNativeTokens,
  retryOnTransientFailure,
  saveNativeSession,
  tokensFromAuthResponse,
} from '../nativeSession';

const TOKENS = { accessToken: 'access-1', refreshToken: 'refresh-1' };

beforeEach(() => {
  store.clear();
  __resetNativeSessionMemory();
  isNativeApp.mockReturnValue(true);
  vi.useRealTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  isNativeApp.mockReturnValue(true);
});

describe('native token persistence', () => {
  it('survives a relaunch: saved tokens rehydrate into memory', async () => {
    await saveNativeSession(TOKENS);
    __resetNativeSessionMemory(); // simulate the app being killed and reopened
    expect(nativeAccessToken()).toBeNull();

    await hydrateNativeSession();
    expect(nativeAccessToken()).toBe('access-1');
    expect(nativeRefreshToken()).toBe('refresh-1');
  });

  it('hydrates to null when only one half of the pair is present', async () => {
    store.set('engage_native_access_token', 'orphan');
    await hydrateNativeSession();
    expect(nativeAccessToken()).toBeNull();
  });

  it('clears both tokens on logout', async () => {
    await saveNativeSession(TOKENS);
    await clearNativeSession();
    expect(nativeAccessToken()).toBeNull();
    expect(store.size).toBe(0);
  });

  it('stores nothing on web, where cookies hold the session', async () => {
    isNativeApp.mockReturnValue(false);
    await saveNativeSession(TOKENS);
    expect(store.size).toBe(0);
    expect(nativeAccessToken()).toBeNull();
  });
});

describe('tokensFromAuthResponse', () => {
  it('extracts a complete pair on native', () => {
    expect(tokensFromAuthResponse({ ...TOKENS, csrfToken: 'x' })).toEqual(TOKENS);
  });

  it('ignores a web login response, which carries no tokens', () => {
    expect(tokensFromAuthResponse({ csrfToken: 'x', user: {} })).toBeNull();
  });

  it('ignores a partial or malformed pair', () => {
    expect(tokensFromAuthResponse({ accessToken: 'a' })).toBeNull();
    expect(tokensFromAuthResponse({ accessToken: 1, refreshToken: 2 })).toBeNull();
    expect(tokensFromAuthResponse(null)).toBeNull();
  });

  it('never stores tokens when running on web', () => {
    isNativeApp.mockReturnValue(false);
    expect(tokensFromAuthResponse(TOKENS)).toBeNull();
  });

  it('persistNativeTokens is a no-op for a response without tokens', async () => {
    await persistNativeTokens({ csrfToken: 'x' });
    expect(store.size).toBe(0);
  });
});

describe('retryOnTransientFailure', () => {
  // The bug this guards: launching against a cold-starting Render API used to
  // read as a rejected session, signing the user out and wiping their tokens.
  it('retries a network failure and succeeds', async () => {
    const call = vi
      .fn()
      .mockRejectedValueOnce({ code: 'NETWORK_ERROR' })
      .mockRejectedValueOnce({ code: 'TIMEOUT' })
      .mockResolvedValue({ success: true });

    await expect(retryOnTransientFailure(call, 3, 0)).resolves.toEqual({ success: true });
    expect(call).toHaveBeenCalledTimes(3);
  });

  it('retries a 5xx, which is the server failing rather than answering', async () => {
    const call = vi.fn().mockRejectedValueOnce({ status: 503 }).mockResolvedValue('ok');
    await expect(retryOnTransientFailure(call, 3, 0)).resolves.toBe('ok');
  });

  it('does NOT retry an auth rejection — that is a real answer', async () => {
    const call = vi.fn().mockRejectedValue({ code: 'UNAUTHORIZED', status: 401 });
    await expect(retryOnTransientFailure(call, 3, 0)).rejects.toMatchObject({ status: 401 });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('gives up after the attempt budget and rethrows', async () => {
    const call = vi.fn().mockRejectedValue({ code: 'NETWORK_ERROR' });
    await expect(retryOnTransientFailure(call, 2, 0)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
    expect(call).toHaveBeenCalledTimes(2);
  });
});
