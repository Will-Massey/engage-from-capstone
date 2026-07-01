/**
 * W4.2 — HubSpot + Zapier proposal lifecycle webhooks.
 * Emits: proposal.sent, proposal.accepted, proposal.declined
 */

import { prisma } from '../config/database.js';
import logger from '../utils/logger.js';

export type IntegrationEventType = 'proposal.sent' | 'proposal.accepted' | 'proposal.declined';

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
    acceptedAt?: string | null;
    acceptedBy?: string | null;
    declinedAt?: string | null;
    declinedBy?: string | null;
    declineReason?: string | null;
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

function parseWebhookConfig(settingsJson: string): {
  webhookUrl: string | null;
  format: 'default' | 'hubspot';
} {
  try {
    const settings = JSON.parse(settingsJson || '{}') as {
      webhookUrl?: string;
      integrations?: { webhookUrl?: string; webhookFormat?: 'default' | 'hubspot' };
    };
    const url = settings.webhookUrl || settings.integrations?.webhookUrl;
    const format =
      settings.integrations?.webhookFormat === 'hubspot' ? 'hubspot' : 'default';
    if (typeof url === 'string' && url.trim().startsWith('https://')) {
      return { webhookUrl: url.trim(), format };
    }
    return { webhookUrl: null, format };
  } catch {
    return { webhookUrl: null, format: 'default' };
  }
}

export function toHubSpotPayload(event: IntegrationEventPayload): HubSpotEventPayload {
  const hubspotEventName = event.event.replace('.', '_');
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
      accepted_at: event.proposal.acceptedAt ?? null,
      accepted_by: event.proposal.acceptedBy ?? null,
      declined_at: event.proposal.declinedAt ?? null,
      declined_by: event.proposal.declinedBy ?? null,
      decline_reason: event.proposal.declineReason ?? null,
      service_count: event.services.length,
      services_summary: event.services.map((s) => s.name).join('; '),
    },
  };
}

async function loadProposalEventContext(proposalId: string): Promise<IntegrationEventPayload | null> {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: {
      client: { select: { name: true, contactEmail: true } },
      services: {
        select: { name: true, lineTotal: true, billingFrequency: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  if (!proposal) return null;

  return {
    event: 'proposal.sent',
    occurredAt: new Date().toISOString(),
    tenantId: proposal.tenantId,
    proposal: {
      id: proposal.id,
      reference: proposal.reference,
      title: proposal.title,
      status: proposal.status,
      total: proposal.total,
      currency: 'GBP',
      clientName: proposal.client.name,
      clientEmail: proposal.client.contactEmail,
      sentAt: proposal.sentAt?.toISOString() ?? null,
      acceptedAt: proposal.acceptedAt?.toISOString() ?? null,
      declinedAt: proposal.declinedAt?.toISOString() ?? null,
      declinedBy: proposal.declinedBy,
      declineReason: proposal.declineReason,
    },
    services: proposal.services.map((s) => ({
      name: s.name,
      lineTotal: s.lineTotal,
      billingFrequency: s.billingFrequency,
    })),
  };
}

async function postWebhook(
  webhookUrl: string,
  body: IntegrationEventPayload | HubSpotEventPayload,
  format: 'default' | 'hubspot'
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Engage-Integration/1.0',
        'X-Engage-Event':
          'event' in body
            ? (body as IntegrationEventPayload).event
            : (body as HubSpotEventPayload).eventName,
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
  options?: { format?: 'default' | 'hubspot'; extra?: Partial<IntegrationEventPayload['proposal']> }
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
    },
  };

  const format = options?.format ?? settingsFormat;
  const body = format === 'hubspot' ? toHubSpotPayload(payload) : payload;

  // Non-blocking — do not delay proposal flows
  void postWebhook(webhookUrl, body, format);
}

/**
 * Test webhook delivery (settings UI / diagnostics).
 */
export async function sendTestIntegrationWebhook(
  tenantId: string,
  format: 'default' | 'hubspot' = 'default'
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
      total: 0,
      currency: 'GBP',
      clientName: 'Test Client Ltd',
      clientEmail: 'test@example.com',
      sentAt: new Date().toISOString(),
    },
    services: [{ name: 'Test service', lineTotal: 0, billingFrequency: 'MONTHLY' }],
  };

  const body = format === 'hubspot' ? toHubSpotPayload(testPayload) : testPayload;
  await postWebhook(webhookUrl, body, format);

  return { delivered: true, webhookUrl };
}