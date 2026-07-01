/**
 * Xero connection settings stored encrypted on Tenant.settings.xero
 */

import { prisma } from '../config/database.js';
import { encrypt, decrypt, encryptObject, decryptObject } from '../utils/encryption.js';

export interface TenantXeroSettings {
  connected: boolean;
  /** Xero organisation tenant ID (xero-tenant-id header) */
  xeroTenantId: string;
  xeroTenantName?: string;
  refreshToken: string;
  accessToken?: string;
  idToken?: string;
  tokenExpiresAt?: string;
  scope?: string[];
  connectedAt: string;
  connectedByUserId?: string;
  lastImportAt?: string;
  lastPushAt?: string;
  /** Default Xero revenue account code for repeating invoices (e.g. 200) */
  defaultRevenueAccountCode?: string;
}

export interface TenantSettingsJson {
  xero?: TenantXeroSettings;
  [key: string]: unknown;
}

export function decryptTenantXeroSettings(raw?: TenantXeroSettings | null): TenantXeroSettings | null {
  if (!raw?.connected || !raw.refreshToken) return null;

  const copy = { ...raw };
  const sensitive: Record<string, string> = {};
  if (copy.refreshToken) sensitive.refreshToken = copy.refreshToken;
  if (copy.accessToken) sensitive.accessToken = copy.accessToken;
  if (copy.idToken) sensitive.idToken = copy.idToken;

  const decrypted = decryptObject(sensitive);
  if (decrypted.refreshToken) copy.refreshToken = decrypted.refreshToken;
  if (decrypted.accessToken) copy.accessToken = decrypted.accessToken;
  if (decrypted.idToken) copy.idToken = decrypted.idToken;

  return copy;
}

export function encryptTenantXeroSettingsForSave(settings: TenantXeroSettings): TenantXeroSettings {
  const toEncrypt: Record<string, string> = {
    refreshToken: settings.refreshToken,
  };
  if (settings.accessToken) toEncrypt.accessToken = settings.accessToken;
  if (settings.idToken) toEncrypt.idToken = settings.idToken;

  const encrypted = encryptObject(toEncrypt);
  return {
    ...settings,
    refreshToken: encrypted.refreshToken,
    accessToken: encrypted.accessToken,
    idToken: encrypted.idToken,
  };
}

export async function getTenantSettings(tenantId: string): Promise<TenantSettingsJson> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  return JSON.parse(tenant?.settings || '{}') as TenantSettingsJson;
}

export async function getTenantXeroSettings(
  tenantId: string
): Promise<TenantXeroSettings | null> {
  const settings = await getTenantSettings(tenantId);
  return decryptTenantXeroSettings(settings.xero ?? null);
}

export async function saveTenantXeroSettings(
  tenantId: string,
  xero: TenantXeroSettings
): Promise<void> {
  const settings = await getTenantSettings(tenantId);
  settings.xero = encryptTenantXeroSettingsForSave(xero);

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: JSON.stringify(settings) },
  });
}

export async function clearTenantXeroSettings(tenantId: string): Promise<void> {
  const settings = await getTenantSettings(tenantId);
  delete settings.xero;

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: JSON.stringify(settings) },
  });
}

/** Public status payload — no secrets */
export function xeroStatusFromSettings(raw?: TenantXeroSettings | null) {
  if (!raw?.connected) {
    return {
      connected: false,
      configured: isXeroOAuthConfigured(),
    };
  }

  return {
    connected: true,
    configured: isXeroOAuthConfigured(),
    xeroTenantId: raw.xeroTenantId,
    xeroTenantName: raw.xeroTenantName,
    connectedAt: raw.connectedAt,
    lastImportAt: raw.lastImportAt,
    lastPushAt: raw.lastPushAt,
    scope: raw.scope,
  };
}

export function isXeroOAuthConfigured(): boolean {
  return !!(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET);
}

export function getXeroRedirectUri(): string {
  if (process.env.XERO_REDIRECT_URI) {
    return process.env.XERO_REDIRECT_URI;
  }
  const apiBase =
    process.env.API_URL ||
    process.env.BACKEND_URL ||
    `http://localhost:${process.env.PORT || 3001}`;
  return `${apiBase}/api/oauth/callback/xero`;
}