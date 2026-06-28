/**
 * Platform email transport — Cloudflare Email Service (replaces SendGrid).
 * Export names kept for compatibility with tenantMailer.
 */

import logger from '../config/logger.js';

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
}

export function isSendGridConfigured(): boolean {
  return Boolean(
    (process.env.EMAIL_WORKER_URL && process.env.EMAIL_WORKER_SECRET) ||
    (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_EMAIL_API_TOKEN)
  );
}

export function getPlatformFromAddress(): { email: string; name: string } {
  return {
    email:
      process.env.EMAIL_PLATFORM_FROM ||
      process.env.EMAIL_FROM_ADDRESS ||
      'proposals@capstonesoftware.co.uk',
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

async function sendViaCloudflareApi(payload: Record<string, unknown>): Promise<SendGridSendResult> {
  const token = process.env.CLOUDFLARE_EMAIL_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) {
    return { success: false, error: 'CLOUDFLARE_ACCOUNT_ID/API_TOKEN not configured' };
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
    result?: { delivered?: string[] };
  };

  if (!res.ok || !data.success) {
    return {
      success: false,
      error: data.errors?.[0]?.message || `Cloudflare email API returned ${res.status}`,
    };
  }

  return { success: true, messageId: data.result?.delivered?.[0] };
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

    const viaWorker = process.env.EMAIL_WORKER_URL && process.env.EMAIL_WORKER_SECRET;
    const result = viaWorker
      ? await sendViaWorker(payload)
      : await sendViaCloudflareApi(payload);

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