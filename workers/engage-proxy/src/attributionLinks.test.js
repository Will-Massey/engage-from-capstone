import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from './index.js';
import { firstTouchSearch, rewriteEngageRegisterLinks } from './attributionLinks.js';

const PAGE = [
  '<a href="https://capstonesoftware.co.uk/engage/register">Start the free trial</a>',
  '<a href="https://capstonesoftware.co.uk/engage/register">Start the free trial</a>',
  '<a href="/engage/">Home</a>',
].join('');

test('firstTouchSearch keeps utm_source=chatgpt.com from the page', () => {
  assert.equal(firstTouchSearch('?utm_source=chatgpt.com', ''), '?utm_source=chatgpt.com');
});

test('firstTouchSearch copies utm params from a capstonesoftware.co.uk referrer', () => {
  assert.equal(
    firstTouchSearch(
      '',
      'https://capstonesoftware.co.uk/?utm_source=chatgpt.com&utm_medium=referral'
    ),
    '?utm_source=chatgpt.com&utm_medium=referral'
  );
  assert.equal(
    firstTouchSearch('', 'https://www.capstonesoftware.co.uk/engage/?utm_source=chatgpt.com'),
    '?utm_source=chatgpt.com'
  );
  assert.equal(firstTouchSearch('', 'https://chatgpt.com/?utm_source=chatgpt.com'), '');
});

test('firstTouchSearch lets the landing URL win over the referrer', () => {
  assert.equal(
    firstTouchSearch(
      '?utm_source=chatgpt.com',
      'https://capstonesoftware.co.uk/?utm_source=linkedin&utm_medium=social'
    ),
    '?utm_source=chatgpt.com&utm_medium=social'
  );
});

test('rewriteEngageRegisterLinks appends the campaign and leaves other links', () => {
  const rewritten = rewriteEngageRegisterLinks(PAGE, '?utm_source=chatgpt.com');
  assert.equal(
    rewritten.match(
      /href="https:\/\/capstonesoftware\.co\.uk\/engage\/register\?utm_source=chatgpt\.com"/g
    ).length,
    2
  );
  assert.match(rewritten, /href="\/engage\/"/);
});

test('rewriteEngageRegisterLinks does not replace a campaign already on the link', () => {
  const html =
    '<a href="https://capstonesoftware.co.uk/engage/register?utm_source=linkedin">Go</a>';
  assert.equal(
    rewriteEngageRegisterLinks(html, '?utm_source=chatgpt.com'),
    '<a href="https://capstonesoftware.co.uk/engage/register?utm_source=linkedin">Go</a>'
  );
});

test('marketing page keeps utm_source=chatgpt.com on register links', async () => {
  const env = {
    ASSETS: {
      fetch: async () =>
        new Response(PAGE, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
    },
  };
  const ctx = { waitUntil() {} };

  const fromQuery = await worker.fetch(
    new Request('https://capstonesoftware.co.uk/engage/?utm_source=chatgpt.com'),
    env,
    ctx
  );
  assert.equal(fromQuery.status, 200);
  assert.equal(fromQuery.headers.get('X-Engage-Variant'), 'marketing');
  const queryHtml = await fromQuery.text();
  assert.match(
    queryHtml,
    /href="https:\/\/capstonesoftware\.co\.uk\/engage\/register\?utm_source=chatgpt\.com"/
  );

  const fromApex = await worker.fetch(
    new Request('https://capstonesoftware.co.uk/engage/', {
      headers: { Referer: 'https://capstonesoftware.co.uk/?utm_source=chatgpt.com' },
    }),
    env,
    ctx
  );
  const apexHtml = await fromApex.text();
  assert.match(
    apexHtml,
    /href="https:\/\/capstonesoftware\.co\.uk\/engage\/register\?utm_source=chatgpt\.com"/
  );
});

const PACKAGED_HTML = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../public/engage/index.html'),
  'utf8'
);

const REGISTER_CONTENTS = [
  'engage-nav',
  'engage-hero',
  'engage-pricing-card',
  'engage-pricing-card',
  'engage-footer',
];

function registerHrefs(html) {
  return [
    ...html.matchAll(/href="(https:\/\/capstonesoftware\.co\.uk\/engage\/register[^"]*)"/g),
  ].map((match) => match[1]);
}

function packagedAssets(html) {
  return {
    ASSETS: {
      fetch: async (request) => {
        const href = request instanceof URL ? request.href : String(request.url ?? request);
        if (href.endsWith('/engage/index.html')) {
          return new Response(html, {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          });
        }
        return new Response('missing', { status: 404 });
      },
    },
  };
}

test('chatgpt.com visitor gets utm_source=chatgpt.com on all five register links', async () => {
  const response = await worker.fetch(
    new Request('https://capstonesoftware.co.uk/engage/?utm_source=chatgpt.com'),
    packagedAssets(PACKAGED_HTML),
    { waitUntil() {} }
  );
  assert.equal(response.status, 200);
  const hrefs = registerHrefs(await response.text());
  assert.equal(hrefs.length, 5);
  hrefs.forEach((href, index) => {
    const params = new URL(href).searchParams;
    assert.equal(params.get('utm_source'), 'chatgpt.com');
    assert.equal(params.get('utm_medium'), 'website');
    assert.equal(params.get('utm_campaign'), 'engage');
    assert.equal(params.get('utm_content'), REGISTER_CONTENTS[index]);
  });
});

test('a visit with no utm params leaves the default register links', async () => {
  const response = await worker.fetch(
    new Request('https://capstonesoftware.co.uk/engage/'),
    packagedAssets(PACKAGED_HTML),
    { waitUntil() {} }
  );
  assert.deepEqual(registerHrefs(await response.text()), registerHrefs(PACKAGED_HTML));
  for (const href of registerHrefs(PACKAGED_HTML)) {
    const params = new URL(href).searchParams;
    assert.equal(params.get('utm_source'), 'capstonesoftware');
    assert.equal(params.get('utm_medium'), 'website');
    assert.equal(params.get('utm_campaign'), 'engage');
  }
});

test('rewriteEngageRegisterLinks leaves a LinkedIn source untouched', () => {
  const html =
    '<a href="https://capstonesoftware.co.uk/engage/register?utm_source=linkedin&utm_content=engage-nav">Go</a>';
  assert.equal(rewriteEngageRegisterLinks(html, '?utm_source=chatgpt.com'), html);
});
