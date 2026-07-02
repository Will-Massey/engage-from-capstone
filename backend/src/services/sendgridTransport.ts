/**
 * Platform email transport — Cloudflare Email Service (replaces SendGrid).
 * Export names kept for compatibility with tenantMailer.
 */

import logger from '../config/logger.js';
import { processEmailDeliveryEvent } from './emailDeliveryService.js';

export interface SendGridAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface SendGridSendParams {
  to: string | string[];
  cc?: string | string[];
  from: string;
  fromName: string;
  replyTo?: string;
  subject: string;
  html?: string;
  text?: string;
  attachments?: SendGridAttachment[];
  customArgs?: Record<string, string>;
}

export interface SendGridSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  delivered?: string[];
  bounced?: string[];
  queued?: string[];
}

export function isSendGridConfigured(): boolean {
  return Boolean(
    (process.env.EMAIL_WORKER_URL && process.env.EMAIL_WORKER_SECRET) ||
    (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_EMAIL_API_TOKEN)
  );
}

/** Cloudflare Email Sending only has capstonesoftware.co.uk onboarded — not engage.* subdomain. */
const PLATFORM_FROM_EMAIL =
  process.env.EMAIL_PLATFORM_FROM ||
  process.env.EMAIL_FROM_ADDRESS ||
  'proposals@capstonesoftware.co.uk';

export function getPlatformFromAddress(): { email: string; name: string } {
  const email = PLATFORM_FROM_EMAIL.includes('@engage.capstonesoftware.co.uk')
    ? 'proposals@capstonesoftware.co.uk'
    : PLATFORM_FROM_EMAIL;
  return {
    email,
    name:
      process.env.EMAIL_PLATFORM_FROM_NAME ||
      process.env.EMAIL_FROM_NAME ||
      'Capstone Engage',
  };
}

async function sendViaWorker(payload: Record<string, unknown>): Promise<SendGridSendResult> {
  const url = process.env.EMAIL_WORKER_URL;
  const secret = process.env.EMAIL_WORKER_SECRET;
  if (!url || !secret) {
    return { success: false, error: 'EMAIL_WORKER_URL/SECRET not configured' };
  }

  const res = await fetch(`${url.replace(/\/$/, '')}/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as { error?: string; result?: { messageId?: string } };
  if (!res.ok) {
    return { success: false, error: data.error || `Email worker returned ${res.status}` };
  }

  return { success: true, messageId: data.result?.messageId };
}

function buildTrackingHeaders(customArgs?: Record<string, string>): Record<string, string> | undefined {
  if (!customArgs) return undefined;

  const headers: Record<string, string> = {};
  if (customArgs.emailLogId) headers['X-Email-Log-Id'] = customArgs.emailLogId;
  if (customArgs.tenantId) headers['X-Tenant-Id'] = customArgs.tenantId;
  if (customArgs.proposalId) headers['X-Proposal-Id'] = customArgs.proposalId;
  if (customArgs.messageType) headers['X-Message-Type'] = customArgs.messageType;

  return Object.keys(headers).length ? headers : undefined;
}

async function processImmediateBounces(
  bounced: string[],
  customArgs?: Record<string, string>
): Promise<void> {
  for (const email of bounced) {
    await processEmailDeliveryEvent({
      emailLogId: customArgs?.emailLogId,
      tenantId: customArgs?.tenantId,
      proposalId: customArgs?.proposalId,
      email,
      event: 'bounce',
      reason: 'Permanent bounce at send time',
      metadata: { source: 'cloudflare-send-api' },
    });
  }
}

async function sendViaCloudflareApi(
  payload: Record<string, unknown>,
  customArgs?: Record<string, string>
): Promise<SendGridSendResult> {
  const token = process.env.CLOUDFLARE_EMAIL_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) {
    return { success: false, error: 'CLOUDFLARE_ACCOUNT_ID/API_TOKEN not configured' };
  }

  const trackingHeaders = buildTrackingHeaders(customArgs);
  if (trackingHeaders) {
    payload.headers = {
      ...(typeof payload.headers === 'object' && payload.headers !== null
        ? (payload.headers as Record<string, string>)
        : {}),
      ...trackingHeaders,
    };
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  const data = (await res.json()) as {
    success?: boolean;
    errors?: Array<{ message?: string }>;
    result?: {
      delivered?: string[];
      permanent_bounces?: string[];
      queued?: string[];
    };
  };

  if (!res.ok || !data.success) {
    return {
      success: false,
      error: data.errors?.[0]?.message || `Cloudflare email API returned ${res.status}`,
    };
  }

  const delivered = data.result?.delivered || [];
  const bounced = data.result?.permanent_bounces || [];
  const queued = data.result?.queued || [];

  if (bounced.length) {
    await processImmediateBounces(bounced, customArgs);
  }

  const hasDelivery = delivered.length > 0 || queued.length > 0;

  return {
    success: hasDelivery,
    messageId: customArgs?.emailLogId,
    delivered,
    bounced,
    queued,
    error: hasDelivery ? undefined : 'All recipients permanently bounced',
  };
}

export async function sendViaSendGrid(params: SendGridSendParams): Promise<SendGridSendResult> {
  if (!isSendGridConfigured()) {
    return {
      success: false,
      error: 'Platform email not configured (set EMAIL_WORKER_URL or CLOUDFLARE_EMAIL_API_TOKEN)',
    };
  }

  try {
    const payload: Record<string, unknown> = {
      to: params.to,
      cc: params.cc,
      from: { address: params.from, name: params.fromName },
      reply_to: params.replyTo || process.env.EMAIL_REPLY_TO || 'support@capstonesoftware.co.uk',
      subject: params.subject,
      html: params.html,
      text: params.text,
    };

    if (params.attachments?.length) {
      payload.attachments = params.attachments.map((a) => ({
        content:
          typeof a.content === 'string' ? a.content : a.content.toString('base64'),
        filename: a.filename,
        type: a.contentType || 'application/octet-stream',
        disposition: 'attachment',
      }));
    }

    if (params.customArgs) {
      payload.custom_args = params.customArgs;
      payload.metadata = params.customArgs;
    }

    const viaWorker = process.env.EMAIL_WORKER_URL && process.env.EMAIL_WORKER_SECRET;
    const result = viaWorker
      ? await sendViaWorker(payload)
      : await sendViaCloudflareApi(payload, params.customArgs);

    if (result.success) {
      logger.info(`Cloudflare platform email sent: ${result.messageId || 'ok'}`);
    }
    return result;
  } catch (error: any) {
    const detail = error?.message || 'Platform email send failed';
    logger.error('Cloudflare platform email failed:', detail);
    return { success: false, error: detail };
  }
}