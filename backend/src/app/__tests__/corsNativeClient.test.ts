import express from 'express';
import request from 'supertest';
import { applyCors } from '../corsOptions.js';

/**
 * The iOS shell sends `X-Client: ios` on every request. A custom header makes
 * the request non-simple, so WKWebView issues a CORS preflight first — and if
 * the preflight response omits the header, every API call from the app fails as
 * an opaque network error before it reaches a route.
 *
 * That is exactly what happened on the simulator: login sat behind three failed
 * GETs to /api/auth/me while the server itself was answering curl perfectly.
 * These tests pin the preflight contract the app depends on.
 */
function appWithCors() {
  const app = express();
  applyCors(app);
  app.get('/api/auth/me', (_req, res) => res.json({ ok: true }));
  return app;
}

const NATIVE_ORIGINS = ['capacitor://localhost', 'https://localhost'];

// Origins other than the canonical capacitor://localhost that a WebView can
// send. Each one 500'd the preflight in production (no Allow-Origin), which
// WKWebView surfaces as a network error on the sign-in button. `null` is the
// opaque-origin serialisation (WebKit bug 226760).
const DEVICE_ORIGINS = ['null', 'Capacitor://localhost', 'capacitor://localhost/'];

describe('CORS for the Capacitor iOS shell', () => {
  it.each(NATIVE_ORIGINS)('allows X-Client on preflight from %s', async (origin) => {
    const res = await request(appWithCors())
      .options('/api/auth/me')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'x-client,authorization');

    expect(res.status).toBeLessThan(300);
    expect(res.headers['access-control-allow-origin']).toBe(origin);

    const allowed = (res.headers['access-control-allow-headers'] || '').toLowerCase();
    expect(allowed).toContain('x-client');
    expect(allowed).toContain('authorization');
  });

  it.each(NATIVE_ORIGINS)('allows the actual request from %s', async (origin) => {
    const res = await request(appWithCors())
      .get('/api/auth/me')
      .set('Origin', origin)
      .set('X-Client', 'ios');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(origin);
  });

  it.each(DEVICE_ORIGINS)('allows preflight from the device origin %s', async (origin) => {
    const res = await request(appWithCors())
      .options('/api/auth/me')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'x-client,content-type');

    expect(res.status).toBeLessThan(300);
    // Must echo the request's own Origin bytes. A browser compares them
    // exactly, and the opaque origin is only satisfied by the string "null".
    expect(res.headers['access-control-allow-origin']).toBe(origin);
    const allowed = (res.headers['access-control-allow-headers'] || '').toLowerCase();
    expect(allowed).toContain('x-client');
  });

  it('still rejects an unrelated origin', async () => {
    const res = await request(appWithCors())
      .get('/api/auth/me')
      .set('Origin', 'https://evil.example.com')
      .set('X-Client', 'ios');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
