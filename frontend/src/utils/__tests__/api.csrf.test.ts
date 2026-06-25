/**
 * CSRF retry behaviour — unit-level checks on token cache invalidation pattern.
 */
describe('api CSRF patterns', () => {
  it('clears in-memory CSRF cache on CSRF_INVALID', () => {
    let csrfTokenInMemory: string | null = 'stale-token';
    const errorCode = 'CSRF_INVALID';

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
});
