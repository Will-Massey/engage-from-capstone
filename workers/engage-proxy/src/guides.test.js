import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { isGuideRequest, rewriteGuideRedirect } from './index.js';

const PAGES = 'https://capstone-site-1i5.pages.dev';
const FRONTEND = 'https://engage-frontend-0g6u.onrender.com';
const BACKEND = 'https://engage-backend-e1ue.onrender.com';
const GUIDE_PATH = '/engage/guides/mtd-engagement-letters-and-fixed-fees/';
const GUIDE_HTML = '<title>MTD engagement letters and fixed fees | Engage</title>';
const SPA_HTML = '<div id="root">engage-spa-shell</div>';
const APEX = 'https://capstonesoftware.co.uk';
const WWW = 'https://www.capstonesoftware.co.uk';

function installCache() {
  const previous = globalThis.caches;
  globalThis.caches = {
    default: {
      async match() {
        return undefined;
      },
      async put() {},
    },
  };
  return () => {
    globalThis.caches = previous;
  };
}

function installFetch(pagesFor) {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    const headers = init?.headers instanceof Headers ? init.headers : new Headers(init?.headers);
    calls.push({
      url,
      method: init?.method,
      redirect: init?.redirect,
      cache: init?.cache,
      host: headers.get('host'),
      cookie: headers.get('cookie'),
      authorization: headers.get('authorization'),
    });
    if (url.startsWith(PAGES)) return pagesFor(url);
    if (url.startsWith(FRONTEND)) {
      return new Response(SPA_HTML, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    if (url.startsWith(BACKEND)) {
      return new Response('{"status":"ok"}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(`unexpected ${url}`, { status: 599 });
  };
  return {
    calls,
    restore() {
      globalThis.fetch = previous;
    },
  };
}

function pagesResponse({ status = 200, body = GUIDE_HTML, location, headers = {} } = {}) {
  const out = new Headers(headers);
  if (!out.has('content-type')) out.set('content-type', 'text/html; charset=utf-8');
  if (location) out.set('location', location);
  if (status === 301 || status === 302 || status === 303 || status === 307 || status === 308) {
    return new Response(null, { status, headers: out });
  }
  return new Response(body, { status, headers: out });
}

function assetsEnv() {
  return {
    ASSETS: {
      async fetch(request) {
        const href = request instanceof URL ? request.href : String(request.url ?? request);
        if (href.includes('/engage/site/')) {
          return new Response('site-asset', {
            status: 200,
            headers: { 'content-type': 'application/javascript' },
          });
        }
        if (href.endsWith('/engage/index.html')) {
          return new Response('<html>marketing-page</html>', {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          });
        }
        return new Response('missing', { status: 404 });
      },
    },
  };
}

const ctx = { waitUntil() {} };

/**
 * @param {(url: string) => Response} pagesFor
 * @param {(calls: { url: string }[], env: object) => Promise<void>} run
 */
async function withUpstream(pagesFor, run) {
  const restoreCache = installCache();
  const upstream = installFetch(pagesFor);
  try {
    await run(upstream.calls, assetsEnv());
  } finally {
    upstream.restore();
    restoreCache();
  }
}

test('isGuideRequest matches the guides index and its children only', () => {
  assert.equal(isGuideRequest('/engage/guides', 'GET'), true);
  assert.equal(isGuideRequest('/engage/guides/', 'HEAD'), true);
  assert.equal(isGuideRequest(GUIDE_PATH, 'GET'), true);
  assert.equal(isGuideRequest('/engage/guides', 'POST'), false);
  assert.equal(isGuideRequest('/engage/guideship', 'GET'), false);
  assert.equal(isGuideRequest('/engage/', 'GET'), false);
  assert.equal(isGuideRequest('/engage/site/inline-1.js', 'GET'), false);
  assert.equal(isGuideRequest('/engage/register', 'GET'), false);
  assert.equal(isGuideRequest('/engage/login', 'GET'), false);
  assert.equal(isGuideRequest('/engage/api/proposals', 'GET'), false);
});

test('rewriteGuideRedirect keeps the visitor host and leaves other hosts', () => {
  const wwwRequest = `${WWW}/engage/guides/mtd-engagement-letters-and-fixed-fees`;
  const apexRequest = `${APEX}/engage/guides/mtd-engagement-letters-and-fixed-fees`;
  const slashed = '/engage/guides/mtd-engagement-letters-and-fixed-fees/';

  assert.equal(
    rewriteGuideRedirect(slashed, wwwRequest),
    `${WWW}/engage/guides/mtd-engagement-letters-and-fixed-fees/`
  );
  assert.equal(
    rewriteGuideRedirect(`${PAGES}${slashed}`, wwwRequest),
    `${WWW}/engage/guides/mtd-engagement-letters-and-fixed-fees/`
  );
  assert.equal(
    rewriteGuideRedirect(`${APEX}${slashed}?utm=linkedin`, wwwRequest),
    `${WWW}/engage/guides/mtd-engagement-letters-and-fixed-fees/?utm=linkedin`
  );
  assert.equal(
    rewriteGuideRedirect(`${WWW}${slashed}`, apexRequest),
    `${APEX}/engage/guides/mtd-engagement-letters-and-fixed-fees/`
  );
  assert.equal(
    rewriteGuideRedirect('https://example.com/leave', wwwRequest),
    'https://example.com/leave'
  );
  assert.equal(rewriteGuideRedirect(null, wwwRequest), null);
});

test('GET and HEAD /engage/guides/* are served from pages.dev on either host', async () => {
  await withUpstream(
    () =>
      pagesResponse({
        headers: {
          'cache-control': 'public, max-age=0, must-revalidate',
          'content-encoding': 'gzip',
          'x-frame-options': 'DENY',
        },
      }),
    async (calls) => {
      for (const origin of [APEX, WWW]) {
        const response = await worker.fetch(
          new Request(`${origin}${GUIDE_PATH}?utm_source=chatgpt.com`, {
            headers: { cookie: 'accessToken=secret', authorization: 'Bearer secret' },
          }),
          {},
          ctx
        );
        assert.equal(response.status, 200);
        assert.equal(await response.text(), GUIDE_HTML);
        assert.equal(response.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
        assert.equal(response.headers.get('content-encoding'), null);
        assert.equal(response.headers.get('x-frame-options'), 'DENY');
        assert.equal(response.headers.get('content-security-policy'), null);
        assert.equal(response.headers.get('x-engage-cache'), null);
      }

      assert.equal(calls.length, 2);
      for (const call of calls) {
        assert.equal(call.url, `${PAGES}${GUIDE_PATH}?utm_source=chatgpt.com`);
        assert.equal(call.method, 'GET');
        assert.equal(call.redirect, 'manual');
        assert.equal(call.cache, 'no-store');
        assert.equal(call.host, 'capstone-site-1i5.pages.dev');
        assert.equal(call.cookie, null);
        assert.equal(call.authorization, null);
      }

      calls.length = 0;
      const head = await worker.fetch(
        new Request(`${WWW}${GUIDE_PATH}`, { method: 'HEAD' }),
        {},
        ctx
      );
      assert.equal(head.status, 200);
      assert.equal(head.headers.get('content-type'), 'text/html; charset=utf-8');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].method, 'HEAD');
      assert.equal(calls[0].url, `${PAGES}${GUIDE_PATH}`);
    }
  );
});

test('a Pages redirect stays on the host the visitor used', async () => {
  const bare = '/engage/guides/mtd-engagement-letters-and-fixed-fees';
  const slashed = `${bare}/`;

  await withUpstream(
    () => pagesResponse({ status: 308, location: slashed }),
    async (calls) => {
      const relative = await worker.fetch(new Request(`${WWW}${bare}`), {}, ctx);
      assert.equal(relative.status, 308);
      assert.equal(relative.headers.get('Location'), `${WWW}${slashed}`);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, `${PAGES}${bare}`);
    }
  );

  await withUpstream(
    () => pagesResponse({ status: 308, location: `${PAGES}${slashed}` }),
    async () => {
      const fromPages = await worker.fetch(new Request(`${WWW}${bare}`), {}, ctx);
      assert.equal(fromPages.status, 308);
      assert.equal(fromPages.headers.get('Location'), `${WWW}${slashed}`);
    }
  );

  await withUpstream(
    () => pagesResponse({ status: 301, location: `${APEX}${slashed}?utm=linkedin` }),
    async () => {
      const fromApexHost = await worker.fetch(new Request(`${WWW}${bare}`), {}, ctx);
      assert.equal(fromApexHost.status, 301);
      assert.equal(fromApexHost.headers.get('Location'), `${WWW}${slashed}?utm=linkedin`);
    }
  );

  await withUpstream(
    () => pagesResponse({ status: 308, location: `${WWW}${slashed}` }),
    async () => {
      const fromWwwHost = await worker.fetch(new Request(`${APEX}${bare}`), {}, ctx);
      assert.equal(fromWwwHost.status, 308);
      assert.equal(fromWwwHost.headers.get('Location'), `${APEX}${slashed}`);
    }
  );

  await withUpstream(
    () => pagesResponse({ status: 302, location: 'https://example.com/leave' }),
    async (calls) => {
      const external = await worker.fetch(new Request(`${WWW}${bare}`), {}, ctx);
      assert.equal(external.status, 302);
      assert.equal(external.headers.get('Location'), 'https://example.com/leave');
      assert.equal(calls.length, 1);
    }
  );
});

test('a Pages 404 falls through to the SPA shell', async () => {
  await withUpstream(
    () => pagesResponse({ status: 404, body: 'pages-miss' }),
    async (calls) => {
      for (const path of ['/engage/guides', '/engage/guides/', `${GUIDE_PATH}missing`]) {
        calls.length = 0;
        const response = await worker.fetch(new Request(`${APEX}${path}`), {}, ctx);
        assert.equal(response.status, 200);
        assert.equal(await response.text(), SPA_HTML);
        assert.match(response.headers.get('content-security-policy'), /js\.stripe\.com/);
        assert.equal(calls.length, 2);
        assert.equal(calls[0].url, `${PAGES}${path}`);
        assert.equal(calls[1].url, `${FRONTEND}/engage/index.html`);
      }

      calls.length = 0;
      const head = await worker.fetch(
        new Request(`${WWW}/engage/guides/missing`, { method: 'HEAD' }),
        {},
        ctx
      );
      assert.equal(head.status, 200);
      assert.equal(calls[0].url, `${PAGES}/engage/guides/missing`);
      assert.equal(calls[0].method, 'HEAD');
      assert.equal(calls[1].url, `${FRONTEND}/engage/index.html`);
      assert.equal(calls[1].method, 'HEAD');
    }
  );
});

test('app, marketing, site, and API routes do not fetch Pages', async () => {
  await withUpstream(
    () => pagesResponse(),
    async (calls, env) => {
      const marketing = await worker.fetch(new Request(`${APEX}/engage/`), env, ctx);
      assert.equal(marketing.status, 200);
      assert.equal(marketing.headers.get('X-Engage-Variant'), 'marketing');
      assert.match(await marketing.text(), /marketing-page/);

      const wwwMarketing = await worker.fetch(new Request(`${WWW}/engage/`), env, ctx);
      assert.equal(wwwMarketing.headers.get('X-Engage-Variant'), 'marketing');

      const signedIn = await worker.fetch(
        new Request(`${APEX}/engage/`, { headers: { cookie: 'accessToken=abc' } }),
        env,
        ctx
      );
      assert.equal(await signedIn.text(), SPA_HTML);
      assert.equal(signedIn.headers.get('X-Engage-Variant'), null);

      const site = await worker.fetch(new Request(`${APEX}/engage/site/inline-1.js`), env, ctx);
      assert.equal(site.status, 200);
      assert.equal(await site.text(), 'site-asset');

      const register = await worker.fetch(new Request(`${APEX}/engage/register`), {}, ctx);
      assert.equal(await register.text(), SPA_HTML);

      const login = await worker.fetch(new Request(`${WWW}/engage/login`), {}, ctx);
      assert.equal(await login.text(), SPA_HTML);

      const lookalike = await worker.fetch(new Request(`${APEX}/engage/guideship`), {}, ctx);
      assert.equal(await lookalike.text(), SPA_HTML);

      const asset = await worker.fetch(new Request(`${APEX}/engage/assets/app.js`), {}, ctx);
      assert.equal(asset.status, 200);

      const api = await worker.fetch(new Request(`${APEX}/engage/api/proposals`), {}, ctx);
      assert.equal(await api.text(), '{"status":"ok"}');

      const ping = await worker.fetch(new Request(`${APEX}/engage/ping`), {}, ctx);
      assert.equal(await ping.text(), '{"status":"ok"}');

      const post = await worker.fetch(
        new Request(`${APEX}/engage/guides/mtd-engagement-letters-and-fixed-fees/`, {
          method: 'POST',
        }),
        {},
        ctx
      );
      assert.equal(post.status, 200);
      assert.match(post.headers.get('content-security-policy'), /js\.stripe\.com/);

      const magnet = await worker.fetch(new Request(`${APEX}/engage/mtd-repricing/`), {}, ctx);
      assert.equal(magnet.status, 301);
      assert.equal(magnet.headers.get('Location'), `${APEX}/mtd-repricing/`);

      const urls = calls.map((call) => call.url);
      assert.equal(
        urls.some((url) => url.startsWith(PAGES)),
        false
      );
      assert.ok(urls.includes(`${FRONTEND}/engage/index.html`));
      assert.ok(urls.includes(`${FRONTEND}/engage/assets/app.js`));
      assert.ok(urls.includes(`${BACKEND}/api/proposals`));
      assert.ok(urls.includes(`${BACKEND}/ping`));
      assert.ok(
        urls.includes(`${FRONTEND}/guides/mtd-engagement-letters-and-fixed-fees/`),
        urls.join('\n')
      );
    }
  );
});
