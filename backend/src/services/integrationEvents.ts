/**
 * W4.2 / #11 — HubSpot, Zapier, Senta, Karbon proposal lifecycle webhooks.
 * Emits: proposal.sent, proposal.viewed, proposal.signed, proposal.declined
 * (proposal.accepted is retained as a legacy alias for proposal.signed)
 */

import { prisma } from '../config/database.js';
import logger from '../utils/logger.js';
import { penceToPounds } from '../utils/proposalPricing.js';

export type IntegrationEventType =
  | 'proposal.sent'
  | 'proposal.viewed'
  | 'proposal.signed'
  | 'proposal.declined'
  | 'proposal.accepted';

export type WebhookFormat = 'default' | 'hubspot' | 'zapier' | 'senta' | 'karbon';

export interface IntegrationEventPayload {
  event: IntegrationEventType;
  occurredAt: string;
  tenantId: string;
  proposal: {
    id: string;
    reference: string;
    title: string;
    status: string;
    total: number;
    currency: 'GBP';
    clientName: string;
    clientEmail?: string | null;
    sentAt?: string | null;
    viewedAt?: string | null;
    signedAt?: string | null;
    signedBy?: string | null;
    declinedAt?: string | null;
    declinedBy?: string | null;
    declineReason?: string | null;
    /** @deprecated use signedAt */
    acceptedAt?: string | null;
    /** @deprecated use signedBy */
    acceptedBy?: string | null;
  };
  services: Array<{
    name: string;
    lineTotal: number;
    billingFrequency: string;
  }>;
}

export interface HubSpotEventPayload {
  eventName: string;
  occurredAt: number;
  objectId?: string;
  properties: Record<string, string | number | boolean | null>;
}

/** Flat key-value shape optimised for Zapier / Make catch hooks */
export interface ZapierEventPayload {
  event: string;
  proposal_id: string;
  proposal_reference: string;
  proposal_title: string;
  proposal_status: string;
  client_name: string;
  client_email: string | null;
  total_gbp: number;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  signed_by: string | null;
  declined_at: string | null;
  declined_by: string | null;
  decline_reason: string | null;
  services_json: string;
  occurred_at: string;
}

/**
 * Senta practice-management handoff payload.
 * Maps an accepted engagement to client + engagement + fee lines for PM import.
 */
export interface SentaEventPayload {
  event: string;
  occurred_at: string;
  client: {
    name: string;
    email: string | null;
  };
  engagement: {
    id: string;
    reference: string;
    title: string;
    status: string;
    total_gbp: number;
    sent_at: string | null;
    viewed_at: string | null;
    signed_at: string | null;
    signed_by: string | null;
    declined_at: string | null;
    declined_by: string | null;
    decline_reason: string | null;
  };
  fees: Array<{
    description: string;
    amount_gbp: number;
    frequency: string;
  }>;
}

/** Karbon-compatible subset (PascalCase fields used by Karbon work-item integrations) */
export interface KarbonEventPayload {
  EventType: string;
  Timestamp: string;
  Client: {
    FullName: string;
    EmailAddress: string | null;
  };
  WorkItem: {
    Key: string;
    Title: string;
    Status: string;
    TotalAmount: number;
    Currency: 'GBP';
  };
  Fees: Array<{
    Description: string;
    Amount: number;
    Frequency: string;
  }>;
}

export type FormattedWebhookPayload =
  | IntegrationEventPayload
  | HubSpotEventPayload
  | ZapierEventPayload
  | SentaEventPayload
  | KarbonEventPayload;

const WEBHOOK_FORMATS: WebhookFormat[] = ['default', 'hubspot', 'zapier', 'senta', 'karbon'];

function normaliseEventType(event: IntegrationEventType): IntegrationEventType {
  return event === 'proposal.accepted' ? 'proposal.signed' : event;
}

function parseWebhookConfig(settingsJson: string): {
  webhookUrl: string | null;
  format: WebhookFormat;
} {
  try {
    const settings = JSON.parse(settingsJson || '{}') as {
      webhookUrl?: string;
      integrations?: { webhookUrl?: string; webhookFormat?: WebhookFormat };
    };
    const url = settings.webhookUrl || settings.integrations?.webhookUrl;
    const rawFormat = settings.integrations?.webhookFormat;
    const format = rawFormat && WEBHOOK_FORMATS.includes(rawFormat) ? rawFormat : 'default';
    if (typeof url === 'string' && url.trim().startsWith('https://')) {
      return { webhookUrl: url.trim(), format };
    }
    return { webhookUrl: null, format };
  } catch {
    return { webhookUrl: null, format: 'default' };
  }
}

export function toHubSpotPayload(event: IntegrationEventPayload): HubSpotEventPayload {
  const normalised = normaliseEventType(event.event);
  const hubspotEventName = normalised.replace('.', '_');
  return {
    eventName: hubspotEventName,
    occurredAt: new Date(event.occurredAt).getTime(),
    objectId: event.proposal.id,
    properties: {
      proposal_id: event.proposal.id,
      proposal_reference: event.proposal.reference,
      proposal_title: event.proposal.title,
      proposal_status: event.proposal.status,
      proposal_total: event.proposal.total,
      proposal_currency: event.proposal.currency,
      client_name: event.proposal.clientName,
      client_email: event.proposal.clientEmail ?? null,
      sent_at: event.proposal.sentAt ?? null,
      viewed_at: event.proposal.viewedAt ?? null,
      signed_at: event.proposal.signedAt ?? event.proposal.acceptedAt ?? null,
      signed_by: event.proposal.signedBy ?? event.proposal.acceptedBy ?? null,
      declined_at: event.proposal.declinedAt ?? null,
      declined_by: event.proposal.declinedBy ?? null,
      decline_reason: event.proposal.declineReason ?? null,
      service_count: event.services.length,
      services_summary: event.services.map((s) => s.name).join('; '),
    },
  };
}

export function toZapierPayload(event: IntegrationEventPayload): ZapierEventPayload {
  const normalised = normaliseEventType(event.event);
  return {
    event: normalised,
    proposal_id: event.proposal.id,
    proposal_reference: event.proposal.reference,
    proposal_title: event.proposal.title,
    proposal_status: event.proposal.status,
    client_name: event.proposal.clientName,
    client_email: event.proposal.clientEmail ?? null,
    total_gbp: event.proposal.total,
    sent_at: event.proposal.sentAt ?? null,
    viewed_at: event.proposal.viewedAt ?? null,
    signed_at: event.proposal.signedAt ?? event.proposal.acceptedAt ?? null,
    signed_by: event.proposal.signedBy ?? event.proposal.acceptedBy ?? null,
    declined_at: event.proposal.declinedAt ?? null,
    declined_by: event.proposal.declinedBy ?? null,
    decline_reason: event.proposal.declineReason ?? null,
    services_json: JSON.stringify(
      event.services.map((s) => ({
        name: s.name,
        line_total_gbp: s.lineTotal,
        billing_frequency: s.billingFrequency,
      }))
    ),
    occurred_at: event.occurredAt,
  };
}

export function toSentaPayload(event: IntegrationEventPayload): SentaEventPayload {
  const normalised = normaliseEventType(event.event);
  return {
    event: normalised,
    occurred_at: event.occurredAt,
    client: {
      name: event.proposal.clientName,
      email: event.proposal.clientEmail ?? null,
    },
    engagement: {
      id: event.proposal.id,
      reference: event.proposal.reference,
      title: event.proposal.title,
      status: event.proposal.status,
      total_gbp: event.proposal.total,
      sent_at: event.proposal.sentAt ?? null,
      viewed_at: event.proposal.viewedAt ?? null,
      signed_at: event.proposal.signedAt ?? event.proposal.acceptedAt ?? null,
      signed_by: event.proposal.signedBy ?? event.proposal.acceptedBy ?? null,
      declined_at: event.proposal.declinedAt ?? null,
      declined_by: event.proposal.declinedBy ?? null,
      decline_reason: event.proposal.declineReason ?? null,
    },
    fees: event.services.map((s) => ({
      description: s.name,
      amount_gbp: s.lineTotal,
      frequency: s.billingFrequency,
    })),
  };
}

export function toKarbonPayload(event: IntegrationEventPayload): KarbonEventPayload {
  const normalised = normaliseEventType(event.event);
  return {
    EventType: normalised.replace('.', '_'),
    Timestamp: event.occurredAt,
    Client: {
      FullName: event.proposal.clientName,
      EmailAddress: event.proposal.clientEmail ?? null,
    },
    WorkItem: {
      Key: event.proposal.reference,
      Title: event.proposal.title,
      Status: event.proposal.status,
      TotalAmount: event.proposal.total,
      Currency: 'GBP',
    },
    Fees: event.services.map((s) => ({
      Description: s.name,
      Amount: s.lineTotal,
      Frequency: s.billingFrequency,
    })),
  };
}

export function formatWebhookPayload(
  event: IntegrationEventPayload,
  format: WebhookFormat
): FormattedWebhookPayload {
  switch (format) {
    case 'hubspot':
      return toHubSpotPayload(event);
    case 'zapier':
      return toZapierPayload(event);
    case 'senta':
      return toSentaPayload(event);
    case 'karbon':
      return toKarbonPayload(event);
    default:
      return {
        ...event,
        event: normaliseEventType(event.event),
        proposal: {
          ...event.proposal,
          signedAt: event.proposal.signedAt ?? event.proposal.acceptedAt ?? null,
          signedBy: event.proposal.signedBy ?? event.proposal.acceptedBy ?? null,
        },
      };
  }
}

function webhookEventHeader(body: FormattedWebhookPayload): string {
  if ('event' in body && typeof body.event === 'string') return body.event;
  if ('eventName' in body) return body.eventName;
  if ('EventType' in body) return body.EventType;
  return 'unknown';
}

async function loadProposalEventContext(
  proposalId: string
): Promise<IntegrationEventPayload | null> {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: {
      client: { select: { name: true, contactEmail: true } },
      services: {
        select: { name: true, lineTotalPence: true, billingFrequency: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  if (!proposal) return null;

  const signedAt = proposal.acceptedAt?.toISOString() ?? null;

  return {
    event: 'proposal.sent',
    occurredAt: new Date().toISOString(),
    tenantId: proposal.tenantId,
    proposal: {
      id: proposal.id,
      reference: proposal.reference,
      title: proposal.title,
      status: proposal.status,
      total: penceToPounds(proposal.totalPence),
      currency: 'GBP',
      clientName: proposal.client.name,
      clientEmail: proposal.client.contactEmail,
      sentAt: proposal.sentAt?.toISOString() ?? null,
      viewedAt: proposal.viewedAt?.toISOString() ?? null,
      signedAt,
      signedBy: proposal.acceptedBy,
      declinedAt: proposal.declinedAt?.toISOString() ?? null,
      declinedBy: proposal.declinedBy,
      declineReason: proposal.declineReason,
      acceptedAt: signedAt,
      acceptedBy: proposal.acceptedBy,
    },
    services: proposal.services.map((s) => ({
      name: s.name,
      lineTotal: penceToPounds(s.lineTotalPence),
      billingFrequency: s.billingFrequency,
    })),
  };
}

async function postWebhook(
  webhookUrl: string,
  body: FormattedWebhookPayload,
  format: WebhookFormat
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Engage-Integration/1.0',
        'X-Engage-Event': webhookEventHeader(body),
        'X-Engage-Format': format,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn('Integration webhook returned non-2xx', {
        status: response.status,
        format,
      });
    }
  } catch (err) {
    logger.warn('Integration webhook delivery failed', { err, format });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Emit a proposal lifecycle event to the tenant webhook (fire-and-forget).
 */
export async function emitIntegrationEvent(
  tenantId: string,
  proposalId: string,
  eventType: IntegrationEventType,
  options?: {
    format?: WebhookFormat;
    extra?: Partial<IntegrationEventPayload['proposal']>;
  }
): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });

  const { webhookUrl, format: settingsFormat } = tenant
    ? parseWebhookConfig(tenant.settings)
    : { webhookUrl: null, format: 'default' as const };
  if (!webhookUrl) return;

  const base = await loadProposalEventContext(proposalId);
  if (!base) return;

  const payload: IntegrationEventPayload = {
    ...base,
    event: eventType,
    occurredAt: new Date().toISOString(),
    proposal: {
      ...base.proposal,
      ...options?.extra,
      signedAt:
        options?.extra?.signedAt ??
        options?.extra?.acceptedAt ??
        base.proposal.signedAt ??
        base.proposal.acceptedAt ??
        null,
      signedBy:
        options?.extra?.signedBy ??
        options?.extra?.acceptedBy ??
        base.proposal.signedBy ??
        base.proposal.acceptedBy ??
        null,
    },
  };

  const format = options?.format ?? settingsFormat;
  const body = formatWebhookPayload(payload, format);

  // Non-blocking — do not delay proposal flows
  void postWebhook(webhookUrl, body, format);
}

/**
 * Test webhook delivery (settings UI / diagnostics).
 */
export async function sendTestIntegrationWebhook(
  tenantId: string,
  format: WebhookFormat = 'default'
): Promise<{ delivered: boolean; webhookUrl: string }> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true, name: true },
  });

  const { webhookUrl } = tenant ? parseWebhookConfig(tenant.settings) : { webhookUrl: null };
  if (!webhookUrl) {
    return { delivered: false, webhookUrl: '' };
  }

  const testPayload: IntegrationEventPayload = {
    event: 'proposal.sent',
    occurredAt: new Date().toISOString(),
    tenantId,
    proposal: {
      id: '00000000-0000-0000-0000-000000000000',
      reference: 'TEST-0001',
      title: 'Engage webhook test event',
      status: 'SENT',
      total: 1200,
      currency: 'GBP',
      clientName: 'Test Client Ltd',
      clientEmail: 'test@example.com',
      sentAt: new Date().toISOString(),
    },
    services: [
      { name: 'Annual accounts', lineTotal: 800, billingFrequency: 'ANNUALLY' },
      { name: 'Bookkeeping', lineTotal: 400, billingFrequency: 'MONTHLY' },
    ],
  };

  const body = formatWebhookPayload(testPayload, format);
  await postWebhook(webhookUrl, body, format);

  return { delivered: true, webhookUrl };
}
