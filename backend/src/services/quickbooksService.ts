/**
 * QuickBooks Online OAuth + session management (R4.1) — mirrors Xero:
 * token exchange/refresh/revoke via raw fetch (no SDK), tokens encrypted on
 * Tenant.settings.quickbooks, refresh-on-read with 60s skew.
 */

import {
  getTenantQuickBooksSettings,
  isQuickBooksOAuthConfigured,
  saveTenantQuickBooksSettings,
  type TenantQuickBooksSettings,
} from './tenantQuickbooksSettings.js';
import logger from '../utils/logger.js';

// The authorize URL is the same for sandbox and production — only the API
// base (see getQuickBooksApiBase) differs.
const INTUIT_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const INTUIT_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const INTUIT_REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';

export const QUICKBOOKS_OAUTH_SCOPE = 'com.intuit.quickbooks.accounting';

/** v3 API base — sandbox unless QUICKBOOKS_SANDBOX=false */
export function getQuickBooksApiBase(): string {
  return process.env.QUICKBOOKS_SANDBOX === 'false'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
}

function requireQuickBooksEnv() {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
  const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('QuickBooks OAuth is not configured');
  }
  return { clientId, clientSecret, redirectUri };
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

export function buildQuickBooksConsentUrl(state: string): string {
  const { clientId, redirectUri } = requireQuickBooksEnv();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: QUICKBOOKS_OAUTH_SCOPE,
    state,
  });

  return `${INTUIT_AUTH_URL}?${params.toString()}`;
}

interface IntuitTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in?: number;
  token_type?: string;
}

async function requestIntuitTokens(body: URLSearchParams): Promise<IntuitTokenResponse> {
  const { clientId, clientSecret } = requireQuickBooksEnv();

  const response = await fetch(INTUIT_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Intuit token request failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  return (await response.json()) as IntuitTokenResponse;
}

/** Best-effort company name lookup — never blocks the OAuth flow. */
async function fetchCompanyName(accessToken: string, realmId: string): Promise<string | undefined> {
  try {
    const url = `${getQuickBooksApiBase()}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=75`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    if (!response.ok) return undefined;
    const data = (await response.json()) as { CompanyInfo?: { CompanyName?: string } };
    return data.CompanyInfo?.CompanyName || undefined;
  } catch (err) {
    logger.warn('QuickBooks company info lookup failed', err);
    return undefined;
  }
}

/** Exchange the OAuth authorization code for tokens and persist them encrypted. */
export async function completeQuickBooksOAuth(params: {
  tenantId: string;
  userId: string;
  code: string;
  realmId?: string;
}): Promise<TenantQuickBooksSettings> {
  const { redirectUri } = requireQuickBooksEnv();

  if (!params.realmId) {
    throw new Error('QuickBooks callback did not include a realmId');
  }

  const tokens = await requestIntuitTokens(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: redirectUri,
    })
  );

  const companyName = await fetchCompanyName(tokens.access_token, params.realmId);

  const settings: TenantQuickBooksSettings = {
    connected: true,
    realmId: params.realmId,
    companyName,
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    tokenExpiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
    connectedAt: new Date().toISOString(),
    connectedByUserId: params.userId,
    scope: [QUICKBOOKS_OAUTH_SCOPE],
  };

  await saveTenantQuickBooksSettings(params.tenantId, settings);
  return settings;
}

export interface QuickBooksSession {
  accessToken: string;
  realmId: string;
  settings: TenantQuickBooksSettings;
}

/** Load tenant tokens, refresh when within 60s of expiry, return a ready session. */
export async function getAuthenticatedQuickBooksSession(
  tenantId: string
): Promise<QuickBooksSession> {
  const settings = await getTenantQuickBooksSettings(tenantId);
  if (!settings?.connected || !settings.refreshToken || !settings.realmId) {
    throw new Error('QuickBooks is not connected for this practice');
  }

  const expiresAt = settings.tokenExpiresAt ? new Date(settings.tokenExpiresAt).getTime() : 0;
  const isExpired = !settings.accessToken || expiresAt < Date.now() + 60_000;

  if (!isExpired) {
    return { accessToken: settings.accessToken!, realmId: settings.realmId, settings };
  }

  const tokens = await requestIntuitTokens(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: settings.refreshToken,
    })
  );

  const refreshed: TenantQuickBooksSettings = {
    ...settings,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || settings.refreshToken,
    tokenExpiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
  };
  await saveTenantQuickBooksSettings(tenantId, refreshed);

  return { accessToken: refreshed.accessToken!, realmId: refreshed.realmId!, settings: refreshed };
}

/** Revoke the refresh token at Intuit — best-effort, connection may already be dead. */
export async function revokeQuickBooksConnection(tenantId: string): Promise<void> {
  const existing = await getTenantQuickBooksSettings(tenantId);
  if (!existing?.refreshToken) return;

  try {
    const { clientId, clientSecret } = requireQuickBooksEnv();
    const response = await fetch(INTUIT_REVOKE_URL, {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(clientId, clientSecret),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ token: existing.refreshToken }),
    });
    if (!response.ok) {
      logger.warn(`QuickBooks token revoke returned ${response.status}`);
    }
  } catch (err) {
    logger.warn('QuickBooks revoke failed (connection may already be invalid):', err);
  }
}
