/**
 * QuickBooks connection settings stored on Tenant.settings.quickbooks (W4.7 scaffold).
 */

import { prisma } from '../config/database.js';
import { encryptObject, decryptObject } from '../utils/encryption.js';

export interface TenantQuickBooksSettings {
  connected: boolean;
  realmId?: string;
  companyName?: string;
  refreshToken: string;
  accessToken?: string;
  tokenExpiresAt?: string;
  scope?: string[];
  connectedAt: string;
  connectedByUserId?: string;
}

export interface TenantSettingsJson {
  quickbooks?: TenantQuickBooksSettings;
  [key: string]: unknown;
}

export function isQuickBooksOAuthConfigured(): boolean {
  return Boolean(
    process.env.QUICKBOOKS_CLIENT_ID &&
    process.env.QUICKBOOKS_CLIENT_SECRET &&
    process.env.QUICKBOOKS_REDIRECT_URI
  );
}

export function getQuickBooksPublicConfig() {
  return {
    configured: isQuickBooksOAuthConfigured(),
    provider: 'quickbooks',
    sandbox: process.env.QUICKBOOKS_SANDBOX !== 'false',
  };
}

function decryptQuickBooksSettings(
  raw?: TenantQuickBooksSettings | null
): TenantQuickBooksSettings | null {
  if (!raw?.connected || !raw.refreshToken) return null;

  const copy = { ...raw };
  const sensitive: Record<string, string> = { refreshToken: copy.refreshToken };
  if (copy.accessToken) sensitive.accessToken = copy.accessToken;

  const decrypted = decryptObject(sensitive);
  copy.refreshToken = decrypted.refreshToken;
  if (decrypted.accessToken) copy.accessToken = decrypted.accessToken;

  return copy;
}

function encryptQuickBooksSettingsForSave(
  settings: TenantQuickBooksSettings
): TenantQuickBooksSettings {
  const toEncrypt: Record<string, string> = { refreshToken: settings.refreshToken };
  if (settings.accessToken) toEncrypt.accessToken = settings.accessToken;
  const encrypted = encryptObject(toEncrypt);
  return {
    ...settings,
    refreshToken: encrypted.refreshToken,
    accessToken: encrypted.accessToken,
  };
}

export async function getTenantSettings(tenantId: string): Promise<TenantSettingsJson> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  return JSON.parse(tenant?.settings || '{}') as TenantSettingsJson;
}

export async function getTenantQuickBooksSettings(
  tenantId: string
): Promise<TenantQuickBooksSettings | null> {
  const settings = await getTenantSettings(tenantId);
  return decryptQuickBooksSettings(settings.quickbooks ?? null);
}

export async function saveTenantQuickBooksSettings(
  tenantId: string,
  quickbooks: TenantQuickBooksSettings
): Promise<void> {
  const settings = await getTenantSettings(tenantId);
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      settings: JSON.stringify({
        ...settings,
        quickbooks: encryptQuickBooksSettingsForSave(quickbooks),
      }),
    },
  });
}

export async function clearTenantQuickBooksSettings(tenantId: string): Promise<void> {
  const settings = await getTenantSettings(tenantId);
  const { quickbooks: _removed, ...rest } = settings;
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: JSON.stringify(rest) },
  });
}

export function quickbooksStatusFromSettings(raw: TenantQuickBooksSettings | null): {
  connected: boolean;
  configured: boolean;
  realmId?: string;
  companyName?: string;
  connectedAt?: string;
} {
  return {
    connected: Boolean(raw?.connected),
    configured: isQuickBooksOAuthConfigured(),
    realmId: raw?.realmId,
    companyName: raw?.companyName,
    connectedAt: raw?.connectedAt,
  };
}
