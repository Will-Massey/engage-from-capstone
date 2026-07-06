/**
 * Cloudflare Email Service delivery webhook — updates EmailLog, suppressions, proposal history
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import logger from '../../config/logger.js';
import { processEmailDeliveryEvent } from '../../services/emailDeliveryService.js';

const router = Router();

interface CloudflareEmailWebhookEvent {
  event?: string;
  type?: string;
  email?: string;
  recipient?: string;
  to?: string;
  messageId?: string;
  message_id?: string;
  emailLogId?: string;
  tenantId?: string;
  proposalId?: string;
  reason?: string;
  response?: string;
  timestamp?: string | number;
  metadata?: Record<string, string>;
  headers?: Record<string, string>;
  custom_args?: Record<string, string>;
}

function verifyCloudflareWebhookSecret(req: Request): boolean {
  const secret = process.env.CLOUDFLARE_EMAIL_WEBHOOK_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== 'production';
  }

  const authHeader = req.get('Authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const headerSecret = req.get('X-Webhook-Secret') || '';
  return bearer === secret || headerSecret === secret;
}

function pickString(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function normalizeEvent(evt: CloudflareEmailWebhookEvent) {
  const metadata = evt.metadata || evt.custom_args || {};
  const headers = evt.headers || {};

  const emailLogId = pickString(
    evt.emailLogId,
    metadata.emailLogId,
    headers['X-Email-Log-Id'],
    headers['x-email-log-id']
  );
  const tenantId = pickString(
    evt.tenantId,
    metadata.tenantId,
    headers['X-Tenant-Id'],
    headers['x-tenant-id']
  );
  const proposalId = pickString(
    evt.proposalId,
    metadata.proposalId,
    headers['X-Proposal-Id'],
    headers['x-proposal-id']
  );
  const messageId = pickString(evt.messageId, evt.message_id, metadata.messageId);
  const email = pickString(evt.email, evt.recipient, evt.to, metadata.email);
  const eventType = pickString(evt.event, evt.type, metadata.event) || 'unknown';
  const reason = pickString(evt.reason, evt.response, metadata.reason);

  return {
    emailLogId,
    tenantId,
    proposalId,
    messageId,
    email,
    event: eventType,
    reason,
    metadata: {
      timestamp: evt.timestamp,
      source: 'cloudflare-email-webhook',
      rawMetadata: metadata,
    },
  };
}

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    if (!verifyCloudflareWebhookSecret(req)) {
      res.status(401).json({ success: false, error: 'Invalid webhook secret' });
      return;
    }

    const events = Array.isArray(req.body) ? req.body : [req.body];

    for (const raw of events) {
      if (!raw || typeof raw !== 'object') continue;

      try {
        const evt = normalizeEvent(raw as CloudflareEmailWebhookEvent);
        await processEmailDeliveryEvent(evt);
      } catch (error) {
        logger.error('Cloudflare email webhook event processing failed:', error);
      }
    }

    res.status(200).json({ success: true });
  })
);

export default router;
