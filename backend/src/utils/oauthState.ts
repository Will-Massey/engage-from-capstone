import crypto from 'crypto';

const OAUTH_STATE_SECRET =
  process.env.OAUTH_STATE_SECRET || process.env.JWT_SECRET || 'oauth-state-dev-only';

export interface OAuthStatePayload {
  tenantId: string;
  userId: string;
  provider: string;
  exp: number;
}

export function createOAuthState(payload: Omit<OAuthStatePayload, 'exp'>): string {
  const data: OAuthStatePayload = {
    ...payload,
    exp: Date.now() + 10 * 60 * 1000,
  };
  const json = JSON.stringify(data);
  const sig = crypto.createHmac('sha256', OAUTH_STATE_SECRET).update(json).digest('hex');
  return Buffer.from(`${json}.${sig}`).toString('base64url');
}

export function verifyOAuthState(state: string): OAuthStatePayload | null {
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const dot = decoded.lastIndexOf('.');
    if (dot === -1) return null;
    const json = decoded.slice(0, dot);
    const sig = decoded.slice(dot + 1);
    const expected = crypto.createHmac('sha256', OAUTH_STATE_SECRET).update(json).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(json) as OAuthStatePayload;
    if (!payload.exp || payload.exp < Date.now()) return null;
    if (!payload.tenantId || !payload.userId || !payload.provider) return null;
    return payload;
  } catch {
    return null;
  }
}
