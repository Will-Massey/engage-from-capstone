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
      return new Response(hit.body, { status: hit.status, headers });
    }
  }

  const upstream = await fetchUpstream();
  const headers = withCacheControl(upstream.headers, policy.cacheControl);
  headers.set('X-Engage-Cache', 'MISS');

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
  async fetch(request, _env, ctx) {
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

    const assetPolicy = cachePolicyForPath(pathname);
    if (assetPolicy.edge && pathname.startsWith(`${PREFIX}/assets/`)) {
      return serveCached(request, ctx, () => proxyRequest(request, FRONTEND_UPSTREAM, pathname), {
        cacheControl: assetPolicy.cacheControl,
      });
    }

    // Render static publish nests assets under /engage/ — preserve full path
    if (isStaticAsset(pathname)) {
      return proxyRequest(request, FRONTEND_UPSTREAM, pathname);
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
        return new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers,
        });
      }
      return upstream;
    }

    return proxyRequest(request, FRONTEND_UPSTREAM, stripPrefix(pathname));
  },
};
