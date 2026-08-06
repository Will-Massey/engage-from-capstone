/**
 * Gmail provider client — googleapis transport, injectable for tests.
 * No DB access. Returns the provider-neutral shapes from ./types.js.
 */

import { google, type gmail_v1 } from 'googleapis';
import { loadTenantEmailContext } from '../tenantEmailSettings.js';
import type { DeltaPage, MailProviderClient, ProviderMessage, SendSpec } from './types.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const EARLY_EXPIRY_MARGIN_MS = 60_000;
/** F4: cap the unbounded first sync — newest messages from the last 90 days only. */
const FULL_SYNC_QUERY = 'newer_than:90d';
const FULL_SYNC_MAX_MESSAGES = 200;
const FULL_SYNC_PAGE_SIZE = 100;

interface TokenCacheEntry {
  accessToken: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenCacheEntry>();

/** Test-only: clear the module-level access-token cache. */
export function clearMailTokenCache(): void {
  tokenCache.clear();
}

interface GmailCreds {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

async function getAccessToken(tenantId: string, creds: GmailCreds): Promise<string> {
  const cached = tokenCache.get(tenantId);
  const now = Date.now();
  if (cached && cached.expiresAt - EARLY_EXPIRY_MARGIN_MS > now) {
    return cached.accessToken;
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    throw new Error(`Gmail token refresh failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache.set(tenantId, {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  });
  return data.access_token;
}

/** Simple regex-based HTML->text fallback — a full parser is out of scope. */
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf8');
}

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
}

interface ExtractedAttachment {
  externalId: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  isInline: boolean;
}

interface ExtractedBody {
  bodyText: string;
  bodyHtml?: string;
  attachments: ExtractedAttachment[];
}

function extractBodyAndAttachments(payload?: gmail_v1.Schema$MessagePart): ExtractedBody {
  let bodyText = '';
  let bodyHtml: string | undefined;
  const attachments: ExtractedAttachment[] = [];

  function walk(part?: gmail_v1.Schema$MessagePart): void {
    if (!part) return;
    const mimeType = part.mimeType || '';

    if (part.filename && part.body?.attachmentId) {
      const isInline = (part.headers || []).some(
        (h) => h.name?.toLowerCase() === 'content-disposition' && h.value?.toLowerCase().includes('inline')
      );
      attachments.push({
        externalId: part.body.attachmentId,
        name: part.filename,
        contentType: mimeType || 'application/octet-stream',
        sizeBytes: part.body.size || 0,
        isInline,
      });
    } else if (mimeType === 'text/plain' && part.body?.data) {
      bodyText = decodeBase64Url(part.body.data);
    } else if (mimeType === 'text/html' && part.body?.data) {
      bodyHtml = decodeBase64Url(part.body.data);
    }

    for (const child of part.parts || []) walk(child);
  }
  walk(payload);

  if (!bodyText && bodyHtml) {
    bodyText = htmlToText(bodyHtml);
  }

  return { bodyText, bodyHtml, attachments };
}

function mapGmailMessage(
  msg: gmail_v1.Schema$Message,
  direction: 'INBOUND' | 'OUTBOUND'
): ProviderMessage {
  const headers = msg.payload?.headers;
  const { bodyText, bodyHtml, attachments } = extractBodyAndAttachments(msg.payload);
  const cc = getHeader(headers, 'Cc');

  return {
    externalId: msg.id!,
    conversationId: msg.threadId || undefined,
    internetMessageId: getHeader(headers, 'Message-ID') || undefined,
    direction,
    from: getHeader(headers, 'From'),
    to: getHeader(headers, 'To'),
    cc: cc || undefined,
    subject: getHeader(headers, 'Subject'),
    bodyText: bodyText || msg.snippet || '',
    bodyHtml,
    isRead: !(msg.labelIds || []).includes('UNREAD'),
    hasAttachments: attachments.length > 0,
    receivedAt: msg.internalDate ? new Date(Number(msg.internalDate)) : new Date(),
    attachments: attachments.length ? attachments : undefined,
  };
}

async function fullSync(
  gmail: gmail_v1.Gmail,
  label: 'INBOX' | 'SENT',
  direction: 'INBOUND' | 'OUTBOUND'
): Promise<DeltaPage> {
  const messages: ProviderMessage[] = [];
  let pageToken: string | undefined;

  do {
    const list = await gmail.users.messages.list({
      userId: 'me',
      labelIds: [label],
      q: FULL_SYNC_QUERY,
      maxResults: FULL_SYNC_PAGE_SIZE,
      pageToken,
    });
    // Gmail's default list order is newest-first, so capping here keeps the
    // most recent messages rather than an arbitrary slice.
    const remaining = FULL_SYNC_MAX_MESSAGES - messages.length;
    const page = (list.data.messages || []).slice(0, remaining);
    for (const m of page) {
      if (!m.id) continue;
      const full = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' });
      messages.push(mapGmailMessage(full.data, direction));
    }
    pageToken = messages.length < FULL_SYNC_MAX_MESSAGES ? list.data.nextPageToken || undefined : undefined;
  } while (pageToken);

  const profile = await gmail.users.getProfile({ userId: 'me' });
  const historyId = profile.data.historyId;
  return { messages, deltaLink: historyId ? `history:${historyId}` : null };
}

/**
 * F3: a stale startHistoryId (older than Gmail's retention window) 404s.
 * googleapis surfaces the HTTP status as `.code`; normalise it onto a
 * `statusCode` field so syncMailbox can detect it the same way it detects
 * Graph's 410, and reset the stored delta cursor instead of retrying forever.
 */
function withStatusCode(e: any): Error & { statusCode?: number } {
  const raw = e?.code ?? e?.response?.status ?? e?.status;
  const statusCode = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  const err = new Error(e?.message || 'Gmail history sync failed') as Error & { statusCode?: number };
  if (typeof statusCode === 'number' && Number.isFinite(statusCode)) err.statusCode = statusCode;
  return err;
}

async function incrementalSync(
  gmail: gmail_v1.Gmail,
  label: 'INBOX' | 'SENT',
  direction: 'INBOUND' | 'OUTBOUND',
  startHistoryId: string
): Promise<DeltaPage> {
  const messages: ProviderMessage[] = [];
  const seen = new Set<string>();
  let latestHistoryId = startHistoryId;
  let pageToken: string | undefined;

  do {
    let res;
    try {
      res = await gmail.users.history.list({
        userId: 'me',
        startHistoryId,
        historyTypes: ['messageAdded'],
        labelId: label,
        pageToken,
      });
    } catch (e: any) {
      throw withStatusCode(e);
    }
    for (const entry of res.data.history || []) {
      for (const added of entry.messagesAdded || []) {
        const id = added.message?.id;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const full = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
        messages.push(mapGmailMessage(full.data, direction));
      }
    }
    if (res.data.historyId) latestHistoryId = res.data.historyId;
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  return { messages, deltaLink: `history:${latestHistoryId}` };
}

function parseDeltaLink(deltaLink: string | null): string | null {
  if (!deltaLink) return null;
  return deltaLink.startsWith('history:') ? deltaLink.slice('history:'.length) : deltaLink;
}

async function syncFolder(
  gmail: gmail_v1.Gmail,
  label: 'INBOX' | 'SENT',
  direction: 'INBOUND' | 'OUTBOUND',
  deltaLink: string | null
): Promise<DeltaPage> {
  const historyId = parseDeltaLink(deltaLink);
  if (!historyId) return fullSync(gmail, label, direction);
  return incrementalSync(gmail, label, direction, historyId);
}

async function sendViaGmail(
  gmail: gmail_v1.Gmail,
  spec: SendSpec
): Promise<{ externalId: string | null }> {
  let threadId: string | undefined;
  if (spec.replyToExternalId) {
    const orig = await gmail.users.messages.get({
      userId: 'me',
      id: spec.replyToExternalId,
      format: 'minimal',
    });
    threadId = orig.data.threadId || undefined;
  }

  const headerLines: string[] = [
    `To: ${spec.to.join(', ')}`,
    ...(spec.cc?.length ? [`Cc: ${spec.cc.join(', ')}`] : []),
    `Subject: ${spec.subject}`,
    ...(spec.inReplyToInternetMessageId
      ? [
          `In-Reply-To: ${spec.inReplyToInternetMessageId}`,
          `References: ${spec.inReplyToInternetMessageId}`,
        ]
      : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
  ];
  const raw = Buffer.from(`${headerLines.join('\r\n')}\r\n\r\n${spec.bodyText}`).toString(
    'base64url'
  );

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw, ...(threadId ? { threadId } : {}) },
  });

  return { externalId: res.data.id || null };
}

async function markReadViaGmail(gmail: gmail_v1.Gmail, externalId: string, read: boolean): Promise<void> {
  await gmail.users.messages.modify({
    userId: 'me',
    id: externalId,
    requestBody: read ? { removeLabelIds: ['UNREAD'] } : { addLabelIds: ['UNREAD'] },
  });
}

async function fetchAttachmentViaGmail(
  gmail: gmail_v1.Gmail,
  messageExternalId: string,
  attachmentExternalId: string
): Promise<{ name: string; contentType: string; content: Buffer }> {
  const full = await gmail.users.messages.get({ userId: 'me', id: messageExternalId, format: 'full' });
  const { attachments } = extractBodyAndAttachments(full.data.payload);
  const meta = attachments.find((a) => a.externalId === attachmentExternalId);

  const att = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId: messageExternalId,
    id: attachmentExternalId,
  });
  const content = Buffer.from(att.data.data || '', 'base64url');

  return {
    name: meta?.name || 'attachment',
    contentType: meta?.contentType || 'application/octet-stream',
    content,
  };
}

export interface GmailMailClientDeps {
  /** Injected googleapis Gmail client — used by tests to bypass real network calls. */
  gmail?: gmail_v1.Gmail;
}

export async function createGmailMailClient(
  tenantId: string,
  deps: GmailMailClientDeps = {}
): Promise<MailProviderClient | null> {
  const ctx = await loadTenantEmailContext(tenantId);
  if (!ctx) return null;

  const gmailSettings = ctx.email.gmail;
  if (!gmailSettings?.clientId || !gmailSettings?.clientSecret || !gmailSettings?.refreshToken) {
    return null;
  }

  const creds: GmailCreds = {
    clientId: gmailSettings.clientId,
    clientSecret: gmailSettings.clientSecret,
    refreshToken: gmailSettings.refreshToken,
  };

  async function client(): Promise<gmail_v1.Gmail> {
    // Always mint/cache a token, mirroring the Graph client's behavior — the
    // injected `deps.gmail` (test transport) only replaces the API surface,
    // not the token-refresh step.
    const accessToken = await getAccessToken(tenantId, creds);
    if (deps.gmail) return deps.gmail;
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    return google.gmail({ version: 'v1', auth: oauth2Client });
  }

  async function withToken<T>(fn: (gmail: gmail_v1.Gmail) => Promise<T>): Promise<T> {
    return fn(await client());
  }

  return {
    async syncInbox(deltaLink) {
      return withToken((gmail) => syncFolder(gmail, 'INBOX', 'INBOUND', deltaLink));
    },
    async syncSent(deltaLink) {
      return withToken((gmail) => syncFolder(gmail, 'SENT', 'OUTBOUND', deltaLink));
    },
    async send(spec) {
      return withToken((gmail) => sendViaGmail(gmail, spec));
    },
    async markRead(externalId, read) {
      return withToken((gmail) => markReadViaGmail(gmail, externalId, read));
    },
    async fetchAttachment(messageExternalId, attachmentExternalId) {
      return withToken((gmail) => fetchAttachmentViaGmail(gmail, messageExternalId, attachmentExternalId));
    },
  };
}
