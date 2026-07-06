import fs from 'fs';
import jwt from 'jsonwebtoken';

const TOKEN_BUFFER_MS = 60_000;

let cached: { accessToken: string; expiresAt: number } | null = null;

export function getBusinessApiUrl(): string {
  return (process.env.REVOLUT_BUSINESS_API_URL || 'https://sandbox-b2b.revolut.com').replace(
    /\/$/,
    ''
  );
}

export function isBusinessAuthConfigured(): boolean {
  if (process.env.REVOLUT_BUSINESS_API_KEY) return true;
  return Boolean(
    process.env.REVOLUT_BUSINESS_CLIENT_ID &&
    process.env.REVOLUT_BUSINESS_REFRESH_TOKEN &&
    resolvePrivateKey()
  );
}

function resolvePrivateKey(): string | null {
  const inline = process.env.REVOLUT_BUSINESS_PRIVATE_KEY?.trim();
  if (inline) return inline.replace(/\\n/g, '\n');
  const path = process.env.REVOLUT_BUSINESS_PRIVATE_KEY_PATH?.trim();
  if (path && fs.existsSync(path)) return fs.readFileSync(path, 'utf8');
  return null;
}

function signClientAssertion(clientId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: clientId,
      sub: clientId,
      aud: 'https://revolut.com',
      iat: now,
      exp: now + 300,
    },
    privateKey,
    { algorithm: 'RS256' }
  );
}

async function refreshAccessToken(): Promise<string> {
  const clientId = process.env.REVOLUT_BUSINESS_CLIENT_ID;
  const refreshToken = process.env.REVOLUT_BUSINESS_REFRESH_TOKEN;
  const privateKey = resolvePrivateKey();

  if (!clientId || !refreshToken || !privateKey) {
    throw new Error('Revolut Business OAuth is not configured');
  }

  const assertion = signClientAssertion(clientId, privateKey);
  const res = await fetch(`${getBusinessApiUrl()}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: assertion,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    message?: string;
  };

  if (!res.ok || !data.access_token) {
    throw new Error(data.message || `Revolut Business token refresh failed (${res.status})`);
  }

  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 2400;
  cached = {
    accessToken: data.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  return cached.accessToken;
}

/** Bearer token for Revolut Business API (refresh OAuth or static API key). */
export async function getBusinessAccessToken(): Promise<string> {
  const staticKey = process.env.REVOLUT_BUSINESS_API_KEY?.trim();
  if (staticKey && !process.env.REVOLUT_BUSINESS_REFRESH_TOKEN) {
    return staticKey;
  }

  if (cached && cached.expiresAt > Date.now() + TOKEN_BUFFER_MS) {
    return cached.accessToken;
  }

  if (process.env.REVOLUT_BUSINESS_REFRESH_TOKEN) {
    return refreshAccessToken();
  }

  if (staticKey) return staticKey;
  throw new Error('REVOLUT_BUSINESS_API_KEY not configured');
}
