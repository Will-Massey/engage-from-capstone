import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker, { hasSessionCookie, isMarketingRoot, leadMagnetLocation } from './index.js';

test('hasSessionCookie detects accessToken', () => {
  assert.equal(hasSessionCookie('accessToken=abc123'), true);
  assert.equal(hasSessionCookie('foo=1; accessToken=abc123; bar=2'), true);
});

test('hasSessionCookie detects refreshToken', () => {
  assert.equal(hasSessionCookie('refreshToken=xyz'), true);
  assert.equal(hasSessionCookie('theme=dark;refreshToken=xyz'), true);
});

test('hasSessionCookie ignores absent, empty and lookalike cookies', () => {
  assert.equal(hasSessionCookie(null), false);
  assert.equal(hasSessionCookie(''), false);
  assert.equal(hasSessionCookie('theme=dark; sidebar=open'), false);
  assert.equal(hasSessionCookie('notAccessToken=abc'), false);
  assert.equal(hasSessionCookie('accessToken='), false);
});

test('isMarketingRoot: anonymous GET/HEAD on the bare root only', () => {
  assert.equal(isMarketingRoot('/engage/', 'GET', ''), true);
  assert.equal(isMarketingRoot('/engage/', 'HEAD', null), true);
  assert.equal(isMarketingRoot('/engage/', 'GET', 'accessToken=abc'), false);
  assert.equal(isMarketingRoot('/engage/', 'POST', ''), false);
  assert.equal(isMarketingRoot('/engage/login', 'GET', ''), false);
  assert.equal(isMarketingRoot('/engage/proposals/1', 'GET', ''), false);
});

test('leadMagnetLocation: exact slugs 301 to the apex magnets, query preserved', () => {
  assert.equal(leadMagnetLocation('/engage/mtd-repricing'), '/mtd-repricing/');
  assert.equal(leadMagnetLocation('/engage/mtd-repricing/'), '/mtd-repricing/');
  assert.equal(
    leadMagnetLocation('/engage/mtd-repricing/', '?utm=linkedin'),
    '/mtd-repricing/?utm=linkedin'
  );
  assert.equal(leadMagnetLocation('/engage/proposal-checklist'), '/proposal-checklist/');
  assert.equal(leadMagnetLocation('/engage/proposal-checklist/'), '/proposal-checklist/');
  assert.equal(
    leadMagnetLocation('/engage/proposal-checklist', '?ref=email'),
    '/proposal-checklist/?ref=email'
  );
});

test('fetch 301s the two magnets with query preserved and leaves app routes alone', async () => {
  const magnet = await worker.fetch(
    new Request('https://capstonesoftware.co.uk/engage/mtd-repricing/?utm=linkedin'),
    {},
    {}
  );
  assert.equal(magnet.status, 301);
  assert.equal(
    magnet.headers.get('Location'),
    'https://capstonesoftware.co.uk/mtd-repricing/?utm=linkedin'
  );

  const checklist = await worker.fetch(
    new Request('https://capstonesoftware.co.uk/engage/proposal-checklist'),
    {},
    {}
  );
  assert.equal(checklist.status, 301);
  assert.equal(
    checklist.headers.get('Location'),
    'https://capstonesoftware.co.uk/proposal-checklist/'
  );
});

test('leadMagnetLocation: does not splat /engage/* — marketing and app routes stay', () => {
  assert.equal(leadMagnetLocation('/engage/'), null);
  assert.equal(leadMagnetLocation('/engage'), null);
  assert.equal(leadMagnetLocation('/engage/register'), null);
  assert.equal(leadMagnetLocation('/engage/login'), null);
  assert.equal(leadMagnetLocation('/engage/mtd-repricing/extra'), null);
  assert.equal(leadMagnetLocation('/engage/proposal-checklist/download'), null);
  assert.equal(leadMagnetLocation('/engage/proposals/1'), null);
});

test('packaged marketing HTML past-tenses the first quarterly deadline', () => {
  const html = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../public/engage/index.html'),
    'utf8'
  );
  assert.doesNotMatch(html, /first quarterly deadline is\s+7 August 2026/i);
  assert.match(html, /first quarterly deadline was\s+7 August 2026/);
  assert.match(html, /Solo £29/);
  assert.match(html, /Practice £59/);
});
