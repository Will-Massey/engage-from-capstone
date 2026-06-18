/**
 * SendGrid platform transport for multi-tenant Engage mailer.
 */

import sgMail from '@sendgrid/mail';
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

let apiKeyConfigured = false;

function ensureApiKey(): boolean {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    return false;
  }
  if (!apiKeyConfigured) {
    sgMail.setApiKey(apiKey);
    apiKeyConfigured = true;
  }
  return true;
}

export function isSendGridConfigured(): boolean {
  return !!process.env.SENDGRID_API_KEY;
}

export function getPlatformFromAddress(): { email: string; name: string } {
  return {
    email:
      process.env.EMAIL_PLATFORM_FROM ||
      process.env.EMAIL_FROM_ADDRESS ||
      'notifications@engage.capstonesoftware.co.uk',
    name: process.env.EMAIL_PLATFORM_FROM_NAME || process.env.EMAIL_FROM_NAME || 'Engage by Capstone',
  };
}

export async function sendViaSendGrid(params: SendGridSendParams): Promise<SendGridSendResult> {
  if (!ensureApiKey()) {
    return { success: false, error: 'SENDGRID_API_KEY not configured' };
  }

  try {
    const attachments = (params.attachments || []).map((a) => ({
      filename: a.filename,
      type: a.contentType || 'application/octet-stream',
      disposition: 'attachment' as const,
      content:
        typeof a.content === 'string' ? a.content : a.content.toString('base64'),
    }));

    const [response] = await sgMail.send({
      to: params.to,
      cc: params.cc,
      from: {
        email: params.from,
        name: params.fromName,
      },
      replyTo: params.replyTo,
      subject: params.subject,
      html: params.html,
      text: params.text,
      attachments: attachments.length > 0 ? attachments : undefined,
      customArgs: params.customArgs,
    });

    const messageId = response.headers?.['x-message-id'] as string | undefined;
    logger.info(`SendGrid email sent: ${messageId || 'ok'}`);
    return { success: true, messageId };
  } catch (error: any) {
    const detail =
      error?.response?.body?.errors?.[0]?.message || error?.message || 'SendGrid send failed';
    logger.error('SendGrid send failed:', detail);
    return { success: false, error: detail };
  }
}
