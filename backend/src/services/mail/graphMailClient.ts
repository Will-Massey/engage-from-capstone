/**
 * Microsoft Graph provider client — pure HTTP adapter over global fetch.
 * No DB access. Returns the provider-neutral shapes from ./types.js.
 */

import { loadTenantEmailContext } from '../tenantEmailSettings.js';
import type { DeltaPage, MailProviderClient, ProviderMessage, SendSpec } from './types.js';

const GRAPH_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const GRAPH_SCOPE =
  'https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send offline_access';
const SELECT_FIELDS = [
  'id',
  'conversationId',
  'internetMessageId',
  'subject',
  'from',
  'toRecipients',
  'ccRecipients',
  'bodyPreview',
  'body',
  'isRead',
  'hasAttachments',
  'receivedDateTime',
  'sentDateTime',
].join(',');
const EARLY_EXPIRY_MARGIN_MS = 60_000;

interface TokenCacheEntry {
  accessToken: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenCacheEntry>();

/** Test-only: clear the module-level access-token cache. */
export function clearMailTokenCache(): void {
  tokenCache.clear();
}

interface GraphCreds {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

async function getAccessToken(tenantId: string, creds: GraphCreds): Promise<string> {
  const cached = tokenCache.get(tenantId);
  const now = Date.now();
  if (cached && cached.expiresAt - EARLY_EXPIRY_MARGIN_MS > now) {
    return cached.accessToken;
  }

  const res = await fetch(GRAPH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: 'refresh_token',
      scope: GRAPH_SCOPE,
    }),
  });

  if (!res.ok) {
    throw new Error(`Graph token refresh failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache.set(tenantId, {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  });
  return data.access_token;
}

interface GraphEmailAddress {
  name?: string;
  address?: string;
}

interface GraphRecipient {
  emailAddress?: GraphEmailAddress;
}

interface GraphMessage {
  id: string;
  conversationId?: string;
  internetMessageId?: string;
  subject?: string;
  from?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
  isRead?: boolean;
  hasAttachments?: boolean;
  receivedDateTime?: string;
  sentDateTime?: string;
}

function formatAddress(r?: GraphRecipient): string {
  const addr = r?.emailAddress?.address || '';
  const name = r?.emailAddress?.name;
  return name && addr ? `${name} <${addr}>` : addr;
}

function joinAddresses(recipients?: GraphRecipient[]): string {
  return (recipients || [])
    .map(formatAddress)
    .filter(Boolean)
    .join(', ');
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

function mapGraphMessage(msg: GraphMessage, direction: 'INBOUND' | 'OUTBOUND'): ProviderMessage {
  const contentType = msg.body?.contentType;
  const content = msg.body?.content || '';
  const isHtml = contentType?.toLowerCase() === 'html';

  const cc = joinAddresses(msg.ccRecipients);

  return {
    externalId: msg.id,
    conversationId: msg.conversationId,
    internetMessageId: msg.internetMessageId,
    direction,
    from: formatAddress(msg.from),
    to: joinAddresses(msg.toRecipients),
    cc: cc || undefined,
    subject: msg.subject || '',
    bodyText: isHtml ? htmlToText(content) : content || msg.bodyPreview || '',
    bodyHtml: isHtml ? content : undefined,
    isRead: !!msg.isRead,
    hasAttachments: !!msg.hasAttachments,
    receivedAt: new Date(msg.receivedDateTime || msg.sentDateTime || Date.now()),
  };
}

interface GraphDeltaResponse {
  value?: GraphMessage[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

async function fetchDeltaPage(
  folder: 'inbox' | 'sentitems',
  deltaLink: string | null,
  direction: 'INBOUND' | 'OUTBOUND',
  token: string
): Promise<DeltaPage> {
  let url =
    deltaLink || `${GRAPH_BASE}/me/mailFolders/${folder}/messages/delta?$select=${SELECT_FIELDS}`;
  const messages: ProviderMessage[] = [];
  let finalDeltaLink: string | null = null;

  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      throw new Error(`Graph delta fetch failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as GraphDeltaResponse;
    for (const m of data.value || []) {
      messages.push(mapGraphMessage(m, direction));
    }
    if (data['@odata.nextLink']) {
      url = data['@odata.nextLink'];
    } else {
      finalDeltaLink = data['@odata.deltaLink'] || null;
      url = '';
    }
  }

  return { messages, deltaLink: finalDeltaLink };
}

async function sendViaGraph(
  spec: SendSpec,
  token: string
): Promise<{ externalId: string | null }> {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  if (spec.replyToExternalId) {
    const res = await fetch(`${GRAPH_BASE}/me/messages/${spec.replyToExternalId}/reply`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ comment: spec.bodyText }),
    });
    if (!res.ok) {
      throw new Error(`Graph reply failed: ${res.status} ${res.statusText}`);
    }
    return { externalId: null };
  }

  const res = await fetch(`${GRAPH_BASE}/me/sendMail`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: {
        subject: spec.subject,
        body: { contentType: 'Text', content: spec.bodyText },
        toRecipients: spec.to.map((address) => ({ emailAddress: { address } })),
        ccRecipients: (spec.cc || []).map((address) => ({ emailAddress: { address } })),
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Graph sendMail failed: ${res.status} ${res.statusText}`);
  }
  return { externalId: null };
}

async function markReadViaGraph(externalId: string, read: boolean, token: string): Promise<void> {
  const res = await fetch(`${GRAPH_BASE}/me/messages/${externalId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ isRead: read }),
  });
  if (!res.ok) {
    throw new Error(`Graph markRead failed: ${res.status} ${res.statusText}`);
  }
}

async function fetchAttachmentViaGraph(
  messageExternalId: string,
  attachmentExternalId: string,
  token: string
): Promise<{ name: string; contentType: string; content: Buffer }> {
  const authHeaders = { Authorization: `Bearer ${token}` };

  const metaRes = await fetch(
    `${GRAPH_BASE}/me/messages/${messageExternalId}/attachments/${attachmentExternalId}`,
    { headers: authHeaders }
  );
  if (!metaRes.ok) {
    throw new Error(`Graph attachment metadata fetch failed: ${metaRes.status} ${metaRes.statusText}`);
  }
  const meta = (await metaRes.json()) as { name?: string; contentType?: string };

  const contentRes = await fetch(
    `${GRAPH_BASE}/me/messages/${messageExternalId}/attachments/${attachmentExternalId}/$value`,
    { headers: authHeaders }
  );
  if (!contentRes.ok) {
    throw new Error(
      `Graph attachment content fetch failed: ${contentRes.status} ${contentRes.statusText}`
    );
  }
  const buffer = Buffer.from(await contentRes.arrayBuffer());

  return {
    name: meta.name || '',
    contentType: meta.contentType || 'application/octet-stream',
    content: buffer,
  };
}

export async function createGraphMailClient(tenantId: string): Promise<MailProviderClient | null> {
  const ctx = await loadTenantEmailContext(tenantId);
  if (!ctx) return null;

  const outlook = ctx.email.outlook;
  if (!outlook?.clientId || !outlook?.clientSecret || !outlook?.refreshToken) return null;

  const creds: GraphCreds = {
    clientId: outlook.clientId,
    clientSecret: outlook.clientSecret,
    refreshToken: outlook.refreshToken,
  };

  const token = () => getAccessToken(tenantId, creds);

  return {
    async syncInbox(deltaLink) {
      return fetchDeltaPage('inbox', deltaLink, 'INBOUND', await token());
    },
    async syncSent(deltaLink) {
      return fetchDeltaPage('sentitems', deltaLink, 'OUTBOUND', await token());
    },
    async send(spec) {
      return sendViaGraph(spec, await token());
    },
    async markRead(externalId, read) {
      return markReadViaGraph(externalId, read, await token());
    },
    async fetchAttachment(messageExternalId, attachmentExternalId) {
      return fetchAttachmentViaGraph(messageExternalId, attachmentExternalId, await token());
    },
  };
}
