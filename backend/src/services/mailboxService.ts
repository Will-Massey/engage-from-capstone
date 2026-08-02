/**
 * Two-way firm mailbox.
 * - Stores threads as ActivityLog (EMAIL_INBOUND / EMAIL_OUTBOUND)
 * - Syncs from Gmail API or Microsoft Graph when OAuth tokens exist
 * - Compose/reply via tenantMailer (outbound always works when email is configured)
 */

import { google } from 'googleapis';
import { prisma } from '../config/database.js';
import { decrypt } from '../utils/encryption.js';
import logger from '../config/logger.js';
import { tenantMailerSend } from './tenantMailer.js';

export type MailboxMessage = {
  id: string;
  direction: 'inbound' | 'outbound';
  from: string;
  to: string;
  subject: string;
  body: string;
  at: string;
  read: boolean;
  clientId: string | null;
  clientName: string | null;
  externalId: string | null;
  threadKey: string;
  provider: string | null;
};

export type MailboxConnection = {
  connected: boolean;
  provider: string | null;
  user: string | null;
  mode: 'oauth' | 'platform' | 'local';
  canSync: boolean;
  canSend: boolean;
};

function parseSettings(raw: string | null | undefined): Record<string, any> {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

function parseMeta(raw: string | null | undefined): Record<string, any> {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

function threadKeyFor(from: string, to: string, subject: string): string {
  const norm = subject.replace(/^(re|fw|fwd):\s*/gi, '').trim().toLowerCase();
  const parties = [from, to].map((s) => s.toLowerCase().trim()).sort().join('|');
  return `${parties}::${norm.slice(0, 120)}`;
}

export async function getMailboxConnection(tenantId: string): Promise<MailboxConnection> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  const settings = parseSettings(tenant?.settings);
  const email = settings.email || {};
  const provider = email.provider as string | undefined;

  if (provider === 'gmail' && (email.gmail?.refreshToken || email.gmail?.user)) {
    return {
      connected: Boolean(email.gmail?.refreshToken),
      provider: 'gmail',
      user: email.gmail?.user || null,
      mode: 'oauth',
      canSync: Boolean(email.gmail?.refreshToken),
      canSend: true,
    };
  }

  if (
    (provider === 'outlook' || provider === 'microsoft365') &&
    (email.outlook?.refreshToken || email.microsoft365?.refreshToken)
  ) {
    const block = email.outlook || email.microsoft365 || {};
    return {
      connected: Boolean(block.refreshToken),
      provider: provider || 'microsoft365',
      user: block.user || null,
      mode: 'oauth',
      canSync: Boolean(block.refreshToken),
      canSend: true,
    };
  }

  if (provider === 'smtp' || email.smtp?.host) {
    return {
      connected: true,
      provider: 'smtp',
      user: email.fromEmail || email.smtp?.user || null,
      mode: 'platform',
      canSync: false,
      canSend: true,
    };
  }

  // Platform Cloudflare/SendGrid may still send
  return {
    connected: false,
    provider: null,
    user: null,
    mode: 'local',
    canSync: false,
    canSend: true, // try platform send
  };
}

async function matchClientByEmail(
  tenantId: string,
  address: string
): Promise<{ id: string; name: string } | null> {
  const email = address.toLowerCase().replace(/.*<|>.*/g, '').trim();
  if (!email.includes('@')) return null;
  const client = await prisma.client.findFirst({
    where: {
      tenantId,
      isActive: true,
      contactEmail: { equals: email, mode: 'insensitive' },
    },
    select: { id: true, name: true },
  });
  return client;
}

async function upsertMailboxActivity(params: {
  tenantId: string;
  direction: 'inbound' | 'outbound';
  from: string;
  to: string;
  subject: string;
  body: string;
  externalId?: string | null;
  at?: Date;
  provider?: string | null;
  clientId?: string | null;
  userId?: string | null;
}): Promise<string> {
  const action = params.direction === 'inbound' ? 'EMAIL_INBOUND' : 'EMAIL_OUTBOUND';

  if (params.externalId) {
    const existing = await prisma.activityLog.findFirst({
      where: {
        tenantId: params.tenantId,
        action,
        metadata: { contains: params.externalId },
      },
      select: { id: true },
    });
    if (existing) return existing.id;
  }

  let clientId = params.clientId || null;
  let clientName: string | null = null;
  const matchAddr = params.direction === 'inbound' ? params.from : params.to;
  if (!clientId) {
    const c = await matchClientByEmail(params.tenantId, matchAddr);
    if (c) {
      clientId = c.id;
      clientName = c.name;
    }
  } else {
    const c = await prisma.client.findFirst({
      where: { id: clientId, tenantId: params.tenantId },
      select: { name: true },
    });
    clientName = c?.name || null;
  }

  const threadKey = threadKeyFor(params.from, params.to, params.subject);
  const row = await prisma.activityLog.create({
    data: {
      tenantId: params.tenantId,
      action,
      entityType: clientId ? 'CLIENT' : 'Mailbox',
      entityId: clientId,
      description: params.subject.slice(0, 500),
      metadata: JSON.stringify({
        direction: params.direction,
        from: params.from,
        to: params.to,
        subject: params.subject,
        body: params.body.slice(0, 20000),
        externalId: params.externalId || null,
        threadKey,
        read: params.direction === 'outbound',
        provider: params.provider || null,
        clientName,
      }),
      userId: params.userId || null,
      createdAt: params.at || new Date(),
    },
  });
  return row.id;
}

function rowToMessage(
  row: {
    id: string;
    action: string;
    description: string | null;
    metadata: string;
    createdAt: Date;
    entityId: string | null;
  },
  clientNameMap: Map<string, string>
): MailboxMessage {
  const m = parseMeta(row.metadata);
  const clientId = row.entityId;
  return {
    id: row.id,
    direction: m.direction === 'outbound' || row.action === 'EMAIL_OUTBOUND' ? 'outbound' : 'inbound',
    from: String(m.from || ''),
    to: String(m.to || ''),
    subject: String(m.subject || row.description || ''),
    body: String(m.body || ''),
    at: row.createdAt.toISOString(),
    read: m.read === true,
    clientId,
    clientName:
      (typeof m.clientName === 'string' && m.clientName) ||
      (clientId ? clientNameMap.get(clientId) || null : null),
    externalId: m.externalId ? String(m.externalId) : null,
    threadKey: String(m.threadKey || threadKeyFor(String(m.from || ''), String(m.to || ''), String(m.subject || ''))),
    provider: m.provider ? String(m.provider) : null,
  };
}

export async function listMailboxMessages(
  tenantId: string,
  opts: { limit?: number; q?: string; unreadOnly?: boolean } = {}
): Promise<MailboxMessage[]> {
  const limit = Math.min(opts.limit || 80, 150);
  const rows = await prisma.activityLog.findMany({
    where: {
      tenantId,
      action: { in: ['EMAIL_INBOUND', 'EMAIL_OUTBOUND'] },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  const clientIds = [...new Set(rows.map((r) => r.entityId).filter(Boolean) as string[])];
  const clients =
    clientIds.length > 0
      ? await prisma.client.findMany({
          where: { tenantId, id: { in: clientIds } },
          select: { id: true, name: true },
        })
      : [];
  const cmap = new Map(clients.map((c) => [c.id, c.name]));

  let messages = rows.map((r) => rowToMessage(r, cmap));
  if (opts.unreadOnly) {
    messages = messages.filter((m) => m.direction === 'inbound' && !m.read);
  }
  if (opts.q) {
    const q = opts.q.toLowerCase();
    messages = messages.filter(
      (m) =>
        m.subject.toLowerCase().includes(q) ||
        m.body.toLowerCase().includes(q) ||
        m.from.toLowerCase().includes(q) ||
        m.to.toLowerCase().includes(q) ||
        (m.clientName || '').toLowerCase().includes(q)
    );
  }
  return messages;
}

async function getGmailAccess(tenantId: string): Promise<{
  accessToken: string;
  user: string;
} | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  const email = parseSettings(tenant?.settings).email || {};
  const g = email.gmail;
  if (!g?.refreshToken) return null;

  const clientId = g.clientId || process.env.GMAIL_CLIENT_ID || '';
  const clientSecret = g.clientSecret
    ? decrypt(g.clientSecret) || g.clientSecret
    : process.env.GMAIL_CLIENT_SECRET || '';
  const refreshToken = decrypt(g.refreshToken) || g.refreshToken;

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth2Client.refreshAccessToken();
  if (!credentials.access_token) return null;
  return { accessToken: credentials.access_token, user: g.user || 'me' };
}

async function getMicrosoftAccess(tenantId: string): Promise<{
  accessToken: string;
  user: string;
} | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  const email = parseSettings(tenant?.settings).email || {};
  const block = email.outlook || email.microsoft365;
  if (!block?.refreshToken) return null;

  const clientId = block.clientId || process.env.MICROSOFT_CLIENT_ID || '';
  const clientSecret = block.clientSecret
    ? decrypt(block.clientSecret) || block.clientSecret
    : process.env.MICROSOFT_CLIENT_SECRET || '';
  const refreshToken = decrypt(block.refreshToken) || block.refreshToken;

  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: 'https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send offline_access User.Read',
    }),
  });
  if (!res.ok) {
    logger.warn(`Microsoft token refresh failed: ${res.status}`);
    return null;
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) return null;
  return { accessToken: data.access_token, user: block.user || '' };
}

async function syncGmail(tenantId: string): Promise<number> {
  const auth = await getGmailAccess(tenantId);
  if (!auth) return 0;

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: auth.accessToken });
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const list = await gmail.users.messages.list({
    userId: 'me',
    maxResults: 25,
    q: 'in:inbox newer_than:30d',
  });

  let imported = 0;
  for (const msg of list.data.messages || []) {
    if (!msg.id) continue;
    const full = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id,
      format: 'full',
    });
    const headers = full.data.payload?.headers || [];
    const getH = (n: string) =>
      headers.find((h) => h.name?.toLowerCase() === n.toLowerCase())?.value || '';
    const subject = getH('Subject') || '(no subject)';
    const from = getH('From') || '';
    const to = getH('To') || auth.user;
    let body = full.data.snippet || '';
    const parts = full.data.payload?.parts || [];
    const textPart = parts.find((p) => p.mimeType === 'text/plain');
    if (textPart?.body?.data) {
      body = Buffer.from(textPart.body.data, 'base64url').toString('utf8');
    } else if (full.data.payload?.body?.data) {
      body = Buffer.from(full.data.payload.body.data, 'base64url').toString('utf8');
    }

    const id = await upsertMailboxActivity({
      tenantId,
      direction: 'inbound',
      from,
      to,
      subject,
      body,
      externalId: `gmail:${msg.id}`,
      at: full.data.internalDate
        ? new Date(Number(full.data.internalDate))
        : new Date(),
      provider: 'gmail',
    });
    if (id) imported++;
  }
  return imported;
}

async function syncMicrosoft(tenantId: string): Promise<number> {
  const auth = await getMicrosoftAccess(tenantId);
  if (!auth) return 0;

  const res = await fetch(
    'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=25&$select=id,subject,from,toRecipients,bodyPreview,body,receivedDateTime,isRead',
    { headers: { Authorization: `Bearer ${auth.accessToken}` } }
  );
  if (!res.ok) {
    logger.warn(`Graph mail list failed: ${res.status}`);
    return 0;
  }
  const data = (await res.json()) as {
    value?: Array<{
      id: string;
      subject?: string;
      from?: { emailAddress?: { address?: string; name?: string } };
      toRecipients?: Array<{ emailAddress?: { address?: string } }>;
      bodyPreview?: string;
      body?: { content?: string };
      receivedDateTime?: string;
    }>;
  };

  let imported = 0;
  for (const msg of data.value || []) {
    const from =
      msg.from?.emailAddress?.name && msg.from?.emailAddress?.address
        ? `${msg.from.emailAddress.name} <${msg.from.emailAddress.address}>`
        : msg.from?.emailAddress?.address || '';
    const to =
      msg.toRecipients?.map((t) => t.emailAddress?.address).filter(Boolean).join(', ') ||
      auth.user;
    await upsertMailboxActivity({
      tenantId,
      direction: 'inbound',
      from,
      to,
      subject: msg.subject || '(no subject)',
      body: msg.body?.content || msg.bodyPreview || '',
      externalId: `ms:${msg.id}`,
      at: msg.receivedDateTime ? new Date(msg.receivedDateTime) : new Date(),
      provider: 'microsoft365',
    });
    imported++;
  }
  return imported;
}

/** Seed demo inbound messages from clients when no OAuth (so two-way UI is usable in practice clone). */
async function seedLocalInboundIfEmpty(tenantId: string): Promise<number> {
  const count = await prisma.activityLog.count({
    where: { tenantId, action: { in: ['EMAIL_INBOUND', 'EMAIL_OUTBOUND'] } },
  });
  if (count > 0) return 0;

  const clients = await prisma.client.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true, contactEmail: true, contactName: true },
    take: 5,
    orderBy: { updatedAt: 'desc' },
  });
  if (!clients.length) return 0;

  let n = 0;
  for (const c of clients.slice(0, 3)) {
    await upsertMailboxActivity({
      tenantId,
      direction: 'inbound',
      from: `${c.contactName || c.name} <${c.contactEmail}>`,
      to: 'practice@engage.local',
      subject: `Re: Records for ${c.name}`,
      body: `Hi,\n\nJust checking you received everything for ${c.name}. Happy to upload more via the portal if needed.\n\nThanks,\n${c.contactName || c.name}`,
      externalId: `local-seed:${c.id}:records`,
      clientId: c.id,
      provider: 'local',
    });
    n++;
  }
  return n;
}

export async function syncMailbox(tenantId: string): Promise<{
  imported: number;
  provider: string | null;
  mode: string;
  message: string;
}> {
  const conn = await getMailboxConnection(tenantId);

  if (conn.provider === 'gmail' && conn.canSync) {
    try {
      const imported = await syncGmail(tenantId);
      return {
        imported,
        provider: 'gmail',
        mode: 'oauth',
        message: `Synced ${imported} messages from Gmail`,
      };
    } catch (e: any) {
      logger.warn(`Gmail sync failed: ${e?.message}`);
      return {
        imported: 0,
        provider: 'gmail',
        mode: 'oauth',
        message: `Gmail sync failed: ${e?.message || 'unknown error'}`,
      };
    }
  }

  if (
    (conn.provider === 'microsoft365' || conn.provider === 'outlook') &&
    conn.canSync
  ) {
    try {
      const imported = await syncMicrosoft(tenantId);
      return {
        imported,
        provider: conn.provider,
        mode: 'oauth',
        message: `Synced ${imported} messages from Microsoft 365`,
      };
    } catch (e: any) {
      logger.warn(`MS sync failed: ${e?.message}`);
      return {
        imported: 0,
        provider: conn.provider,
        mode: 'oauth',
        message: `Microsoft sync failed: ${e?.message || 'unknown error'}`,
      };
    }
  }

  const seeded = await seedLocalInboundIfEmpty(tenantId);
  return {
    imported: seeded,
    provider: null,
    mode: 'local',
    message:
      seeded > 0
        ? `Local mailbox ready — ${seeded} client threads seeded (connect Gmail/M365 in Settings for live two-way sync)`
        : 'Local mailbox — connect Gmail or Microsoft 365 in Settings for live sync. Compose still sends via platform email.',
  };
}

export async function sendMailboxMessage(params: {
  tenantId: string;
  userId?: string | null;
  to: string;
  subject: string;
  body: string;
  clientId?: string | null;
  inReplyToId?: string | null;
}): Promise<{ id: string; sent: boolean; error?: string }> {
  let subject = params.subject;
  let to = params.to;
  let clientId = params.clientId || null;

  if (params.inReplyToId) {
    const prev = await prisma.activityLog.findFirst({
      where: {
        id: params.inReplyToId,
        tenantId: params.tenantId,
        action: { in: ['EMAIL_INBOUND', 'EMAIL_OUTBOUND'] },
      },
    });
    if (prev) {
      const m = parseMeta(prev.metadata);
      const replyTo = m.direction === 'inbound' ? m.from : m.to;
      to = String(replyTo || to);
      const base = String(m.subject || prev.description || subject);
      subject = base.match(/^re:/i) ? base : `Re: ${base}`;
      if (!clientId && prev.entityId) clientId = prev.entityId;
    }
  }

  // Resolve firm from address for outbound "from"
  const tenant = await prisma.tenant.findUnique({
    where: { id: params.tenantId },
    select: { name: true, settings: true },
  });
  const emailCfg = parseSettings(tenant?.settings).email || {};
  const fromAddr =
    emailCfg.fromEmail ||
    emailCfg.gmail?.user ||
    emailCfg.outlook?.user ||
    'noreply@engage.local';

  let sent = false;
  let error: string | undefined;
  try {
    const result = await tenantMailerSend({
      tenantId: params.tenantId,
      messageType: 'OTHER',
      message: {
        to,
        subject,
        text: params.body,
        html: `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${params.body
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')}</pre>`,
      },
      relatedIds: clientId ? { clientId } : undefined,
    });
    sent = result.success;
    if (!result.success) error = result.error || 'Send failed';
  } catch (e: any) {
    error = e?.message || 'Send failed';
    // Still store as outbound draft-like for two-way history in local mode
  }

  const id = await upsertMailboxActivity({
    tenantId: params.tenantId,
    direction: 'outbound',
    from: fromAddr,
    to,
    subject,
    body: params.body,
    externalId: sent ? `out:${Date.now()}` : `out-local:${Date.now()}`,
    clientId,
    userId: params.userId,
    provider: sent ? emailCfg.provider || 'platform' : 'local',
  });

  return { id, sent, error };
}

export async function markMailboxRead(
  tenantId: string,
  messageId: string
): Promise<boolean> {
  const row = await prisma.activityLog.findFirst({
    where: {
      id: messageId,
      tenantId,
      action: { in: ['EMAIL_INBOUND', 'EMAIL_OUTBOUND'] },
    },
  });
  if (!row) return false;
  const m = parseMeta(row.metadata);
  m.read = true;
  await prisma.activityLog.update({
    where: { id: row.id },
    data: { metadata: JSON.stringify(m) },
  });
  return true;
}
