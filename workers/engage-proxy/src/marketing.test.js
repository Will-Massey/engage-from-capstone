import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasSessionCookie, isMarketingRoot } from './index.js';

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
