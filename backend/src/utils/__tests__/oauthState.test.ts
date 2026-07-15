import crypto from 'crypto';
import { createOAuthState, verifyOAuthState, type OAuthStatePayload } from '../oauthState.js';

describe('oauthState', () => {
  it('round-trips a payload', () => {
    const state = createOAuthState({ tenantId: 't1', userId: 'u1', provider: 'xero' });
    const payload = verifyOAuthState(state);

    expect(payload).not.toBeNull();
    expect(payload!.tenantId).toBe('t1');
    expect(payload!.userId).toBe('u1');
    expect(payload!.provider).toBe('xero');
    expect(payload!.exp).toBeGreaterThan(Date.now());
  });

  it('rejects an expired state', () => {
    const state = createOAuthState({ tenantId: 't1', userId: 'u1', provider: 'quickbooks' });

    const realNow = Date.now;
    jest.spyOn(Date, 'now').mockReturnValue(realNow() + 31 * 60 * 1000); // past the 30min ttl
    try {
      expect(verifyOAuthState(state)).toBeNull();
    } finally {
      jest.restoreAllMocks();
    }
  });

  it('rejects a tampered payload (signature mismatch)', () => {
    const state = createOAuthState({ tenantId: 't1', userId: 'u1', provider: 'xero' });
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const dot = decoded.lastIndexOf('.');
    const json = decoded.slice(0, dot);
    const sig = decoded.slice(dot + 1);

    const tamperedJson = json.replace('"tenantId":"t1"', '"tenantId":"t2"');
    const tampered = Buffer.from(`${tamperedJson}.${sig}`).toString('base64url');

    expect(verifyOAuthState(tampered)).toBeNull();
  });

  it('rejects a forged signature of the right length', () => {
    const state = createOAuthState({ tenantId: 't1', userId: 'u1', provider: 'xero' });
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const dot = decoded.lastIndexOf('.');
    const json = decoded.slice(0, dot);

    const forgedSig = crypto.createHmac('sha256', 'wrong-secret').update(json).digest('hex');
    const forged = Buffer.from(`${json}.${forgedSig}`).toString('base64url');

    expect(verifyOAuthState(forged)).toBeNull();
  });

  it('rejects garbage and missing-field payloads', () => {
    expect(verifyOAuthState('not-a-state')).toBeNull();
    expect(verifyOAuthState('')).toBeNull();

    // Correctly signed but missing required fields must still fail.
    const partial: Partial<OAuthStatePayload> = { provider: 'xero', exp: Date.now() + 60_000 };
    const secret =
      process.env.OAUTH_STATE_SECRET || process.env.JWT_SECRET || 'oauth-state-dev-only';
    const json = JSON.stringify(partial);
    const sig = crypto.createHmac('sha256', secret).update(json).digest('hex');
    const state = Buffer.from(`${json}.${sig}`).toString('base64url');
    expect(verifyOAuthState(state)).toBeNull();
  });
});
