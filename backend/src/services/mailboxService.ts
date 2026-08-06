/**
 * Two-way firm mailbox — MailMessage-backed storage + orchestration.
 *
 * Sync pulls inbox+sent deltas from the provider client (Graph or Gmail,
 * selected from tenant.settings.email.provider), upserts MailMessage rows by
 * (tenantId, provider, externalId), and auto-links clientId by email match.
 * Compose/reply sends via the provider client when connected, falling back to
 * tenantMailerSend (platform email) when not — either way an OUTBOUND
 * MailMessage row is always written for two-way history.
 *
 * A handful of exports also carry a *legacy* call shape (old positional args
 * / old field names) purely so `backend/src/routes/comms.ts` — which Task 5
 * rewrites — keeps compiling and working against the old ActivityLog-era
 * contract until then. Those shims are called out below; new code should use
 * the brief-binding shapes only.
 */

import { randomUUID } from 'crypto';
import type { EmailProvider } from '@prisma/client';
import { prisma } from '../config/database.js';
import logger from '../config/logger.js';
import { tenantMailerSend } from './tenantMailer.js';
import { loadTenantEmailContext } from './tenantEmailSettings.js';
import { createGraphMailClient } from './mail/graphMailClient.js';
import { createGmailMailClient } from './mail/gmailMailClient.js';
import type { MailProviderClient, ProviderMessage } from './mail/types.js';

// ==================== Shared DTO ====================

export type MailAttachmentDto = {
  id: string;
  externalId: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  isInline: boolean;
};

export type MailMessageDto = {
  id: string;
  provider: string;
  direction: 'inbound' | 'outbound';
  from: string;
  to: string;
  cc: string | null;
  subject: string;
  body: string;
  bodyHtml: string | null;
  at: string;
  read: boolean;
  hasAttachments: boolean;
  clientId: string | null;
  clientName: string | null;
  conversationId: string | null;
  externalId: string;
  attachments: MailAttachmentDto[];
};

type MailMessageRow = {
  id: string;
  provider: EmailProvider;
  externalId: string;
  conversationId: string | null;
  internetMessageId: string | null;
  direction: 'INBOUND' | 'OUTBOUND';
  fromAddress: string;
  toAddresses: string;
  ccAddresses: string | null;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  isRead: boolean;
  hasAttachments: boolean;
  receivedAt: Date;
  clientId: string | null;
  attachments?: MailAttachmentDto[];
};

function toDto(row: MailMessageRow, clientNames: Map<string, string>): MailMessageDto {
  return {
    id: row.id,
    provider: row.provider,
    direction: row.direction === 'INBOUND' ? 'inbound' : 'outbound',
    from: row.fromAddress,
    to: row.toAddresses,
    cc: row.ccAddresses,
    subject: row.subject,
    body: row.bodyText,
    bodyHtml: row.bodyHtml,
    at: row.receivedAt.toISOString(),
    read: row.isRead,
    hasAttachments: row.hasAttachments,
    clientId: row.clientId,
    clientName: row.clientId ? clientNames.get(row.clientId) || null : null,
    conversationId: row.conversationId,
    externalId: row.externalId,
    attachments: (row.attachments || []).map((a) => ({
      id: a.id,
      externalId: a.externalId,
      name: a.name,
      contentType: a.contentType,
      sizeBytes: a.sizeBytes,
      isInline: a.isInline,
    })),
  };
}

async function attachClientNames(
  rows: { clientId: string | null }[],
  tenantId: string
): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => r.clientId).filter(Boolean) as string[])];
  if (!ids.length) return new Map();
  const clients = await prisma.client.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true, name: true },
  });
  return new Map(clients.map((c) => [c.id, c.name]));
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function extractFirstEmail(raw: string): string | null {
  const first = (raw || '').split(',')[0] || '';
  const email = first
    .replace(/.*<|>.*/g, '')
    .trim()
    .toLowerCase();
  return email.includes('@') ? email : null;
}

async function matchClientByEmail(
  tenantId: string,
  address: string
): Promise<{ id: string; name: string } | null> {
  const email = extractFirstEmail(address);
  if (!email) return null;
  return prisma.client.findFirst({
    where: { tenantId, isActive: true, contactEmail: { equals: email, mode: 'insensitive' } },
    select: { id: true, name: true },
  });
}

/** settings.email.provider may be stored lower/mixed-case — normalise to the two-way-capable set. */
export function normalizeMailProvider(raw: string | undefined | null): 'GMAIL' | 'OUTLOOK' | 'MICROSOFT365' | null {
  const p = (raw || '').toLowerCase();
  if (p === 'gmail') return 'GMAIL';
  if (p === 'outlook') return 'OUTLOOK';
  if (p === 'microsoft365' || p === 'microsoft_365' || p === 'ms365') return 'MICROSOFT365';
  return null;
}

async function buildProviderClient(
  tenantId: string,
  provider: 'GMAIL' | 'OUTLOOK' | 'MICROSOFT365' | null
): Promise<MailProviderClient | null> {
  if (provider === 'GMAIL') return createGmailMailClient(tenantId);
  if (provider === 'OUTLOOK' || provider === 'MICROSOFT365') return createGraphMailClient(tenantId);
  return null;
}

// ==================== getMailboxConnection ====================

export async function getMailboxConnection(tenantId: string): Promise<{
  provider: string | null;
  user: string | null;
  health: { lastSyncAt: string | null; lastSyncOk: boolean | null; lastSyncError: string | null };
}> {
  const ctx = await loadTenantEmailContext(tenantId);
  const email = ctx?.email || {};
  const normalized = normalizeMailProvider(email.provider);

  let provider: string | null = null;
  let user: string | null = null;
  if (normalized === 'GMAIL' && email.gmail?.refreshToken) {
    provider = 'GMAIL';
    user = email.gmail.user || null;
  } else if ((normalized === 'OUTLOOK' || normalized === 'MICROSOFT365') && email.outlook?.refreshToken) {
    provider = normalized;
    user = email.outlook.user || null;
  }

  const syncState = await prisma.mailboxSyncState.findUnique({ where: { tenantId } });
  return {
    provider,
    user,
    health: {
      lastSyncAt: syncState?.lastSyncAt ? syncState.lastSyncAt.toISOString() : null,
      lastSyncOk: syncState?.lastSyncOk ?? null,
      lastSyncError: syncState?.lastSyncError ?? null,
    },
  };
}

// ==================== syncMailbox ====================

/** Seed demo inbound messages from clients when no provider connected — dev only, never production. */
export async function seedDevInboundIfEmpty(tenantId: string): Promise<number> {
  if (process.env.NODE_ENV === 'production') return 0;

  const count = await prisma.mailMessage.count({ where: { tenantId } });
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
    await prisma.mailMessage.create({
      data: {
        tenantId,
        provider: 'SMTP',
        externalId: `local-seed:${c.id}:records`,
        conversationId: `local:${randomUUID()}`,
        direction: 'INBOUND',
        fromAddress: `${c.contactName || c.name} <${c.contactEmail}>`,
        toAddresses: 'practice@engage.local',
        subject: `Re: Records for ${c.name}`,
        bodyText: `Hi,\n\nJust checking you received everything for ${c.name}. Happy to upload more via the portal if needed.\n\nThanks,\n${c.contactName || c.name}`,
        snippet: `Just checking you received everything for ${c.name}.`,
        isRead: false,
        hasAttachments: false,
        receivedAt: new Date(),
        clientId: c.id,
      },
    });
    n++;
  }
  return n;
}

async function upsertProviderMessage(
  tenantId: string,
  provider: EmailProvider,
  pm: ProviderMessage
): Promise<'created' | 'updated'> {
  const existing = await prisma.mailMessage.findUnique({
    where: { tenantId_provider_externalId: { tenantId, provider, externalId: pm.externalId } },
    select: { id: true, clientId: true },
  });

  let clientId = existing?.clientId ?? null;
  if (!clientId) {
    const matchAddr = pm.direction === 'INBOUND' ? pm.from : pm.to;
    const match = await matchClientByEmail(tenantId, matchAddr);
    clientId = match?.id ?? null;
  }

  const data = {
    provider,
    externalId: pm.externalId,
    conversationId: pm.conversationId || pm.externalId,
    internetMessageId: pm.internetMessageId || null,
    direction: pm.direction,
    fromAddress: pm.from,
    toAddresses: pm.to,
    ccAddresses: pm.cc || null,
    subject: pm.subject,
    bodyText: pm.bodyText,
    bodyHtml: pm.bodyHtml || null,
    snippet: pm.bodyText.slice(0, 280),
    isRead: pm.isRead,
    hasAttachments: pm.hasAttachments,
    receivedAt: pm.receivedAt,
    clientId,
  };

  if (existing) {
    await prisma.mailMessage.update({ where: { id: existing.id }, data });
    // Reconcile idempotently: drop and rewrite the attachment set for this
    // message so a re-sync never accumulates duplicate rows.
    await prisma.mailAttachment.deleteMany({ where: { messageId: existing.id } });
    await createAttachmentRows(existing.id, pm.attachments);
    return 'updated';
  }
  const created = await prisma.mailMessage.create({ data: { ...data, tenantId } });
  await createAttachmentRows(created.id, pm.attachments);
  return 'created';
}

async function createAttachmentRows(
  messageId: string,
  attachments: ProviderMessage['attachments']
): Promise<void> {
  if (!attachments?.length) return;
  await prisma.mailAttachment.createMany({
    data: attachments.map((a) => ({
      messageId,
      externalId: a.externalId,
      name: a.name,
      contentType: a.contentType,
      sizeBytes: a.sizeBytes,
      isInline: a.isInline,
    })),
  });
}

export async function syncMailbox(tenantId: string): Promise<{
  imported: number;
  updated: number;
  ok: boolean;
  error?: string;
  /** extra, non-binding field kept for the pre-Task-5 comms.ts `.message` read */
  message: string;
}> {
  const ctx = await loadTenantEmailContext(tenantId);
  const normalized = normalizeMailProvider(ctx?.email.provider);
  const providerClient = await buildProviderClient(tenantId, normalized);

  if (!providerClient) {
    const seeded = await seedDevInboundIfEmpty(tenantId);
    return {
      imported: seeded,
      updated: 0,
      ok: false,
      error: 'NOT_CONNECTED',
      message:
        seeded > 0
          ? `Local mailbox ready — ${seeded} client threads seeded (connect Gmail/M365 in Settings for live two-way sync)`
          : 'Mailbox not connected — connect Gmail or Microsoft 365 in Settings for live sync.',
    };
  }

  const provider = normalized as EmailProvider;
  const syncState = await prisma.mailboxSyncState.findUnique({ where: { tenantId } });

  let imported = 0;
  let updated = 0;
  try {
    const [inboxPage, sentPage] = await Promise.all([
      providerClient.syncInbox(syncState?.inboxDeltaLink ?? null),
      providerClient.syncSent(syncState?.sentDeltaLink ?? null),
    ]);

    for (const pm of [...inboxPage.messages, ...sentPage.messages]) {
      const result = await upsertProviderMessage(tenantId, provider, pm);
      if (result === 'created') imported++;
      else updated++;
    }

    await prisma.mailboxSyncState.upsert({
      where: { tenantId },
      create: {
        tenantId,
        provider,
        inboxDeltaLink: inboxPage.deltaLink,
        sentDeltaLink: sentPage.deltaLink,
        lastSyncAt: new Date(),
        lastSyncOk: true,
        lastSyncError: null,
      },
      update: {
        provider,
        inboxDeltaLink: inboxPage.deltaLink,
        sentDeltaLink: sentPage.deltaLink,
        lastSyncAt: new Date(),
        lastSyncOk: true,
        lastSyncError: null,
      },
    });

    return { imported, updated, ok: true, message: `Synced ${imported} new, ${updated} updated` };
  } catch (e: any) {
    const errorMsg = e?.message || 'Sync failed';
    logger.warn(`Mailbox sync failed for tenant ${tenantId}: ${errorMsg}`);
    await prisma.mailboxSyncState
      .upsert({
        where: { tenantId },
        create: { tenantId, provider, lastSyncAt: new Date(), lastSyncOk: false, lastSyncError: errorMsg },
        update: { lastSyncAt: new Date(), lastSyncOk: false, lastSyncError: errorMsg },
      })
      .catch(() => {});
    return { imported, updated, ok: false, error: errorMsg, message: `Sync failed: ${errorMsg}` };
  }
}

// ==================== listMailboxMessages ====================

export type MailboxListOpts = {
  q?: string;
  unread?: boolean;
  clientId?: string;
  limit?: number;
  cursor?: string;
  /** @deprecated legacy alias for `unread` — kept for pre-Task-5 comms.ts compatibility */
  unreadOnly?: boolean;
};

/**
 * The real return value is a plain array carrying two extra properties
 * (`messages`, `nextCursor`) so it satisfies both:
 *  - the brief-binding shape `{ messages, nextCursor }` Task 5 will consume
 *  - the legacy `MailMessageDto[]` shape comms.ts/clara.ts already consume
 *    (`.filter`, `.find`, `.length`, etc.) without touching those files.
 * Drop this shim once comms.ts is rewritten in Task 5.
 */
export type MailboxMessagesResult = MailMessageDto[] & {
  messages: MailMessageDto[];
  nextCursor: string | null;
};

export async function listMailboxMessages(
  tenantId: string,
  opts: MailboxListOpts = {}
): Promise<MailboxMessagesResult> {
  const limit = Math.min(Math.max(opts.limit || 50, 1), 150);
  const unread = opts.unread ?? opts.unreadOnly;

  const where: Record<string, unknown> = { tenantId };
  if (unread) where.isRead = false;
  if (opts.clientId) where.clientId = opts.clientId;
  if (opts.q) {
    where.OR = [
      { subject: { contains: opts.q, mode: 'insensitive' } },
      { fromAddress: { contains: opts.q, mode: 'insensitive' } },
      { bodyText: { contains: opts.q, mode: 'insensitive' } },
    ];
  }

  const rows = await prisma.mailMessage.findMany({
    where,
    orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: { attachments: true },
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const clientNames = await attachClientNames(page, tenantId);
  const messages = page.map((r) => toDto(r, clientNames));
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  const result = messages as MailboxMessagesResult;
  result.messages = messages;
  result.nextCursor = nextCursor;
  return result;
}

// ==================== getThread ====================

export async function getThread(tenantId: string, messageId: string): Promise<MailMessageDto[]> {
  const anchor = await prisma.mailMessage.findFirst({
    where: { id: messageId, tenantId },
    select: { conversationId: true },
  });
  if (!anchor) return [];

  const rows = await prisma.mailMessage.findMany({
    where: { tenantId, conversationId: anchor.conversationId },
    orderBy: { receivedAt: 'asc' },
    include: { attachments: true },
  });
  const clientNames = await attachClientNames(rows, tenantId);
  return rows.map((r) => toDto(r, clientNames));
}

// ==================== sendMailboxMessage ====================

export interface SendMailboxSpec {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  replyToMessageId?: string;
}

interface LegacySendParams {
  tenantId: string;
  userId?: string | null;
  to: string;
  subject: string;
  body: string;
  clientId?: string | null;
  inReplyToId?: string | null;
}

async function sendMailboxMessageInternal(
  tenantId: string,
  userId: string | null | undefined,
  spec: SendMailboxSpec,
  clientIdOverride?: string | null
): Promise<{ dto: MailMessageDto; sent: boolean; error?: string }> {
  const repliedTo = spec.replyToMessageId
    ? await prisma.mailMessage.findFirst({
        where: { id: spec.replyToMessageId, tenantId },
        select: { externalId: true, internetMessageId: true, conversationId: true, clientId: true },
      })
    : null;

  const ctx = await loadTenantEmailContext(tenantId);
  const email = ctx?.email || {};
  const fromAddr = email.fromEmail || email.gmail?.user || email.outlook?.user || 'noreply@engage.local';
  const normalized = normalizeMailProvider(email.provider);
  const providerClient = await buildProviderClient(tenantId, normalized);

  const conversationId = repliedTo?.conversationId || `local:${randomUUID()}`;

  let clientId = clientIdOverride ?? repliedTo?.clientId ?? null;
  if (!clientId) {
    const match = await matchClientByEmail(tenantId, spec.to);
    clientId = match?.id ?? null;
  }

  let provider: EmailProvider;
  let externalId: string;
  let sent = true;
  let error: string | undefined;

  if (providerClient && normalized) {
    provider = normalized;
    try {
      const result = await providerClient.send({
        to: [spec.to],
        cc: spec.cc ? [spec.cc] : undefined,
        subject: spec.subject,
        bodyText: spec.body,
        replyToExternalId: repliedTo?.externalId,
        inReplyToInternetMessageId: repliedTo?.internetMessageId || undefined,
      });
      externalId = result.externalId || randomUUID();
    } catch (e: any) {
      sent = false;
      error = e?.message || 'Send failed';
      externalId = randomUUID();
    }
  } else {
    provider = 'SMTP';
    externalId = randomUUID();
    const result = await tenantMailerSend({
      tenantId,
      messageType: 'OTHER',
      message: {
        to: spec.to,
        cc: spec.cc,
        subject: spec.subject,
        text: spec.body,
        html: `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${escapeHtml(spec.body)}</pre>`,
      },
      relatedIds: clientId ? { clientId } : undefined,
    });
    sent = result.success;
    if (!result.success) error = result.error || 'Send failed';
  }

  const row = await prisma.mailMessage.create({
    data: {
      tenantId,
      provider,
      externalId,
      conversationId,
      internetMessageId: null,
      direction: 'OUTBOUND',
      fromAddress: fromAddr,
      toAddresses: spec.to,
      ccAddresses: spec.cc || null,
      subject: spec.subject,
      bodyText: spec.body,
      bodyHtml: null,
      snippet: spec.body.slice(0, 280),
      isRead: true,
      hasAttachments: false,
      receivedAt: new Date(),
      clientId,
    },
  });

  const clientNames = clientId ? await attachClientNames([row], tenantId) : new Map<string, string>();
  return { dto: toDto(row, clientNames), sent, error };
}

export function sendMailboxMessage(
  tenantId: string,
  userId: string | null | undefined,
  spec: SendMailboxSpec
): Promise<MailMessageDto>;
export function sendMailboxMessage(
  params: LegacySendParams
): Promise<{ id: string; sent: boolean; error?: string }>;
export async function sendMailboxMessage(a: any, b?: any, c?: any): Promise<any> {
  if (typeof a === 'object' && a !== null) {
    const params = a as LegacySendParams;
    const { dto, sent, error } = await sendMailboxMessageInternal(
      params.tenantId,
      params.userId ?? null,
      {
        to: params.to,
        subject: params.subject,
        body: params.body,
        replyToMessageId: params.inReplyToId || undefined,
      },
      params.clientId ?? null
    );
    return { id: dto.id, sent, error };
  }
  const { dto } = await sendMailboxMessageInternal(a as string, b, c as SendMailboxSpec);
  return dto;
}

// ==================== markMailboxRead ====================

async function markMailboxReadCore(tenantId: string, messageId: string, read: boolean): Promise<void> {
  const row = await prisma.mailMessage.findFirst({
    where: { id: messageId, tenantId },
    select: { id: true, provider: true, externalId: true },
  });
  if (!row) throw new Error('MESSAGE_NOT_FOUND');

  await prisma.mailMessage.update({ where: { id: row.id }, data: { isRead: read } });

  try {
    const ctx = await loadTenantEmailContext(tenantId);
    const normalized = normalizeMailProvider(ctx?.email.provider);
    const providerClient = await buildProviderClient(tenantId, normalized);
    if (providerClient) await providerClient.markRead(row.externalId, read);
  } catch (e: any) {
    logger.warn(`Mailbox markRead provider write-back failed for tenant ${tenantId}: ${e?.message}`);
  }
}

export function markMailboxRead(tenantId: string, messageId: string): Promise<boolean>;
export function markMailboxRead(tenantId: string, messageId: string, read: boolean): Promise<void>;
export async function markMailboxRead(
  tenantId: string,
  messageId: string,
  read?: boolean
): Promise<boolean | void> {
  if (read === undefined) {
    try {
      await markMailboxReadCore(tenantId, messageId, true);
      return true;
    } catch (e: any) {
      if (e?.message === 'MESSAGE_NOT_FOUND') return false;
      throw e;
    }
  }
  return markMailboxReadCore(tenantId, messageId, read);
}

// ==================== linkMessageClient ====================

async function linkMessageClientInternal(
  tenantId: string,
  messageId: string,
  clientId: string
): Promise<{ updated: number; clientName: string | null }> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId },
    select: { id: true, name: true },
  });
  if (!client) throw new Error('CLIENT_NOT_FOUND');

  const msg = await prisma.mailMessage.findFirst({
    where: { id: messageId, tenantId },
    select: { id: true, conversationId: true },
  });
  if (!msg) throw new Error('MESSAGE_NOT_FOUND');

  const result = await prisma.mailMessage.updateMany({
    where: { tenantId, conversationId: msg.conversationId },
    data: { clientId: client.id },
  });

  return { updated: result.count, clientName: client.name };
}

/** Sets clientId on ALL messages in the conversation. */
export async function linkMessageClient(
  tenantId: string,
  messageId: string,
  clientId: string
): Promise<void> {
  await linkMessageClientInternal(tenantId, messageId, clientId);
}

/** @deprecated legacy shape kept for pre-Task-5 comms.ts compatibility — use linkMessageClient. */
export async function linkMailboxMessageToClient(params: {
  tenantId: string;
  messageId: string;
  clientId: string;
}): Promise<{ updated: number; clientName: string | null }> {
  return linkMessageClientInternal(params.tenantId, params.messageId, params.clientId);
}

// ==================== getMailboxUnreadCount ====================

export async function getMailboxUnreadCount(tenantId: string): Promise<number> {
  return prisma.mailMessage.count({ where: { tenantId, direction: 'INBOUND', isRead: false } });
}

/** @deprecated legacy name kept for pre-Task-5 comms.ts compatibility — use getMailboxUnreadCount. */
export const countUnreadMailbox = getMailboxUnreadCount;

// ==================== getMessageContext ====================

export type MessageContext = {
  message: MailMessageDto | null;
  client: {
    id: string;
    name: string;
    contactName: string | null;
    contactEmail: string;
    portalToken: string | null;
    portalEnabled: boolean;
  } | null;
  jobs: { id: string; reference: string; title: string; boardColumn: string; dueAt: Date | null }[];
  pendingForms: Awaited<ReturnType<typeof import('./practiceFormsService.js').listAssignments>>;
};

export async function getMessageContext(tenantId: string, messageId: string): Promise<MessageContext> {
  const row = await prisma.mailMessage.findFirst({
    where: { id: messageId, tenantId },
    include: { attachments: true },
  });
  if (!row) return { message: null, client: null, jobs: [], pendingForms: [] };

  let clientId = row.clientId;
  if (!clientId) {
    const addr = row.direction === 'INBOUND' ? row.fromAddress : row.toAddresses;
    const match = await matchClientByEmail(tenantId, addr);
    clientId = match?.id ?? null;
  }

  const clientNames = clientId ? await attachClientNames([{ clientId }], tenantId) : new Map<string, string>();
  const message = toDto(row, clientNames);

  const client = clientId
    ? await prisma.client.findFirst({
        where: { id: clientId, tenantId },
        select: {
          id: true,
          name: true,
          contactName: true,
          contactEmail: true,
          portalToken: true,
          portalEnabled: true,
        },
      })
    : null;

  const jobs = clientId
    ? await prisma.job.findMany({
        where: { tenantId, clientId, isActive: true, boardColumn: { not: 'COMPLETE' } },
        select: { id: true, reference: true, title: true, boardColumn: true, dueAt: true },
        take: 8,
        orderBy: { updatedAt: 'desc' },
      })
    : [];

  const { listAssignments } = await import('./practiceFormsService.js');
  const pendingForms = clientId
    ? (await listAssignments(tenantId, { clientId })).filter((f) => f.status === 'pending')
    : [];

  return { message, client, jobs, pendingForms };
}
