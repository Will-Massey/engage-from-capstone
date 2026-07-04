/**
 * Routes capstonesoftware.co.uk/engage → Engage on Render (same-origin API + SPA).
 *
 * /engage/api/*   → engage-backend.onrender.com/api/*
 * /engage/ping    → engage-backend.onrender.com/ping
 * /engage/assets/*, /engage/images/* → engage-frontend (nested under /engage on Render)
 * /engage/*       → engage-frontend SPA (index.html for client routes)
 */

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

export default {
  async fetch(request) {
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

    // Render static publish nests assets under /engage/ — preserve full path
    if (isStaticAsset(pathname)) {
      return proxyRequest(request, FRONTEND_UPSTREAM, pathname);
    }

    // SPA fallback — nested /engage/index.html on Cloudflare Pages
    if (request.method === 'GET' || request.method === 'HEAD') {
      return proxyRequest(request, FRONTEND_UPSTREAM, `${PREFIX}/index.html` + url.search);
    }

    return proxyRequest(request, FRONTEND_UPSTREAM, stripPrefix(pathname));
  },
};