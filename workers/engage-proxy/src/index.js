/**
 * Routes capstonesoftware.co.uk/engage → Engage on Render (same-origin API + SPA).
 *
 * /engage/api/*  → engage-backend.onrender.com/api/*
 * /engage/assets/* → engage-frontend.onrender.com/assets/*
 * /engage/*      → engage-frontend SPA (index.html for client routes)
 */

const FRONTEND_UPSTREAM = 'https://engage-frontend-0g6u.onrender.com';
const BACKEND_UPSTREAM = 'https://engage-backend-e1ue.onrender.com';
const PREFIX = '/engage';

function stripPrefix(pathname) {
  if (pathname === PREFIX || pathname === `${PREFIX}/`) return '/';
  if (pathname.startsWith(`${PREFIX}/`)) return pathname.slice(PREFIX.length) || '/';
  return pathname;
}

function isAssetPath(pathname) {
  const stripped = stripPrefix(pathname);
  return (
    stripped.startsWith('/assets/') ||
    stripped === '/favicon.ico' ||
    stripped === '/robots.txt' ||
    stripped === '/manifest.webmanifest'
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

    if (pathname.startsWith(`${PREFIX}/api/`)) {
      const apiPath = stripPrefix(pathname);
      return proxyRequest(request, BACKEND_UPSTREAM, apiPath);
    }

    if (pathname.startsWith(`${PREFIX}/api`)) {
      return proxyRequest(request, BACKEND_UPSTREAM, '/api');
    }

    if (isAssetPath(pathname)) {
      return proxyRequest(request, FRONTEND_UPSTREAM, stripPrefix(pathname));
    }

    // SPA fallback — client-side routes under /engage/*
    if (request.method === 'GET' || request.method === 'HEAD') {
      return proxyRequest(request, FRONTEND_UPSTREAM, '/index.html');
    }

    return proxyRequest(request, FRONTEND_UPSTREAM, stripPrefix(pathname));
  },
};