import type { Request } from 'express';
import { isNativeClient, isNativeBearerRequest } from '../nativeClient.js';

function req(headers: Record<string, string | undefined>): Request {
  return { headers } as unknown as Request;
}

const NATIVE = { origin: 'https://localhost', 'x-client': 'ios' };

describe('nativeClient', () => {
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('isNativeClient', () => {
    it('accepts the Capacitor WebView origins with the native client header', () => {
      for (const origin of ['https://localhost', 'capacitor://localhost', 'ionic://localhost']) {
        expect(isNativeClient(req({ origin, 'x-client': 'ios' }))).toBe(true);
      }
    });

    it('is case- and whitespace-insensitive on the client header', () => {
      expect(isNativeClient(req({ origin: 'https://localhost', 'x-client': ' iOS ' }))).toBe(true);
    });

    // THE regression guard. Without the Origin gate, script injected into the
    // app origin could POST /auth/refresh (cookies ride along same-site), claim
    // to be the iOS app, and read the long-lived refresh token out of the body.
    // Origin is a forbidden header name, so browser script cannot forge it —
    // these are the origins an XSS payload would actually send.
    it('rejects browser origins even when they claim to be the native client', () => {
      const browserOrigins = [
        'https://capstonesoftware.co.uk',
        'https://www.capstonesoftware.co.uk',
        'https://engage.capstonesoftware.co.uk',
        'https://engage-frontend-0g6u.onrender.com',
        'https://evil.example.com',
        'https://localhost.evil.example.com',
        'https://notlocalhost',
      ];
      for (const origin of browserOrigins) {
        expect(isNativeClient(req({ origin, 'x-client': 'ios' }))).toBe(false);
      }
    });

    it('rejects a missing Origin (curl, server-to-server, same-origin GET)', () => {
      expect(isNativeClient(req({ 'x-client': 'ios' }))).toBe(false);
    });

    it('rejects a native origin without the explicit client header', () => {
      expect(isNativeClient(req({ origin: 'https://localhost' }))).toBe(false);
      expect(isNativeClient(req({ origin: 'https://localhost', 'x-client': 'web' }))).toBe(false);
    });

    it('allows plain-http localhost only outside production', () => {
      process.env.NODE_ENV = 'development';
      expect(isNativeClient(req({ origin: 'http://localhost', 'x-client': 'ios' }))).toBe(true);

      process.env.NODE_ENV = 'production';
      expect(isNativeClient(req({ origin: 'http://localhost', 'x-client': 'ios' }))).toBe(false);
    });
  });

  describe('isNativeBearerRequest', () => {
    it('requires both a native client and a bearer token', () => {
      expect(isNativeBearerRequest(req({ ...NATIVE, authorization: 'Bearer abc' }))).toBe(true);
    });

    it('rejects a native client with no bearer token (nothing to authenticate)', () => {
      expect(isNativeBearerRequest(req(NATIVE))).toBe(false);
    });

    it('rejects cookie-style auth dressed as a bearer request', () => {
      expect(isNativeBearerRequest(req({ ...NATIVE, authorization: 'Basic abc' }))).toBe(false);
    });

    // Guards the CSRF bypass: a browser origin must never skip CSRF, however it
    // labels itself or whatever token it presents.
    it('rejects a browser origin holding a bearer token', () => {
      expect(
        isNativeBearerRequest(
          req({
            origin: 'https://capstonesoftware.co.uk',
            'x-client': 'ios',
            authorization: 'Bearer abc',
          })
        )
      ).toBe(false);
    });
  });
});
