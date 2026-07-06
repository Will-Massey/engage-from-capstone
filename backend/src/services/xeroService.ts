/**
 * Xero API client factory and helpers (W1.1–W1.2)
 *
 * - OAuth2 connect via xero-node
 * - Token refresh + encrypted storage on Tenant.settings.xero
 * - Contact import from Xero → Engage clients (dedupe by email/name)
 * - Push accepted proposal → Xero contact note + repeating invoices
 * - Stub mode when XERO_* env not set or tenant not connected
 */

import {
  XeroClient,
  Contact,
  Contacts,
  Invoice,
  HistoryRecords,
  RepeatingInvoice,
  RepeatingInvoices,
  Schedule,
  LineAmountTypes,
  CurrencyCode,
} from 'xero-node';
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

const DEFAULT_REVENUE_ACCOUNT = '200';

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

  for (;;) {
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
    if (page > 50) break;
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
    'Synced from Engage by Capstone',
  ].join('\n');
}

type ProposalServiceLine = {
  name: string;
  displayPrice: number;
  billingFrequency: string;
  lineTotal: number;
  vatAmount?: number;
};

function mapBillingToSchedule(billingFrequency: string): {
  unit: Schedule.UnitEnum;
  period: number;
} {
  switch (billingFrequency) {
    case 'WEEKLY':
      return { unit: Schedule.UnitEnum.WEEKLY, period: 1 };
    case 'QUARTERLY':
      return { unit: Schedule.UnitEnum.MONTHLY, period: 3 };
    case 'ANNUALLY':
      return { unit: Schedule.UnitEnum.MONTHLY, period: 12 };
    case 'MONTHLY':
    default:
      return { unit: Schedule.UnitEnum.MONTHLY, period: 1 };
  }
}

function groupRecurringServices(services: ProposalServiceLine[]) {
  const recurring = services.filter((s) => s.billingFrequency !== 'ONE_TIME');
  const oneTime = services.filter((s) => s.billingFrequency === 'ONE_TIME');

  const groups = new Map<string, ProposalServiceLine[]>();
  for (const service of recurring) {
    const key = service.billingFrequency || 'MONTHLY';
    const existing = groups.get(key) || [];
    existing.push(service);
    groups.set(key, existing);
  }

  return { groups, oneTime };
}

async function resolveOrCreateContact(
  session: XeroSession,
  client: {
    name: string;
    contactEmail: string;
    contactName?: string | null;
    xeroContactId?: string;
  },
  reference: string
): Promise<string | undefined> {
  const { client: xeroClient, xeroTenantId } = session;
  const email = client.contactEmail?.trim().toLowerCase();
  const name = client.name?.trim();

  if (client.xeroContactId) {
    try {
      const existing = await xeroClient.accountingApi.getContact(
        xeroTenantId,
        client.xeroContactId
      );
      if (existing.body.contacts?.[0]?.contactID) {
        return existing.body.contacts[0].contactID;
      }
    } catch {
      logger.warn(`Linked Xero contact ${client.xeroContactId} not found — will match or create`);
    }
  }

  let contactId: string | undefined;

  if (email) {
    const byEmail = await xeroClient.accountingApi.getContacts(
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
    if (match?.contactID) contactId = match.contactID;
  }

  if (!contactId && name) {
    const byName = await xeroClient.accountingApi.getContacts(
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
    if (match?.contactID) contactId = match.contactID;
  }

  if (!contactId) {
    const contacts: Contacts = {
      contacts: [
        {
          name: name || client.contactName || 'Engage Client',
          emailAddress: email || undefined,
          contactNumber: `ENGAGE-${reference}`,
        },
      ],
    };
    const created = await xeroClient.accountingApi.updateOrCreateContacts(
      xeroTenantId,
      contacts
    );
    contactId = created.body.contacts?.[0]?.contactID;
  }

  return contactId;
}

function buildRepeatingInvoiceDraft(
  contactId: string | undefined,
  reference: string,
  billingFrequency: string,
  services: ProposalServiceLine[],
  revenueAccount: string
) {
  const schedule = mapBillingToSchedule(billingFrequency);
  const startDate = new Date().toISOString().slice(0, 10);

  return {
    type: RepeatingInvoice.TypeEnum.ACCREC,
    contact: { contactID: contactId },
    schedule: {
      period: schedule.period,
      unit: schedule.unit,
      dueDate: 20,
      dueDateType: Schedule.DueDateTypeEnum.OFFOLLOWINGMONTH,
      startDate,
    },
    lineItems: services.map((s) => ({
      description: s.name,
      quantity: 1,
      unitAmount: s.lineTotal,
      accountCode: revenueAccount,
      taxAmount: s.vatAmount ?? 0,
    })),
    lineAmountTypes: LineAmountTypes.Exclusive,
    status: RepeatingInvoice.StatusEnum.DRAFT,
    reference: `${reference} (${billingFrequency})`,
    currencyCode: CurrencyCode.GBP,
  };
}

/**
 * Push accepted proposal to Xero.
 * When session is null, returns stub payloads only (no API calls).
 */
export async function pushAcceptedProposalToXero(
  session: XeroSession | null,
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
      xeroContactId?: string;
    };
    services: ProposalServiceLine[];
  }
): Promise<{
  contactNote: { implemented: boolean; contactId?: string; updated: boolean; error?: string };
  repeatingInvoice: {
    implemented: boolean;
    stub: boolean;
    created: number;
    repeatingInvoiceIds: string[];
    drafts: unknown[];
    errors: string[];
    message: string;
  };
}> {
  const revenueAccount =
    session?.settings.defaultRevenueAccountCode || DEFAULT_REVENUE_ACCOUNT;
  const { groups, oneTime } = groupRecurringServices(proposal.services);

  if (!session) {
    const drafts = Array.from(groups.entries()).map(([freq, lines]) =>
      buildRepeatingInvoiceDraft(undefined, proposal.reference, freq, lines, revenueAccount)
    );

    return {
      contactNote: {
        implemented: false,
        updated: false,
        error: 'Xero not connected — contact note not written',
      },
      repeatingInvoice: {
        implemented: false,
        stub: true,
        created: 0,
        repeatingInvoiceIds: [],
        drafts,
        errors: [],
        message:
          'Stub mode — repeating invoice drafts returned for review. Connect Xero to create live invoices.',
      },
    };
  }

  const { client, xeroTenantId } = session;
  const errors: string[] = [];
  let contactId: string | undefined;
  let contactUpdated = false;

  try {
    contactId = await resolveOrCreateContact(session, proposal.client, proposal.reference);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Contact sync failed';
    errors.push(`Could not create or update Xero contact: ${msg}`);
    logger.error('Xero contact sync failed', err);
  }

  if (contactId) {
    try {
      const noteBody = buildProposalSummaryNote(proposal);
      const history: HistoryRecords = {
        historyRecords: [{ details: noteBody }],
      };
      await client.accountingApi.createContactHistory(xeroTenantId, contactId, history);
      contactUpdated = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Contact note failed';
      errors.push(`Contact note not written: ${msg}`);
      logger.warn('Xero contact history failed', err);
    }
  }

  const repeatingInvoiceIds: string[] = [];
  const drafts: unknown[] = [];

  if (!contactId) {
    errors.push('Repeating invoices skipped — no Xero contact available.');
  } else if (groups.size === 0) {
    errors.push(
      oneTime.length
        ? 'No recurring service lines — one-off charges were not added to a repeating invoice.'
        : 'No service lines to invoice.'
    );
  } else {
    for (const [billingFrequency, lines] of groups.entries()) {
      const draft = buildRepeatingInvoiceDraft(
        contactId,
        proposal.reference,
        billingFrequency,
        lines,
        revenueAccount
      );
      drafts.push(draft);

      try {
        const repeatingInvoice = draft as RepeatingInvoice;
        const payload: RepeatingInvoices = { repeatingInvoices: [repeatingInvoice] };
        const response = await client.accountingApi.createRepeatingInvoices(
          xeroTenantId,
          payload,
          true
        );
        const created = response.body.repeatingInvoices?.[0];
        if (created?.repeatingInvoiceID) {
          repeatingInvoiceIds.push(created.repeatingInvoiceID);
        } else {
          const validationErrors = (created as { validationErrors?: Array<{ message?: string }> })
            ?.validationErrors;
          if (validationErrors?.length) {
            errors.push(
              ...validationErrors.map(
                (e) => `${billingFrequency}: ${e.message || 'Validation error'}`
              )
            );
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Repeating invoice creation failed';
        errors.push(`${billingFrequency} invoice: ${msg}`);
        logger.warn(`Xero repeating invoice failed (${billingFrequency})`, err);
      }
    }
  }

  if (oneTime.length) {
    errors.push(
      `${oneTime.length} one-off service line(s) were not added to repeating invoices — raise these separately in Xero.`
    );
  }

  const created = repeatingInvoiceIds.length;

  return {
    contactNote: {
      implemented: true,
      contactId,
      updated: contactUpdated,
      error: contactUpdated ? undefined : errors.find((e) => e.includes('Contact note')) ,
    },
    repeatingInvoice: {
      implemented: true,
      stub: false,
      created,
      repeatingInvoiceIds,
      drafts,
      errors,
      message:
        created > 0
          ? `Created ${created} repeating invoice template(s) in Xero.`
          : 'No repeating invoices were created — see errors for details.',
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