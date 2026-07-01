/**
 * Xero API client factory and helpers (W1.1–W1.2 scaffold)
 *
 * Implemented:
 * - OAuth2 connect via xero-node
 * - Token refresh + encrypted storage on Tenant.settings.xero
 * - Contact import from Xero → Engage clients (dedupe by email/name)
 * - Push accepted proposal summary as Xero contact history note
 *
 * Stub (W1.2 — documented, not live):
 * - Repeating invoice / ACCREC draft creation (returns stub payload only)
 */

import { XeroClient, Contact, Contacts, Invoice, HistoryRecords } from 'xero-node';
import logger from '../config/logger.js';
import {
  getTenantXeroSettings,
  saveTenantXeroSettings,
  getXeroRedirectUri,
  isXeroOAuthConfigured,
  type TenantXeroSettings,
} from './tenantXeroSettings.js';

/** OAuth scopes — register these on your Xero app */
export const XERO_OAUTH_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'accounting.contacts',
  'accounting.transactions',
  'accounting.settings',
] as const;

export type XeroOAuthScope = (typeof XERO_OAUTH_SCOPES)[number];

function requireXeroEnv() {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Xero OAuth is not configured (XERO_CLIENT_ID / XERO_CLIENT_SECRET)');
  }
  return { clientId, clientSecret };
}

export function createXeroClient(state?: string): XeroClient {
  const { clientId, clientSecret } = requireXeroEnv();
  return new XeroClient({
    clientId,
    clientSecret,
    redirectUris: [getXeroRedirectUri()],
    scopes: [...XERO_OAUTH_SCOPES],
    state,
  });
}

export async function buildXeroConsentUrl(state: string): Promise<string> {
  const xero = createXeroClient(state);
  await xero.initialize();
  return xero.buildConsentUrl();
}

export interface XeroSession {
  client: XeroClient;
  settings: TenantXeroSettings;
  xeroTenantId: string;
}

/** Load tenant tokens, refresh if needed, return ready API client */
export async function getAuthenticatedXeroSession(tenantId: string): Promise<XeroSession> {
  const settings = await getTenantXeroSettings(tenantId);
  if (!settings?.connected || !settings.refreshToken) {
    throw new Error('Xero is not connected for this practice');
  }

  const xero = createXeroClient();
  await xero.initialize();

  const tokenSet: Record<string, unknown> = {
    refresh_token: settings.refreshToken,
  };
  if (settings.accessToken) tokenSet.access_token = settings.accessToken;
  if (settings.idToken) tokenSet.id_token = settings.idToken;
  if (settings.tokenExpiresAt) {
    tokenSet.expires_at = Math.floor(new Date(settings.tokenExpiresAt).getTime() / 1000);
  }

  await xero.setTokenSet(tokenSet as any);

  const current = xero.readTokenSet();
  const expiresAt =
    (current as any).expires_at != null
      ? new Date((current as any).expires_at * 1000)
      : settings.tokenExpiresAt
        ? new Date(settings.tokenExpiresAt)
        : null;

  const isExpired = !expiresAt || expiresAt.getTime() < Date.now() + 60_000;

  if (isExpired) {
    const refreshed = await xero.refreshToken();
    const refreshedObj = refreshed as any;
    await saveTenantXeroSettings(tenantId, {
      ...settings,
      accessToken: refreshedObj.access_token,
      refreshToken: refreshedObj.refresh_token || settings.refreshToken,
      idToken: refreshedObj.id_token || settings.idToken,
      tokenExpiresAt: refreshedObj.expires_at
        ? new Date(refreshedObj.expires_at * 1000).toISOString()
        : new Date(Date.now() + (refreshedObj.expires_in || 1800) * 1000).toISOString(),
      scope: refreshedObj.scope
        ? String(refreshedObj.scope).split(/[\s,]+/).filter(Boolean)
        : settings.scope,
    });
    await xero.setTokenSet(refreshed);
  }

  return {
    client: xero,
    settings: (await getTenantXeroSettings(tenantId))!,
    xeroTenantId: settings.xeroTenantId,
  };
}

export async function exchangeXeroCallbackUrl(callbackUrl: string): Promise<{
  tokenSet: any;
  tenants: Array<{ tenantId: string; tenantName?: string }>;
}> {
  const xero = createXeroClient();
  await xero.initialize();
  const tokenSet = await xero.apiCallback(callbackUrl);
  await xero.setTokenSet(tokenSet);
  await xero.updateTenants(false);

  const tenants = (xero.tenants || []).map((t) => ({
    tenantId: t.tenantId,
    tenantName: t.tenantName,
  }));

  return { tokenSet, tenants };
}

export async function revokeXeroConnection(tenantId: string): Promise<void> {
  try {
    const { client } = await getAuthenticatedXeroSession(tenantId);
    await client.revokeToken();
  } catch (err) {
    logger.warn('Xero revokeToken failed (connection may already be invalid):', err);
  }
}

export function normalizeClientName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Fetch all Xero contacts (paginated) */
export async function fetchAllXeroContacts(session: XeroSession): Promise<Contact[]> {
  const { client, xeroTenantId } = session;
  const all: Contact[] = [];
  let page = 1;
  const pageSize = 100;

  while (true) {
    const response = await client.accountingApi.getContacts(
      xeroTenantId,
      undefined,
      undefined,
      undefined,
      undefined,
      page,
      false,
      true,
      undefined,
      pageSize
    );
    const contacts = response.body.contacts || [];
    all.push(...contacts);
    if (contacts.length < pageSize) break;
    page += 1;
    if (page > 50) break; // safety cap
  }

  return all;
}

export function buildProposalSummaryNote(proposal: {
  reference: string;
  title: string;
  acceptedAt?: Date | null;
  total: number;
  subtotal: number;
  vatAmount: number;
  paymentFrequency: string;
  services: Array<{
    name: string;
    displayPrice: number;
    billingFrequency: string;
    lineTotal: number;
  }>;
}): string {
  const lines = proposal.services
    .map(
      (s) =>
        `• ${s.name}: £${s.lineTotal.toFixed(2)} (${s.billingFrequency}, display £${s.displayPrice.toFixed(2)})`
    )
    .join('\n');

  const accepted = proposal.acceptedAt
    ? proposal.acceptedAt.toISOString().slice(0, 10)
    : 'n/a';

  return [
    `[Engage] Accepted proposal ${proposal.reference}`,
    proposal.title,
    `Accepted: ${accepted}`,
    `Subtotal: £${proposal.subtotal.toFixed(2)} | VAT: £${proposal.vatAmount.toFixed(2)} | Total: £${proposal.total.toFixed(2)}`,
    `Billing: ${proposal.paymentFrequency}`,
    '',
    'Services:',
    lines || '(no line items)',
    '',
    'Synced from Engage by Capstone — W1.2 contact note',
  ].join('\n');
}

/**
 * Append proposal summary via Xero contact history API (implemented).
 * Repeating invoice stub is returned separately for future W1.2 work.
 */
export async function pushAcceptedProposalToXero(
  session: XeroSession,
  proposal: {
    reference: string;
    title: string;
    acceptedAt?: Date | null;
    total: number;
    subtotal: number;
    vatAmount: number;
    paymentFrequency: string;
    client: {
      name: string;
      contactEmail: string;
      contactName?: string | null;
    };
    services: Array<{
      name: string;
      displayPrice: number;
      billingFrequency: string;
      lineTotal: number;
    }>;
  }
): Promise<{
  contactNote: { implemented: true; contactId?: string; updated: boolean };
  repeatingInvoice: { implemented: false; stub: true; message: string; draft?: unknown };
}> {
  const { client, xeroTenantId } = session;
  const email = proposal.client.contactEmail?.trim().toLowerCase();
  const name = proposal.client.name?.trim();

  let contactId: string | undefined;

  if (email) {
    const byEmail = await client.accountingApi.getContacts(
      xeroTenantId,
      undefined,
      undefined,
      undefined,
      undefined,
      1,
      false,
      true,
      email,
      10
    );
    const match = (byEmail.body.contacts || []).find(
      (c) => c.emailAddress?.toLowerCase() === email
    );
    if (match?.contactID) {
      contactId = match.contactID;
    }
  }

  if (!contactId && name) {
    const byName = await client.accountingApi.getContacts(
      xeroTenantId,
      undefined,
      undefined,
      undefined,
      undefined,
      1,
      false,
      true,
      name,
      10
    );
    const normalized = normalizeClientName(name);
    const match = (byName.body.contacts || []).find(
      (c) => c.name && normalizeClientName(c.name) === normalized
    );
    if (match?.contactID) {
      contactId = match.contactID;
    }
  }

  const noteBody = buildProposalSummaryNote(proposal);
  let updated = false;

  if (!contactId) {
    const contacts: Contacts = {
      contacts: [
        {
          name: name || proposal.client.contactName || 'Engage Client',
          emailAddress: email || undefined,
          contactNumber: `ENGAGE-${proposal.reference}`,
        },
      ],
    };
    const created = await client.accountingApi.updateOrCreateContacts(xeroTenantId, contacts);
    contactId = created.body.contacts?.[0]?.contactID;
  }

  if (contactId) {
    const history: HistoryRecords = {
      historyRecords: [{ details: noteBody }],
    };
    await client.accountingApi.createContactHistory(xeroTenantId, contactId, history);
    updated = true;
  }

  // --- STUB: repeating invoice / mandate draft (not sent to Xero API yet) ---
  const repeatingInvoiceStub = {
    type: Invoice.TypeEnum.ACCREC,
    contact: { contactID: contactId },
    lineItems: proposal.services.map((s) => ({
      description: s.name,
      quantity: 1,
      unitAmount: s.lineTotal,
      accountCode: '200', // placeholder — practice must map revenue accounts in full implementation
    })),
    status: Invoice.StatusEnum.DRAFT,
    reference: proposal.reference,
    currencyCode: 'GBP' as const,
  };

  return {
    contactNote: { implemented: true, contactId, updated },
    repeatingInvoice: {
      implemented: false,
      stub: true,
      message:
        'Repeating invoice / mandate draft is stubbed for W1.2. Contact note was written to Xero. Full invoice sync requires revenue account mapping and GoCardless mandate flow (W1.3).',
      draft: repeatingInvoiceStub,
    },
  };
}

export function getXeroPublicConfig() {
  return {
    configured: isXeroOAuthConfigured(),
    redirectUri: getXeroRedirectUri(),
    scopes: [...XERO_OAUTH_SCOPES],
  };
}