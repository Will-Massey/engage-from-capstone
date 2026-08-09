import { describe, it, expect } from 'vitest';
import { apiConnectSource } from '../injectBuildTime';

/**
 * A CSP source expression with a path matches that path *exactly* unless it
 * ends in "/". Listing `https://capstonesoftware.co.uk/engage` therefore
 * permitted exactly one URL and blocked `/engage/api/...` — i.e. every request
 * the app makes.
 *
 * The web build never noticed, because the SPA is served from the same host and
 * `'self'` covers it. The iOS shell runs at `capacitor://localhost`, so the API
 * is cross-origin and must match a listed source. It did not, and WebKit
 * blocked sign-in before it reached the network while curl against the same
 * endpoint returned 200 — which is exactly how the bug hid.
 */
describe('CSP connect-src source for the API', () => {
  it('is an origin, carrying no path', () => {
    expect(apiConnectSource('https://capstonesoftware.co.uk/engage')).toBe(
      'https://capstonesoftware.co.uk'
    );
  });

  it('strips a path however deep, so nested API routes stay allowed', () => {
    expect(apiConnectSource('https://capstonesoftware.co.uk/engage/api')).toBe(
      'https://capstonesoftware.co.uk'
    );
    expect(apiConnectSource('https://capstonesoftware.co.uk/engage/')).toBe(
      'https://capstonesoftware.co.uk'
    );
  });

  it('keeps the port, which is part of the origin', () => {
    expect(apiConnectSource('http://localhost:3101')).toBe('http://localhost:3101');
    expect(apiConnectSource('http://localhost:3101/engage')).toBe('http://localhost:3101');
  });

  it('falls back to production when nothing is configured', () => {
    expect(apiConnectSource(undefined)).toBe('https://capstonesoftware.co.uk');
    expect(apiConnectSource('')).toBe('https://capstonesoftware.co.uk');
  });

  it('contributes nothing for a same-origin relative API path', () => {
    // 'self' already covers it; emitting a bare path would be an invalid source.
    expect(apiConnectSource('/engage')).toBe('');
  });

  it('never emits a source containing a path segment', () => {
    for (const url of [
      'https://capstonesoftware.co.uk/engage',
      'https://engage.capstonesoftware.co.uk/engage/api/',
      'http://127.0.0.1:3099/deep/path',
    ]) {
      const source = apiConnectSource(url);
      expect(source.replace(/^https?:\/\//, '')).not.toContain('/');
    }
  });
});
