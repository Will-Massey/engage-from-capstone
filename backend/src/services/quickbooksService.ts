/**
 * QuickBooks OAuth scaffold (W4.7) — mirrors Xero routes; stub when env not set.
 */

import {
  getTenantQuickBooksSettings,
  isQuickBooksOAuthConfigured,
  saveTenantQuickBooksSettings,
  type TenantQuickBooksSettings,
} from './tenantQuickbooksSettings.js';
import logger from '../utils/logger.js';

const INTUIT_AUTH_BASE =
  process.env.QUICKBOOKS_SANDBOX === 'false'
    ? 'https://appcenter.intuit.com/connect/oauth2'
    : 'https://appcenter.intuit.com/connect/oauth2';

export function buildQuickBooksConsentUrl(state: string): string {
  if (!isQuickBooksOAuthConfigured()) {
    throw new Error('QuickBooks OAuth is not configured');
  }

  const params = new URLSearchParams({
    client_id: process.env.QUICKBOOKS_CLIENT_ID!,
    redirect_uri: process.env.QUICKBOOKS_REDIRECT_URI!,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    state,
  });

  return `${INTUIT_AUTH_BASE}?${params.toString()}`;
}

/**
 * Exchange OAuth code for tokens — full implementation deferred; scaffold stores stub connection.
 */
export async function completeQuickBooksOAuth(params: {
  tenantId: string;
  userId: string;
  code: string;
  realmId?: string;
}): Promise<TenantQuickBooksSettings> {
  if (!isQuickBooksOAuthConfigured()) {
    throw new Error('QuickBooks OAuth is not configured');
  }

  // Production: POST to Intuit token endpoint. Scaffold: persist placeholder until W4.7 full.
  logger.info('QuickBooks OAuth callback received (scaffold)', {
    tenantId: params.tenantId,
    hasCode: Boolean(params.code),
    realmId: params.realmId,
  });

  const settings: TenantQuickBooksSettings = {
    connected: true,
    realmId: params.realmId || 'stub-realm',
    companyName: 'QuickBooks (connected — sync stub)',
    refreshToken: `stub-${params.code.slice(0, 8)}`,
    accessToken: undefined,
    connectedAt: new Date().toISOString(),
    connectedByUserId: params.userId,
    scope: ['com.intuit.quickbooks.accounting'],
  };

  await saveTenantQuickBooksSettings(params.tenantId, settings);
  return settings;
}

export async function revokeQuickBooksConnection(tenantId: string): Promise<void> {
  const existing = await getTenantQuickBooksSettings(tenantId);
  if (!existing) return;
  logger.info('QuickBooks disconnect (scaffold)', { tenantId });
}