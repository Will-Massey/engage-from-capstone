/**
 * Practice acceptance notifications — personalised admin alerts when a proposal is signed.
 */

import { prisma } from '../config/database.js';
import { getFrontendUrl } from '../config/urls.js';
import logger from '../config/logger.js';
import { PDFGenerator } from './pdfGenerator.js';
import { tenantMailer } from './tenantMailer.js';
import { getSignatureImage } from './proposalSharingService.js';
import {
  generateAcceptanceAdminNotification,
  tenantUseAiEmails,
  type AcceptanceAdminContext,
} from './ai/lifecycleAiEmailService.js';

const COMPANY_TYPE_LABELS: Record<string, string> = {
  SOLE_TRADER: 'sole trader',
  PARTNERSHIP: 'partnership',
  LIMITED_COMPANY: 'limited company',
  LLP: 'LLP',
  CHARITY: 'charity',
  OTHER: 'business',
};

export interface SendPracticeAcceptanceParams {
  proposalId: string;
  tenantId: string;
  signatureId: string;
  signedBy: string;
  signedByRole: string;
  signerEmail?: string | null;
}

function formatCompanyType(type?: string | null): string {
  if (!type) return 'client';
  return COMPANY_TYPE_LABELS[type] || type.toLowerCase().replace(/_/g, ' ');
}

function formatGbp(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
}

function formatDuration(hours: number | null, days: number | null): string | null {
  if (hours !== null && hours < 48) {
    if (hours < 1) return 'less than an hour';
    if (hours === 1) return '1 hour';
    return `${hours} hours`;
  }
  if (days !== null) {
    if (days === 0) return 'the same day';
    if (days === 1) return '1 day';
    return `${days} days`;
  }
  return null;
}

export async function buildAcceptanceAdminContext(
  proposalId: string,
  tenantId: string,
  signatureId: string
): Promise<AcceptanceAdminContext | null> {
  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, tenantId },
    include: {
      client: true,
      tenant: true,
      services: true,
      views: { orderBy: { viewedAt: 'asc' } },
      signatures: { where: { id: signatureId }, take: 1 },
      createdBy: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  if (!proposal) return null;

  const signature = proposal.signatures[0];
  const acceptedAt = proposal.acceptedAt || signature?.signedAt || new Date();
  const sentAt = proposal.sentAt;

  let hoursToSign: number | null = null;
  let daysToSign: number | null = null;
  if (sentAt) {
    const ms = acceptedAt.getTime() - sentAt.getTime();
    hoursToSign = Math.max(0, Math.round(ms / 3600000));
    daysToSign = Math.max(0, Math.floor(ms / 86400000));
  }

  const viewCount = proposal.views.length;
  const firstView = proposal.views[0]?.viewedAt;
  let hoursFromFirstViewToSign: number | null = null;
  if (firstView) {
    hoursFromFirstViewToSign = Math.max(
      0,
      Math.round((acceptedAt.getTime() - firstView.getTime()) / 3600000)
    );
  }

  const totalViewMinutes = proposal.views.reduce(
    (sum, v) => sum + (v.viewDuration ? Math.round(v.viewDuration / 60) : 0),
    0
  );

  return {
    practiceName: proposal.tenant.name,
    clientName: proposal.client.name,
    clientCompanyType: formatCompanyType(proposal.client.companyType),
    clientTurnover: proposal.client.turnover,
    clientEmployees: proposal.client.employeeCount,
    proposalTitle: proposal.title,
    proposalReference: proposal.reference,
    totalAmount: formatGbp(proposal.total),
    serviceCount: proposal.services.length,
    servicesSummary: proposal.services
      .slice(0, 6)
      .map((s) => `${s.name} (${formatGbp(s.displayPrice || s.unitPrice)})`)
      .join('; '),
    signedBy: signature?.signedBy || proposal.acceptedBy || 'Client signatory',
    signedByRole: signature?.signedByRole || proposal.signatoryPosition || 'Authorised signatory',
    signerEmail: signature?.signerEmail || null,
    acceptedAtIso: acceptedAt.toISOString(),
    sentAtIso: sentAt?.toISOString() || null,
    hoursToSign,
    daysToSign,
    timeToSignLabel: formatDuration(hoursToSign, daysToSign),
    viewCount,
    hoursFromFirstViewToSign,
    totalViewMinutes,
    geoLocation: signature?.geoLocation || null,
    deviceInfo: signature?.deviceInfo || null,
    createdByName: proposal.createdBy
      ? `${proposal.createdBy.firstName} ${proposal.createdBy.lastName}`.trim()
      : null,
    proposalUrl: `${getFrontendUrl()}/proposals/${proposal.id}`,
  };
}

export async function resolvePracticeAcceptanceRecipients(
  tenantId: string,
  createdByEmail?: string | null
): Promise<Array<{ email: string; firstName: string }>> {
  const admins = await prisma.user.findMany({
    where: { tenantId, isActive: true, role: 'ADMIN' },
    select: { email: true, firstName: true },
    orderBy: { createdAt: 'asc' },
  });

  const recipients = admins.map((u) => ({ email: u.email, firstName: u.firstName }));

  if (createdByEmail) {
    const normalised = createdByEmail.toLowerCase().trim();
    const already = recipients.some((r) => r.email.toLowerCase() === normalised);
    if (!already) {
      const creator = await prisma.user.findFirst({
        where: { tenantId, email: createdByEmail, isActive: true },
        select: { email: true, firstName: true },
      });
      if (creator) {
        recipients.push({ email: creator.email, firstName: creator.firstName });
      }
    }
  }

  if (!recipients.length && createdByEmail) {
    recipients.push({ email: createdByEmail, firstName: 'there' });
  }

  return recipients;
}

function buildFallbackPersonalMessage(ctx: AcceptanceAdminContext): string {
  const highlights: string[] = [];

  if (ctx.timeToSignLabel && ctx.sentAtIso) {
    highlights.push(
      `${ctx.clientName} signed ${ctx.timeToSignLabel} after the proposal was sent — worth a quick congratulations call.`
    );
  } else {
    highlights.push(`${ctx.clientName} has just accepted your proposal.`);
  }

  if (ctx.viewCount > 1) {
    highlights.push(
      `They opened the proposal ${ctx.viewCount} times before signing${ctx.totalViewMinutes ? ` (about ${ctx.totalViewMinutes} minutes of reading in total)` : ''}.`
    );
  } else if (ctx.viewCount === 1) {
    highlights.push('They viewed the proposal once before signing.');
  } else if (ctx.viewCount === 0) {
    highlights.push(
      'They signed without a recorded prior view — they may have read the email PDF directly.'
    );
  }

  if (ctx.hoursFromFirstViewToSign !== null && ctx.hoursFromFirstViewToSign < 24) {
    highlights.push(
      `From first open to signature was roughly ${ctx.hoursFromFirstViewToSign} hour${ctx.hoursFromFirstViewToSign === 1 ? '' : 's'}.`
    );
  }

  if (ctx.geoLocation) {
    highlights.push(`Signature recorded from approximately ${ctx.geoLocation}.`);
  }

  if (ctx.clientCompanyType) {
    const extra =
      ctx.clientTurnover || ctx.clientEmployees
        ? ` (${[
            ctx.clientEmployees ? `${ctx.clientEmployees} employees` : null,
            ctx.clientTurnover ? `~${formatGbp(ctx.clientTurnover)} turnover` : null,
          ]
            .filter(Boolean)
            .join(', ')})`
        : '';
    highlights.push(`This is a ${ctx.clientCompanyType} engagement${extra}.`);
  }

  return highlights.join('\n\n');
}

export async function sendPracticeAcceptanceNotifications(
  params: SendPracticeAcceptanceParams
): Promise<{ sent: number; failed: number }> {
  const { proposalId, tenantId, signatureId, signedBy, signedByRole, signerEmail } = params;

  const context = await buildAcceptanceAdminContext(proposalId, tenantId, signatureId);
  if (!context) {
    logger.warn(`Acceptance notification skipped — proposal ${proposalId} not found`);
    return { sent: 0, failed: 0 };
  }

  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, tenantId },
    include: {
      client: true,
      createdBy: { select: { email: true } },
      tenant: { select: { settings: true } },
    },
  });

  if (!proposal) return { sent: 0, failed: 0 };

  const recipients = await resolvePracticeAcceptanceRecipients(tenantId, proposal.createdBy?.email);

  if (!recipients.length) {
    logger.warn(`No acceptance notification recipients for tenant ${tenantId}`);
    return { sent: 0, failed: 0 };
  }

  const tenantSettings = proposal.tenant.settings;
  let subject: string | undefined;
  let personalizedMessage: string;

  if (tenantUseAiEmails(tenantSettings)) {
    try {
      const draft = await generateAcceptanceAdminNotification(tenantId, context);
      subject = draft.subject;
      personalizedMessage = draft.body;
    } catch (err) {
      logger.warn('AI acceptance admin email failed, using template fallback', err);
      personalizedMessage = buildFallbackPersonalMessage(context);
    }
  } else {
    personalizedMessage = buildFallbackPersonalMessage(context);
  }

  let proposalPdf: Buffer;
  let signaturePng: Buffer | undefined;
  try {
    proposalPdf = await PDFGenerator.generateProposal(proposalId);
    const signatureImage = await getSignatureImage(signatureId, tenantId);
    if (signatureImage) {
      signaturePng = Buffer.from(signatureImage.split(',')[1], 'base64');
    }
  } catch (err) {
    logger.error('Failed to generate acceptance notification attachments', err);
    return { sent: 0, failed: recipients.length };
  }

  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    const greeting =
      recipient.firstName && recipient.firstName !== 'there'
        ? `Hi ${recipient.firstName},`
        : 'Hi there,';

    const messageWithGreeting = `${greeting}\n\n${personalizedMessage}`;

    const result = await tenantMailer.sendAcceptanceNotification(
      tenantId,
      {
        to: recipient.email,
        clientName: proposal.client.name,
        proposalTitle: proposal.title,
        proposalReference: proposal.reference,
        acceptedAt: new Date(context.acceptedAtIso),
        totalAmount: context.totalAmount,
        signedBy,
        signedByRole,
        proposalPdf,
        signaturePng,
        replyTo: signerEmail || undefined,
        personalizedMessage: messageWithGreeting,
        subject,
        proposalUrl: context.proposalUrl,
      },
      { proposalId, clientId: proposal.clientId }
    );

    if (result.success) {
      sent++;
    } else {
      failed++;
      logger.error(`Acceptance notification failed for ${recipient.email}: ${result.error}`);
    }
  }

  if (sent > 0) {
    await prisma.proposal.update({
      where: { id: proposalId },
      data: { acceptanceNotifiedAt: new Date() },
    });
    await prisma.activityLog.create({
      data: {
        tenantId,
        action: 'PROPOSAL_ACCEPTANCE_NOTIFIED',
        entityType: 'PROPOSAL',
        entityId: proposalId,
        description: `Acceptance notification sent to ${sent} practice recipient${sent === 1 ? '' : 's'}`,
        metadata: JSON.stringify({
          recipientCount: sent,
          signatureId,
          aiPersonalised: tenantUseAiEmails(tenantSettings),
        }),
      },
    });
    logger.info(
      `Acceptance notifications sent for proposal ${proposalId} (${sent}/${recipients.length})`
    );
  }

  return { sent, failed };
}
