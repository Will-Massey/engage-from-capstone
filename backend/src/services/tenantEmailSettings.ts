/**
 * Load and decrypt per-tenant email settings from tenant.settings JSON.
 */

import { prisma } from '../config/database.js';
import { encrypt, decrypt, decryptObject } from '../utils/encryption.js';
import type { EmailConfig, EmailProvider as NodemailerProvider } from './emailService.js';

export interface TenantEmailSettings {
  provider?: NodemailerProvider;
  fromName?: string;
  fromEmail?: string;
  replyToEmail?: string;
  useCustomEmail?: boolean;
  verifiedAt?: string;
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
  };
  gmail?: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    user: string;
  };
  outlook?: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    user: string;
  };
}

export interface LoadedTenantEmailContext {
  tenantId: string;
  tenantName: string;
  email: TenantEmailSettings;
}

export function isCustomEmailConfigured(email: TenantEmailSettings): boolean {
  if (email.useCustomEmail === false) return false;
  if (!email.provider) return false;

  if (email.provider === 'smtp') {
    return !!(email.smtp?.host && email.smtp?.user && email.smtp?.pass);
  }

  if (email.provider === 'gmail') {
    return !!(email.gmail?.clientId && email.gmail?.refreshToken && email.gmail?.user);
  }

  if (email.provider === 'outlook' || email.provider === 'microsoft365') {
    return !!(email.outlook?.clientId && email.outlook?.refreshToken && email.outlook?.user);
  }

  return false;
}

export function decryptTenantEmailSettings(raw: TenantEmailSettings): TenantEmailSettings {
  const copy = { ...raw };
  if (copy.smtp?.pass) {
    copy.smtp = { ...copy.smtp, pass: decrypt(copy.smtp.pass) };
  }
  if (copy.gmail) {
    copy.gmail = decryptObject(
      copy.gmail as Record<string, string>
    ) as TenantEmailSettings['gmail'];
  }
  if (copy.outlook) {
    copy.outlook = decryptObject(
      copy.outlook as Record<string, string>
    ) as TenantEmailSettings['outlook'];
  }
  return copy;
}

/** Keys encryptObject treats as secrets; kept in step with it deliberately. */
const SECRET_KEYS = new Set(['clientSecret', 'refreshToken', 'accessToken', 'pass', 'password']);

/**
 * Merge one OAuth provider block, encrypting only the values that arrived in
 * this request.
 *
 * Anything already in `existing` was encrypted when it was stored, so running
 * encrypt() over it again yields E(E(secret)). A single decrypt on read then
 * returns the inner ciphertext rather than the token, and because
 * getMailboxConnection() only tests the field for truthiness the practice goes
 * on being shown as connected while every refresh silently fails.
 *
 * The previous code re-encrypted the whole merged block on every save, so any
 * save touching this route — including one that sent no OAuth fields at all,
 * such as the SMTP panel — corrupted a connected mailbox. Provenance is the
 * reliable signal here: inspecting the value's shape cannot distinguish
 * ciphertext from a secret that merely looks like one.
 */
function mergeProviderSecrets<T extends Record<string, string>>(
  existing: T | undefined,
  incoming: T | undefined
): T | undefined {
  if (!incoming) return existing;

  const merged: Record<string, string> = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    merged[key] = SECRET_KEYS.has(key) && value ? encrypt(value) : value;
  }
  return merged as T;
}

export function encryptTenantEmailSettingsForSave(
  incoming: TenantEmailSettings,
  existing?: TenantEmailSettings
): TenantEmailSettings {
  const merged: TenantEmailSettings = {
    ...existing,
    ...incoming,
    smtp: incoming.smtp ? { ...existing?.smtp, ...incoming.smtp } : existing?.smtp,
    // gmail and outlook are merged below, where request-supplied secrets can be
    // told apart from ones already encrypted at rest.
  };

  if (merged.smtp?.pass) {
    const pass = merged.smtp.pass;
    const looksEncrypted = pass.includes(':') && pass.split(':').length === 3;
    if (!looksEncrypted && incoming.smtp?.pass) {
      merged.smtp = { ...merged.smtp, pass: encrypt(pass) };
    } else if (!incoming.smtp?.pass && existing?.smtp?.pass) {
      merged.smtp.pass = existing.smtp.pass;
    }
  }
  merged.gmail = mergeProviderSecrets(existing?.gmail, incoming.gmail);
  merged.outlook = mergeProviderSecrets(existing?.outlook, incoming.outlook);

  return merged;
}

export async function loadTenantEmailContext(
  tenantId: string
): Promise<LoadedTenantEmailContext | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, settings: true },
  });

  if (!tenant) return null;

  const settings = JSON.parse(tenant.settings || '{}');
  const rawEmail: TenantEmailSettings = settings.email || {};
  const email = decryptTenantEmailSettings(rawEmail);

  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    email,
  };
}

export function tenantEmailToConfig(
  email: TenantEmailSettings,
  tenantName: string
): EmailConfig | null {
  if (!isCustomEmailConfigured(email)) return null;

  return {
    provider: email.provider!,
    fromName: email.fromName || tenantName,
    fromEmail: email.fromEmail || '',
    smtp: email.smtp,
    gmail: email.gmail,
    outlook: email.outlook,
  };
}

export async function resolveReplyToEmail(
  tenantId: string,
  email: TenantEmailSettings,
  explicitReplyTo?: string
): Promise<string> {
  if (explicitReplyTo) return explicitReplyTo;
  if (email.replyToEmail) return email.replyToEmail;
  if (email.fromEmail) return email.fromEmail;

  const partner = await prisma.user.findFirst({
    where: { tenantId, role: { in: ['PARTNER', 'ADMIN'] }, isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { email: true },
  });

  return (
    partner?.email ||
    process.env.EMAIL_DEFAULT_REPLY_TO_FALLBACK ||
    process.env.EMAIL_FROM_ADDRESS ||
    'support@capstonesoftware.co.uk'
  );
}
