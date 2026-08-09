/**
 * Routes capstonesoftware.co.uk/engage → Engage on Render (same-origin API + SPA).
 *
 * /engage/api/*   → engage-backend.onrender.com/api/*
 * /engage/ping    → engage-backend.onrender.com/ping
 * /engage/assets/*, /engage/images/* → engage-frontend (nested under /engage on Render)
 * /engage/*       → engage-frontend SPA (index.html for client routes)
 *
 * Edge cache: hashed /engage/assets/* (immutable) + SPA index.html shell (60s).
 */

import { cachePolicyForPath, spaIndexCacheKey, withCacheControl } from './cachePolicy.js';

const FRONTEND_UPSTREAM = 'https://engage-frontend-0g6u.onrender.com';
const BACKEND_UPSTREAM = 'https://engage-backend-e1ue.onrender.com';
const PREFIX = '/engage';

/**
 * Security headers for the public SPA + its assets. The React app is otherwise
 * served with no CSP/anti-framing headers, so the public proposal/sign pages are
 * clickjackable. These are applied to the client-facing (frontend) responses only,
 * never to the API proxy path.
 *
 * CSP notes:
 *  - script-src is locked to 'self' + the hash of the inline theme-flash bootstrap
 *    in index.html (keeps a static inline script working without 'unsafe-inline')
 *    + Stripe.js. No 'unsafe-eval'.
 *  - style-src keeps 'unsafe-inline' (React inline styles + Tailwind) and Google Fonts.
 *  - connect/frame-src allow Stripe so the payment Elements keep working.
 *  - If the inline bootstrap script in index.html changes, regenerate the sha256.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  // Second hash: the marketing page's inline html.js bootstrap
  // (document.documentElement.classList.add('js')) — regenerate if it changes.
  "script-src 'self' 'sha256-3aDszuIcW79BhSuAMQ1r/1XG8+STG20nI13wmXCOXxY=' 'sha256-Du+OJKJSbdUgz5nrHeWWINvez6XKDDU/tyj/5c2uvwo=' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://api.stripe.com",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

/** Return a copy of the response with SPA security headers applied. */
function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * True when the request carries an Engage session cookie (accessToken or
 * refreshToken, both httpOnly on path /). Logged-in users hitting the bare
 * /engage/ root must reach the SPA dashboard, not the marketing page.
 */
export function hasSessionCookie(cookieHeader) {
  return /(?:^|;\s*)(accessToken|refreshToken)=[^;]/.test(cookieHeader || '');
}

/**
 * True when this request should be answered with the static marketing page:
 * a GET/HEAD for exactly the /engage/ root with no session cookie.
 */
export function isMarketingRoot(pathname, method, cookieHeader) {
  return (
    pathname === `${PREFIX}/` &&
    (method === 'GET' || method === 'HEAD') &&
    !hasSessionCookie(cookieHeader)
  );
}

function stripPrefix(pathname) {
  if (pathname === PREFIX || pathname === `${PREFIX}/`) return '/';
  if (pathname.startsWith(`${PREFIX}/`)) return pathname.slice(PREFIX.length) || '/';
  return pathname;
}

function isStaticAsset(pathname) {
  return (
    pathname.startsWith(`${PREFIX}/assets/`) ||
    pathname.startsWith(`${PREFIX}/images/`) ||
    pathname === `${PREFIX}/favicon.ico` ||
    pathname === `${PREFIX}/robots.txt` ||
    pathname === `${PREFIX}/manifest.webmanifest`
  );
}

async function proxyRequest(request, upstreamBase, upstreamPath) {
  const incoming = new URL(request.url);
  const target = new URL(upstreamPath + incoming.search, upstreamBase);

  const headers = new Headers(request.headers);
  headers.set('Host', new URL(upstreamBase).host);
  headers.set('X-Forwarded-Host', incoming.host);
  headers.set('X-Forwarded-Proto', incoming.protocol.replace(':', ''));
  headers.set('X-Forwarded-Prefix', PREFIX);

  const init = {
    method: request.method,
    headers,
    redirect: 'manual',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
  }

  const response = await fetch(target.toString(), init);
  const out = new Headers(response.headers);
  out.delete('content-encoding');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: out,
  });
}

/**
 * @param {Request} request
 * @param {ExecutionContext} ctx
 * @param {() => Promise<Response>} fetchUpstream
 * @param {{ cacheControl: string, cacheKey?: Request }} policy
 */
async function serveCached(request, ctx, fetchUpstream, policy) {
  const cache = caches.default;
  const cacheKey = policy.cacheKey ?? request;

  if (request.method === 'GET') {
    const hit = await cache.match(cacheKey);
    if (hit) {
      const headers = new Headers(hit.headers);
      headers.set('X-Engage-Cache', 'HIT');
      for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
        headers.set(key, value);
      }
      return new Response(hit.body, { status: hit.status, headers });
    }
  }

  const upstream = await fetchUpstream();
  const headers = withCacheControl(upstream.headers, policy.cacheControl);
  headers.set('X-Engage-Cache', 'MISS');
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }

  const response = new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });

  if (request.method === 'GET' && upstream.ok) {
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  }

  return response;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (!pathname.startsWith(PREFIX)) {
      return new Response('Not found', { status: 404 });
    }

    if (pathname === PREFIX) {
      return Response.redirect(`${url.origin}${PREFIX}/`, 301);
    }

    if (pathname === `${PREFIX}/ping` || pathname === `${PREFIX}/health`) {
      return proxyRequest(request, BACKEND_UPSTREAM, pathname.slice(PREFIX.length));
    }

    if (pathname.startsWith(`${PREFIX}/api/`)) {
      return proxyRequest(request, BACKEND_UPSTREAM, stripPrefix(pathname));
    }

    if (pathname.startsWith(`${PREFIX}/api`)) {
      return proxyRequest(request, BACKEND_UPSTREAM, '/api');
    }

    // Marketing page assets (never under /engage/assets/ — that path is the SPA's).
    if (pathname.startsWith(`${PREFIX}/site/`) && env.ASSETS) {
      const assetResp = await env.ASSETS.fetch(request);
      if (assetResp.ok) {
        const headers = new Headers(assetResp.headers);
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
          headers.set(key, value);
        }
        return new Response(assetResp.body, { status: assetResp.status, headers });
      }
    }

    // Anonymous visitors at the bare root get the marketing page; a session
    // cookie means the SPA dashboard lives here, so fall through to the SPA.
    // Deliberately NOT edge-cached: the response is cookie-dependent.
    if (isMarketingRoot(pathname, request.method, request.headers.get('Cookie')) && env.ASSETS) {
      const assetResp = await env.ASSETS.fetch(new URL(`${PREFIX}/index.html`, url.origin));
      if (assetResp.ok) {
        const headers = new Headers(assetResp.headers);
        headers.set('Cache-Control', 'no-cache');
        headers.set('X-Engage-Variant', 'marketing');
        for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
          headers.set(key, value);
        }
        return new Response(assetResp.body, { status: assetResp.status, headers });
      }
    }

    const assetPolicy = cachePolicyForPath(pathname);
    if (assetPolicy.edge && pathname.startsWith(`${PREFIX}/assets/`)) {
      return serveCached(request, ctx, () => proxyRequest(request, FRONTEND_UPSTREAM, pathname), {
        cacheControl: assetPolicy.cacheControl,
      });
    }

    // Render static publish nests assets under /engage/ — preserve full path
    if (isStaticAsset(pathname)) {
      return withSecurityHeaders(await proxyRequest(request, FRONTEND_UPSTREAM, pathname));
    }

    // SPA fallback — nested /engage/index.html on Cloudflare Pages
    if (request.method === 'GET' || request.method === 'HEAD') {
      const spaPolicy = cachePolicyForPath(pathname, { spaFallback: true });
      if (spaPolicy.edge && request.method === 'GET') {
        return serveCached(
          request,
          ctx,
          () => proxyRequest(request, FRONTEND_UPSTREAM, `${PREFIX}/index.html` + url.search),
          {
            cacheControl: spaPolicy.cacheControl,
            cacheKey: spaIndexCacheKey(request),
          }
        );
      }

      const upstream = await proxyRequest(
        request,
        FRONTEND_UPSTREAM,
        `${PREFIX}/index.html` + url.search
      );
      if (spaPolicy.cacheControl) {
        const headers = withCacheControl(upstream.headers, spaPolicy.cacheControl);
        for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
          headers.set(key, value);
        }
        return new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers,
        });
      }
      return withSecurityHeaders(upstream);
    }

    return withSecurityHeaders(
      await proxyRequest(request, FRONTEND_UPSTREAM, stripPrefix(pathname))
    );
  },
};
