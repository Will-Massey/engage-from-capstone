/**
 * Microsoft Graph provider client — pure HTTP adapter over global fetch.
 * Returns the provider-neutral shapes from ./types.js. The one exception is
 * ensureGraphSubscription, which persists webhook subscription state
 * (subscriptionId/expiry/clientState) to MailboxSyncState — that lifecycle
 * needs a DB row to renew against, so it lives here to reuse the token cache.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database.js';
import logger from '../../config/logger.js';
import { getApiUrl } from '../../config/urls.js';
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
const EXPAND_ATTACHMENTS = 'attachments($select=id,name,contentType,size,isInline)';
const EARLY_EXPIRY_MARGIN_MS = 60_000;
/** F4: cap the unbounded first sync — delta links carry this filter forward on later requests. */
const FIRST_SYNC_WINDOW_DAYS = 90;

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

interface GraphAttachment {
  id: string;
  name?: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
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
  attachments?: GraphAttachment[];
}

function formatAddress(r?: GraphRecipient): string {
  const addr = r?.emailAddress?.address || '';
  const name = r?.emailAddress?.name;
  return name && addr ? `${name} <${addr}>` : addr;
}

function joinAddresses(recipients?: GraphRecipient[]): string {
  return (recipients || []).map(formatAddress).filter(Boolean).join(', ');
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
  const attachments = msg.attachments?.length
    ? msg.attachments.map((a) => ({
        externalId: a.id,
        name: a.name || '',
        contentType: a.contentType || 'application/octet-stream',
        sizeBytes: a.size || 0,
        isInline: !!a.isInline,
      }))
    : undefined;

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
    attachments,
  };
}

interface GraphDeltaResponse {
  value?: GraphMessage[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

/**
 * F4: an initial (null-deltaLink) sync has no bound — a mailbox with years of
 * history would import all of it. Scope the FIRST delta request to the last
 * 90 days; Graph carries the filter forward on the deltaLink it returns, so
 * later incremental requests don't need to repeat it.
 */
function buildInitialDeltaUrl(folder: 'inbox' | 'sentitems'): string {
  const since = new Date(Date.now() - FIRST_SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const filter = encodeURIComponent(`receivedDateTime ge ${since}`);
  return `${GRAPH_BASE}/me/mailFolders/${folder}/messages/delta?$select=${SELECT_FIELDS}&$expand=${EXPAND_ATTACHMENTS}&$filter=${filter}`;
}

async function fetchDeltaPage(
  folder: 'inbox' | 'sentitems',
  deltaLink: string | null,
  direction: 'INBOUND' | 'OUTBOUND',
  token: string
): Promise<DeltaPage> {
  let url = deltaLink || buildInitialDeltaUrl(folder);
  const messages: ProviderMessage[] = [];
  let finalDeltaLink: string | null = null;

  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      // F3: surface the HTTP status so syncMailbox can detect a 410
      // (resyncRequired) and reset the stored delta cursor instead of
      // retrying the same dead token forever.
      const err = new Error(`Graph delta fetch failed: ${res.status} ${res.statusText}`);
      (err as Error & { statusCode?: number }).statusCode = res.status;
      throw err;
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

/**
 * F1 fast-follow: best-effort cleanup of a reply draft left behind when the
 * subsequent patch or send step fails. Never throws — its own failure must
 * not mask or replace the real error the caller is already propagating.
 */
async function deleteOrphanedDraft(
  draftId: string,
  headers: Record<string, string>
): Promise<void> {
  try {
    const res = await fetch(`${GRAPH_BASE}/me/messages/${draftId}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) {
      logger.warn(`Graph orphaned reply draft cleanup failed: ${res.status} ${res.statusText}`);
    }
  } catch (e: any) {
    logger.warn(`Graph orphaned reply draft cleanup threw: ${e?.message}`);
  }
}

async function sendViaGraph(spec: SendSpec, token: string): Promise<{ externalId: string | null }> {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  if (spec.replyToExternalId) {
    // F1: POST .../reply only accepts a `comment`, so it always addresses the
    // reply to the original sender and silently ignores any edited To/CC.
    // Use the draft flow instead so the typed recipients are honoured:
    // createReply -> patch the draft's recipients/body -> send the draft.
    const createRes = await fetch(
      `${GRAPH_BASE}/me/messages/${spec.replyToExternalId}/createReply`,
      { method: 'POST', headers, body: JSON.stringify({}) }
    );
    if (!createRes.ok) {
      throw new Error(`Graph createReply failed: ${createRes.status} ${createRes.statusText}`);
    }
    const draft = (await createRes.json()) as { id: string };

    // From here on the draft exists in the user's real Outlook Drafts
    // folder — if patch or send fails, best-effort delete it before
    // propagating the original error, so a transient failure (+ retry)
    // doesn't litter their mailbox with orphaned drafts.
    try {
      const patchRes = await fetch(`${GRAPH_BASE}/me/messages/${draft.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          toRecipients: spec.to.map((address) => ({ emailAddress: { address } })),
          ccRecipients: (spec.cc || []).map((address) => ({ emailAddress: { address } })),
          body: { contentType: 'Text', content: spec.bodyText },
        }),
      });
      if (!patchRes.ok) {
        throw new Error(`Graph reply patch failed: ${patchRes.status} ${patchRes.statusText}`);
      }

      const sendRes = await fetch(`${GRAPH_BASE}/me/messages/${draft.id}/send`, {
        method: 'POST',
        headers,
      });
      if (!sendRes.ok) {
        throw new Error(`Graph reply send failed: ${sendRes.status} ${sendRes.statusText}`);
      }
    } catch (e) {
      await deleteOrphanedDraft(draft.id, headers);
      throw e;
    }

    // The draft id is the real message id — improves send-echo reconciliation
    // in mailboxService (findLocalSendMatch no longer needs to fire).
    return { externalId: draft.id };
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
    throw new Error(
      `Graph attachment metadata fetch failed: ${metaRes.status} ${metaRes.statusText}`
    );
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

// ==================== Webhook subscription lifecycle ====================

const SUBSCRIPTION_RESOURCE = "me/mailFolders('inbox')/messages";
const SUBSCRIPTION_CHANGE_TYPE = 'created,updated';
// Graph's hard cap for a mail resource subscription is 4230 minutes (~2.94 days).
const SUBSCRIPTION_MAX_MINUTES = 4230;

interface GraphSubscriptionResponse {
  id: string;
  expirationDateTime: string;
}

function subscriptionExpiryIso(): string {
  return new Date(Date.now() + SUBSCRIPTION_MAX_MINUTES * 60_000).toISOString();
}

async function createSubscription(
  notificationUrl: string,
  clientState: string,
  token: string
): Promise<GraphSubscriptionResponse> {
  const res = await fetch(`${GRAPH_BASE}/subscriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      changeType: SUBSCRIPTION_CHANGE_TYPE,
      notificationUrl,
      resource: SUBSCRIPTION_RESOURCE,
      expirationDateTime: subscriptionExpiryIso(),
      clientState,
    }),
  });
  if (!res.ok) {
    throw new Error(`Graph subscription create failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as GraphSubscriptionResponse;
}

async function renewSubscription(
  subscriptionId: string,
  token: string
): Promise<GraphSubscriptionResponse> {
  const res = await fetch(`${GRAPH_BASE}/subscriptions/${subscriptionId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expirationDateTime: subscriptionExpiryIso() }),
  });
  if (!res.ok) {
    throw new Error(`Graph subscription renew failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as GraphSubscriptionResponse;
}

/** settings.email.provider may be lower/mixed-case — MailboxSyncState.provider needs the enum value. */
function normalizeOutlookProvider(raw: string | undefined | null): 'OUTLOOK' | 'MICROSOFT365' {
  const p = (raw || '').toLowerCase();
  return p === 'microsoft365' || p === 'microsoft_365' || p === 'ms365'
    ? 'MICROSOFT365'
    : 'OUTLOOK';
}

/**
 * Create or renew the Graph webhook subscription for a tenant's inbox and
 * persist id/expiry/clientState to MailboxSyncState. Renewal (PATCH) is tried
 * first when a subscriptionId is already stored; if that fails (e.g. the
 * subscription expired server-side and Graph 404s it) a fresh subscription is
 * created instead. Never throws — webhooks are an accelerator, polling
 * remains the sync guarantee, so failures are logged and swallowed.
 */
export async function ensureGraphSubscription(
  tenantId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await loadTenantEmailContext(tenantId);
    const outlook = ctx?.email.outlook;
    if (!outlook?.clientId || !outlook?.clientSecret || !outlook?.refreshToken) {
      return { ok: false, error: 'NOT_CONNECTED' };
    }

    const creds: GraphCreds = {
      clientId: outlook.clientId,
      clientSecret: outlook.clientSecret,
      refreshToken: outlook.refreshToken,
    };
    const token = await getAccessToken(tenantId, creds);
    const notificationUrl = `${getApiUrl()}/api/webhooks/graph-mail`;

    const syncState = await prisma.mailboxSyncState.findUnique({ where: { tenantId } });

    let subscription: GraphSubscriptionResponse | null = null;
    let clientState = syncState?.clientState ?? null;

    if (syncState?.subscriptionId) {
      try {
        subscription = await renewSubscription(syncState.subscriptionId, token);
      } catch {
        subscription = null; // fall through to create below
      }
    }

    if (!subscription) {
      clientState = randomUUID();
      subscription = await createSubscription(notificationUrl, clientState, token);
    }

    await prisma.mailboxSyncState.upsert({
      where: { tenantId },
      create: {
        tenantId,
        provider: normalizeOutlookProvider(ctx?.email.provider),
        subscriptionId: subscription.id,
        subscriptionExpiry: new Date(subscription.expirationDateTime),
        clientState,
      },
      update: {
        subscriptionId: subscription.id,
        subscriptionExpiry: new Date(subscription.expirationDateTime),
        clientState,
      },
    });

    return { ok: true };
  } catch (e: any) {
    const message = e?.message || 'Graph subscription ensure failed';
    logger.warn(`ensureGraphSubscription failed for tenant ${tenantId}: ${message}`);
    return { ok: false, error: message };
  }
}
