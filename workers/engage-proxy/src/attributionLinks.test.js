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

test('packaged marketing HTML forwards utm_source=chatgpt.com onto every register link', () => {
  const html = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../public/engage/index.html'),
    'utf8'
  );
  const bare = html.match(/href="https:\/\/capstonesoftware\.co\.uk\/engage\/register"/g) || [];
  assert.ok(bare.length >= 1);
  const rewritten = rewriteEngageRegisterLinks(html, '?utm_source=chatgpt.com');
  const forwarded =
    rewritten.match(
      /href="https:\/\/capstonesoftware\.co\.uk\/engage\/register\?utm_source=chatgpt\.com"/g
    ) || [];
  assert.equal(forwarded.length, bare.length);
  assert.equal(rewritten.includes('href="https://capstonesoftware.co.uk/engage/register"'), false);
});
