import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PREFIX,
  ASSET_MAX_AGE,
  INDEX_MAX_AGE,
  cachePolicyForPath,
  spaIndexCacheKey,
  withCacheControl,
} from './cachePolicy.js';

describe('cachePolicyForPath', () => {
  it('edge-caches hashed build assets as immutable', () => {
    const policy = cachePolicyForPath(`${PREFIX}/assets/index-DK-bLHJx.js`);
    assert.equal(policy.edge, true);
    assert.equal(policy.cacheControl, `public, max-age=${ASSET_MAX_AGE}, immutable`);
  });

  it('does not edge-cache API routes', () => {
    const policy = cachePolicyForPath(`${PREFIX}/api/auth/me`);
    assert.equal(policy.edge, false);
    assert.equal(policy.cacheControl, null);
  });

  it('edge-caches SPA shell with short TTL', () => {
    const policy = cachePolicyForPath(`${PREFIX}/proposals/view/abc123`, { spaFallback: true });
    assert.equal(policy.edge, true);
    assert.equal(policy.cacheControl, `public, max-age=${INDEX_MAX_AGE}`);
    assert.equal(policy.normalizeToIndex, true);
  });
});

describe('spaIndexCacheKey', () => {
  it('normalizes deep SPA paths to a single index.html cache key', () => {
    const key = spaIndexCacheKey(
      new Request('https://capstonesoftware.co.uk/engage/proposals/view/token?x=1')
    );
    assert.equal(key.url, 'https://capstonesoftware.co.uk/engage/index.html');
    assert.equal(key.method, 'GET');
  });
});

describe('withCacheControl', () => {
  it('sets Cache-Control and strips content-encoding for cache storage', () => {
    const headers = withCacheControl(
      new Headers({ 'content-encoding': 'gzip', 'content-type': 'text/javascript' }),
      'public, max-age=60'
    );
    assert.equal(headers.get('Cache-Control'), 'public, max-age=60');
    assert.equal(headers.get('content-encoding'), null);
    assert.equal(headers.get('content-type'), 'text/javascript');
  });
});
