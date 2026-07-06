/**
 * Load and decrypt per-tenant email settings from tenant.settings JSON.
 */

import { prisma } from '../config/database.js';
import { encrypt, decrypt, decryptObject, encryptObject } from '../utils/encryption.js';
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

export function encryptTenantEmailSettingsForSave(
  incoming: TenantEmailSettings,
  existing?: TenantEmailSettings
): TenantEmailSettings {
  const merged: TenantEmailSettings = {
    ...existing,
    ...incoming,
    smtp: incoming.smtp ? { ...existing?.smtp, ...incoming.smtp } : existing?.smtp,
    gmail: incoming.gmail ? { ...existing?.gmail, ...incoming.gmail } : existing?.gmail,
    outlook: incoming.outlook ? { ...existing?.outlook, ...incoming.outlook } : existing?.outlook,
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
  if (merged.gmail) {
    merged.gmail = encryptObject(
      merged.gmail as Record<string, string>
    ) as TenantEmailSettings['gmail'];
  }
  if (merged.outlook) {
    merged.outlook = encryptObject(
      merged.outlook as Record<string, string>
    ) as TenantEmailSettings['outlook'];
  }

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
