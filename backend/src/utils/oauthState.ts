import crypto from 'crypto';

function resolveOAuthStateSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('OAUTH_STATE_SECRET environment variable is required in production');
  }
  return process.env.JWT_SECRET || 'oauth-state-dev-only';
}

const OAUTH_STATE_SECRET = resolveOAuthStateSecret();

export interface OAuthStatePayload {
  tenantId: string;
  userId: string;
  provider: string;
  exp: number;
}

// OAuth consent round-trips involve a human (provider login, org select, Allow),
// so a tight window forces the user to race the clock. 30 min comfortably covers
// a real connect without meaningfully widening the CSRF-state attack surface.
const OAUTH_STATE_TTL_MS = 30 * 60 * 1000;

export function createOAuthState(payload: Omit<OAuthStatePayload, 'exp'>): string {
  const data: OAuthStatePayload = {
    ...payload,
    exp: Date.now() + OAUTH_STATE_TTL_MS,
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
