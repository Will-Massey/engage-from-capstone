/**
 * Shared email delivery event processing — EmailLog, EmailSuppression, Proposal.emailHistory
 */

import type { EmailDeliveryStatus } from '@prisma/client';
import { prisma } from '../config/database.js';
import logger from '../config/logger.js';

export interface ProcessEmailDeliveryEventInput {
  emailLogId?: string;
  tenantId?: string;
  proposalId?: string;
  email?: string;
  event: string;
  reason?: string;
  messageId?: string;
  metadata?: Record<string, unknown>;
}

export function mapEventToDeliveryStatus(event: string): EmailDeliveryStatus | null {
  const normalized = event.toLowerCase().replace(/_/g, '');
  switch (normalized) {
    case 'delivered':
      return 'DELIVERED';
    case 'bounce':
    case 'dropped':
    case 'permanentbounce':
    case 'hardbounce':
      return 'BOUNCED';
    case 'spamreport':
    case 'spam':
    case 'complaint':
    case 'unsubscribe':
    case 'suppressed':
      return 'SUPPRESSED';
    case 'failed':
    case 'deliveryfailed':
      return 'FAILED';
    default:
      return null;
  }
}

function shouldSuppressRecipient(event: string): boolean {
  const normalized = event.toLowerCase().replace(/_/g, '');
  return (
    normalized === 'bounce' ||
    normalized === 'permanentbounce' ||
    normalized === 'hardbounce' ||
    normalized === 'spamreport' ||
    normalized === 'spam' ||
    normalized === 'complaint' ||
    normalized === 'unsubscribe'
  );
}

async function resolveProposalId(params: {
  proposalId?: string;
  emailLogId?: string;
  messageId?: string;
}): Promise<string | undefined> {
  if (params.proposalId) return params.proposalId;

  if (params.emailLogId) {
    const log = await prisma.emailLog.findUnique({
      where: { id: params.emailLogId },
      select: { proposalId: true },
    });
    if (log?.proposalId) return log.proposalId;
  }

  if (params.messageId) {
    const log = await prisma.emailLog.findFirst({
      where: { externalId: params.messageId },
      select: { proposalId: true },
      orderBy: { createdAt: 'desc' },
    });
    if (log?.proposalId) return log.proposalId;
  }

  return undefined;
}

async function updateProposalEmailHistory(params: {
  proposalId?: string;
  emailLogId?: string;
  messageId?: string;
  deliveryStatus: EmailDeliveryStatus;
  reason?: string;
}): Promise<void> {
  const proposalId = await resolveProposalId(params);
  if (!proposalId) return;

  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: { emailHistory: true },
  });
  if (!proposal) return;

  const history = JSON.parse(proposal.emailHistory || '[]') as Array<Record<string, unknown>>;
  let updated = false;

  for (const entry of history) {
    const matchesMessageId = params.messageId && entry.messageId === params.messageId;
    const matchesEmailLogId = params.emailLogId && entry.emailLogId === params.emailLogId;
    if (matchesMessageId || matchesEmailLogId) {
      entry.deliveryStatus = params.deliveryStatus;
      if (params.reason) entry.deliveryReason = params.reason;
      entry.deliveryUpdatedAt = new Date().toISOString();
      updated = true;
    }
  }

  if (!updated) return;

  await prisma.proposal.update({
    where: { id: proposalId },
    data: { emailHistory: JSON.stringify(history) },
  });
}

export async function processEmailDeliveryEvent(
  input: ProcessEmailDeliveryEventInput
): Promise<void> {
  const status = mapEventToDeliveryStatus(input.event);
  if (!status) {
    logger.debug(`Ignoring unmapped email delivery event: ${input.event}`);
    return;
  }

  const metadata = {
    event: input.event,
    ...(input.metadata || {}),
    processedAt: new Date().toISOString(),
  };

  if (input.emailLogId) {
    await prisma.emailLog.updateMany({
      where: { id: input.emailLogId },
      data: {
        status,
        error: input.reason || undefined,
        externalId: input.messageId || undefined,
        metadata: JSON.stringify(metadata),
      },
    });
  } else if (input.messageId) {
    await prisma.emailLog.updateMany({
      where: { externalId: input.messageId },
      data: {
        status,
        error: input.reason || undefined,
        metadata: JSON.stringify(metadata),
      },
    });
  }

  if (shouldSuppressRecipient(input.event) && input.tenantId && input.email) {
    const email = input.email.toLowerCase().trim();
    await prisma.emailSuppression.upsert({
      where: { tenantId_email: { tenantId: input.tenantId, email } },
      create: {
        tenantId: input.tenantId,
        email,
        reason: input.event,
      },
      update: { reason: input.event },
    });
    logger.info(`Suppressed ${email} for tenant ${input.tenantId} (${input.event})`);
  }

  await updateProposalEmailHistory({
    proposalId: input.proposalId,
    emailLogId: input.emailLogId,
    messageId: input.messageId,
    deliveryStatus: status,
    reason: input.reason,
  });
}
