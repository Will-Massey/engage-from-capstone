/**
 * Unified tenant-aware mailer — platform Cloudflare Email default with optional custom SMTP/OAuth.
 */

import { prisma } from '../config/database.js';
import logger from '../config/logger.js';
import {
  EmailService,
  type EmailMessage,
  type EmailConfig,
} from './emailService.js';
import {
  getPlatformFromAddress,
  isSendGridConfigured,
  sendViaSendGrid,
} from './sendgridTransport.js';
import {
  isCustomEmailConfigured,
  loadTenantEmailContext,
  resolveReplyToEmail,
  tenantEmailToConfig,
} from './tenantEmailSettings.js';
import type { EmailMessageType, EmailProvider, EmailDeliveryStatus } from '@prisma/client';

export type { EmailMessageType };

export interface TenantMailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface TenantMailMessage {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: TenantMailAttachment[];
  replyTo?: string;
}

export interface TenantMailSendOptions {
  tenantId: string;
  messageType: EmailMessageType;
  message: TenantMailMessage;
  relatedIds?: {
    clientId?: string;
    proposalId?: string;
    touchpointId?: string;
  };
  /** Force platform email even if custom is configured */
  forcePlatform?: boolean;
}

export interface TenantMailSendResult {
  success: boolean;
  messageId?: string;
  emailLogId?: string;
  provider?: EmailProvider;
  error?: string;
}

const emailServiceCache = new Map<string, Promise<EmailService>>();

async function getCustomEmailService(config: EmailConfig): Promise<EmailService> {
  const key = JSON.stringify({
    provider: config.provider,
    from: config.fromEmail,
    host: config.smtp?.host,
    user: config.smtp?.user || config.gmail?.user || config.outlook?.user,
  });

  if (!emailServiceCache.has(key)) {
    emailServiceCache.set(key, EmailService.createReady(config));
  }

  return emailServiceCache.get(key)!;
}

async function isSuppressed(tenantId: string, to: string | string[]): Promise<boolean> {
  const addresses = Array.isArray(to) ? to : [to];
  const normalized = addresses.map((a) => a.toLowerCase().trim());
  const hit = await prisma.emailSuppression.findFirst({
    where: { tenantId, email: { in: normalized } },
  });
  return !!hit;
}

function mapNodemailerProvider(provider: string): EmailProvider {
  switch (provider) {
    case 'smtp':
      return 'SMTP';
    case 'gmail':
      return 'GMAIL';
    case 'outlook':
      return 'OUTLOOK';
    case 'microsoft365':
      return 'MICROSOFT365';
    default:
      return 'SMTP';
  }
}

async function sendWithCustom(
  config: EmailConfig,
  message: TenantMailMessage,
  replyTo: string
): Promise<{ success: boolean; messageId?: string; error?: string; bounced?: string[] }> {
  const service = await getCustomEmailService(config);
  const payload: EmailMessage = {
    to: message.to,
    cc: message.cc,
    subject: message.subject,
    html: message.html,
    text: message.text,
    attachments: message.attachments,
  };

  // Nodemailer supports replyTo via headers — extend sendEmail if needed
  const result = await service.sendEmail({
    ...payload,
    replyTo,
  });

  return result;
}

function buildPlatformCustomArgs(
  base: Record<string, string>,
  proposalId?: string
): Record<string, string> {
  return proposalId ? { ...base, proposalId } : base;
}

async function sendWithPlatform(
  tenantName: string,
  message: TenantMailMessage,
  replyTo: string,
  customArgs?: Record<string, string>
): Promise<{ success: boolean; messageId?: string; error?: string; bounced?: string[] }> {
  const platformFrom = getPlatformFromAddress();
  const fromName = tenantName || platformFrom.name;

  let html = message.html || '';
  if (html && !html.includes('via Engage')) {
    html += `<p style="font-size:11px;color:#94a3b8;margin-top:24px;">Sent on behalf of ${tenantName} via Engage by Capstone.</p>`;
  }

  return sendViaSendGrid({
    to: message.to,
    cc: message.cc,
    from: platformFrom.email,
    fromName,
    replyTo,
    subject: message.subject,
    html,
    text: message.text,
    attachments: message.attachments,
    customArgs,
  });
}

export async function tenantMailerSend(options: TenantMailSendOptions): Promise<TenantMailSendResult> {
  const { tenantId, messageType, message, relatedIds, forcePlatform } = options;

  const ctx = await loadTenantEmailContext(tenantId);
  if (!ctx) {
    return { success: false, error: 'Tenant not found' };
  }

  const replyTo = await resolveReplyToEmail(tenantId, ctx.email, message.replyTo);
  const toStr = Array.isArray(message.to) ? message.to.join(', ') : message.to;

  if (await isSuppressed(tenantId, message.to)) {
    const log = await prisma.emailLog.create({
      data: {
        tenantId,
        clientId: relatedIds?.clientId,
        proposalId: relatedIds?.proposalId,
        touchpointId: relatedIds?.touchpointId,
        messageType,
        provider: 'SENDGRID',
        status: 'SUPPRESSED',
        to: toStr,
        from: getPlatformFromAddress().email,
        replyTo,
        subject: message.subject,
        error: 'Recipient is on suppression list',
      },
    });
    return { success: false, error: 'Recipient suppressed', emailLogId: log.id, provider: 'SENDGRID' };
  }

  const useCustom = !forcePlatform && isCustomEmailConfigured(ctx.email);
  const customConfig = useCustom ? tenantEmailToConfig(ctx.email, ctx.tenantName) : null;

  const platformFrom = getPlatformFromAddress();
  const fromAddress = customConfig?.fromEmail || platformFrom.email;

  const log = await prisma.emailLog.create({
    data: {
      tenantId,
      clientId: relatedIds?.clientId,
      proposalId: relatedIds?.proposalId,
      touchpointId: relatedIds?.touchpointId,
      messageType,
      provider: useCustom ? mapNodemailerProvider(customConfig!.provider) : 'SENDGRID',
      status: 'QUEUED',
      to: toStr,
      from: fromAddress,
      replyTo,
      subject: message.subject,
    },
  });

  let result: { success: boolean; messageId?: string; error?: string; bounced?: string[] };
  let provider: EmailProvider = useCustom ? mapNodemailerProvider(customConfig!.provider) : 'SENDGRID';

  if (useCustom && customConfig) {
    result = await sendWithCustom(customConfig, message, replyTo);
    if (!result.success && isSendGridConfigured()) {
      logger.warn(`Custom email failed for tenant ${tenantId}, falling back to platform email`);
      result = await sendWithPlatform(
        ctx.tenantName,
        message,
        replyTo,
        buildPlatformCustomArgs(
          {
            tenantId,
            emailLogId: log.id,
            messageType,
          },
          relatedIds?.proposalId
        )
      );
      provider = 'SENDGRID';
    }
  } else if (isSendGridConfigured()) {
    result = await sendWithPlatform(
      ctx.tenantName,
      message,
      replyTo,
      buildPlatformCustomArgs(
        {
          tenantId,
          emailLogId: log.id,
          messageType,
        },
        relatedIds?.proposalId
      )
    );
    provider = 'SENDGRID';
  } else {
    result = { success: false, error: 'No email transport configured (set EMAIL_WORKER_URL or tenant SMTP)' };
  }

  const deliveryStatus: EmailDeliveryStatus = result.bounced?.length
    ? 'BOUNCED'
    : result.success
      ? 'SENT'
      : 'FAILED';

  await prisma.emailLog.update({
    where: { id: log.id },
    data: {
      provider,
      status: deliveryStatus,
      externalId: result.messageId,
      error: result.error,
      sentAt: result.success ? new Date() : undefined,
    },
  });

  return {
    success: result.success,
    messageId: result.messageId,
    emailLogId: log.id,
    provider,
    error: result.error,
  };
}

/** Proposal email with existing HTML template */
export async function sendProposalEmailForTenant(
  tenantId: string,
  params: {
    to: string;
    clientName: string;
    proposalTitle: string;
    proposalReference: string;
    viewLink: string;
    senderName: string;
    senderPosition?: string;
    senderEmail: string;
    tenantName: string;
    validUntil: string;
    totalAmount?: string;
    serviceCount?: number;
    attachment?: Buffer;
    /** Clara-generated overrides — used instead of the default template when provided */
    aiHtml?: string;
    aiText?: string;
    aiSubject?: string;
  },
  relatedIds?: { proposalId?: string; clientId?: string }
): Promise<TenantMailSendResult> {
  const { composeProposalSendEmail, prepareProposalPdfAttachment } = await import(
    '../templates/proposalSendEmailComposer.js'
  );

  const { html, text, subject } = composeProposalSendEmail({
    clientName: params.clientName,
    tenantName: params.tenantName,
    proposalReference: params.proposalReference,
    proposalTitle: params.proposalTitle,
    viewLink: params.viewLink,
    senderName: params.senderName,
    senderPosition: params.senderPosition,
    senderEmail: params.senderEmail,
    validUntil: params.validUntil,
    totalAmount: params.totalAmount,
    serviceCount: params.serviceCount,
    aiHtml: params.aiHtml,
    aiText: params.aiText,
    aiSubject: params.aiSubject,
  });

  const pdfAttachment = prepareProposalPdfAttachment(params.attachment, params.proposalReference);
  if (params.attachment && !pdfAttachment) {
    logger.warn(
      `Proposal ${params.proposalReference}: PDF attachment omitted (invalid or empty PDF buffer)`
    );
  }
  const attachments = pdfAttachment
    ? [
        {
          filename: pdfAttachment.filename,
          content: pdfAttachment.content,
          contentType: pdfAttachment.contentType,
        },
      ]
    : undefined;

  return tenantMailerSend({
    tenantId,
    messageType: 'PROPOSAL',
    message: {
      to: params.to,
      subject,
      html,
      text,
      attachments,
      replyTo: params.senderEmail,
    },
    relatedIds,
  });
}

/** Acceptance notification to practice */
export async function sendAcceptanceNotificationForTenant(
  tenantId: string,
  params: {
    to: string;
    clientName: string;
    proposalTitle: string;
    proposalReference: string;
    acceptedAt: Date;
    totalAmount: string;
    signedBy: string;
    signedByRole: string;
    proposalPdf: Buffer;
    signaturePng?: Buffer;
    replyTo?: string;
    personalizedMessage?: string;
    subject?: string;
    proposalUrl?: string;
  },
  relatedIds?: { proposalId?: string; clientId?: string }
): Promise<TenantMailSendResult> {
  const { generateAcceptanceNotification } = await import('../templates/acceptanceNotification.js');
  const generated = generateAcceptanceNotification({
    clientName: params.clientName,
    proposalTitle: params.proposalTitle,
    proposalReference: params.proposalReference,
    acceptedAt: params.acceptedAt,
    totalAmount: params.totalAmount,
    signedBy: params.signedBy,
    signedByRole: params.signedByRole,
    personalizedMessage: params.personalizedMessage,
    proposalUrl: params.proposalUrl,
  });
  const html = generated.html;
  const text = generated.text;
  const subject = params.subject || generated.subject;

  const attachments: TenantMailAttachment[] = [
    {
      filename: `Proposal_${params.proposalReference}_Signed.pdf`,
      content: params.proposalPdf,
      contentType: 'application/pdf',
    },
  ];

  if (params.signaturePng) {
    attachments.push({
      filename: `Signature_${params.proposalReference}.png`,
      content: params.signaturePng,
      contentType: 'image/png',
    });
  }

  return tenantMailerSend({
    tenantId,
    messageType: 'ACCEPTANCE',
    message: { to: params.to, subject, html, text, attachments, replyTo: params.replyTo },
    relatedIds,
  });
}

export async function getEmailStatusForTenant(tenantId: string) {
  const ctx = await loadTenantEmailContext(tenantId);
  const platformReady = isSendGridConfigured();
  const customReady = ctx ? isCustomEmailConfigured(ctx.email) : false;
  const replyTo = ctx ? await resolveReplyToEmail(tenantId, ctx.email) : null;
  const platformFrom = getPlatformFromAddress();

  return {
    mode: customReady ? 'custom' : 'platform',
    platformReady,
    customReady,
    replyTo,
    platformFrom: platformFrom.email,
    customFrom: ctx?.email.fromEmail || null,
    provider: customReady ? ctx?.email.provider : 'sendgrid',
  };
}

export const tenantMailer = {
  send: tenantMailerSend,
  sendProposalEmail: sendProposalEmailForTenant,
  sendAcceptanceNotification: sendAcceptanceNotificationForTenant,
  getStatus: getEmailStatusForTenant,
};

export default tenantMailer;
