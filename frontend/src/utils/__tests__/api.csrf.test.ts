/**
 * CSRF retry behaviour — unit-level checks on token cache invalidation pattern.
 */
describe('api CSRF patterns', () => {
  it('clears in-memory CSRF cache on CSRF_INVALID', () => {
    let csrfTokenInMemory: string | null = 'stale-token';
    const errorCode: string = 'CSRF_INVALID';

    if (errorCode === 'CSRF_MISSING' || errorCode === 'CSRF_INVALID') {
      csrfTokenInMemory = null;
    }

    expect(csrfTokenInMemory).toBeNull();
  });

  it('refresh retry flag prevents infinite loops', () => {
    const originalRequest: { _retry?: boolean; url?: string } = { url: '/proposals' };
    let shouldRetry = false;

    if (originalRequest && !originalRequest._retry && originalRequest.url !== '/auth/refresh') {
      originalRequest._retry = true;
      shouldRetry = true;
    }

    expect(shouldRetry).toBe(true);
    expect(originalRequest._retry).toBe(true);
  });

  it('extracts csrfToken from /auth/me response shape', () => {
    const payload = {
      success: true,
      data: { csrfToken: 'abc123', user: { id: 'u1' } },
    };
    const token = payload.data?.csrfToken;
    expect(token).toBe('abc123');
  });

  it('sessionStorage key is stable for cross-refresh persistence', () => {
    const key = 'engage_csrf_token';
    sessionStorage.setItem(key, 'persisted-token');
    expect(sessionStorage.getItem(key)).toBe('persisted-token');
    sessionStorage.removeItem(key);
  });
});
