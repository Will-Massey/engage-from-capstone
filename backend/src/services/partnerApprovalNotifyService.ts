/**
 * Notify partners/managers when a proposal is submitted for approval (W1.6).
 */
import { prisma } from '../config/database.js';
import logger from '../config/logger.js';
import { tenantMailerSend } from './tenantMailer.js';

const APPROVER_ROLES = ['ADMIN', 'PARTNER', 'MD', 'MANAGER'] as const;

function frontendBase(): string {
  return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

export async function notifyApproversOfSubmission(params: {
  tenantId: string;
  proposalId: string;
  proposalTitle: string;
  clientName: string;
  submittedByName: string;
}): Promise<{ notified: number }> {
  const approvers = await prisma.user.findMany({
    where: {
      tenantId: params.tenantId,
      isActive: true,
      deletedAt: null,
      role: { in: [...APPROVER_ROLES] },
    },
    select: { id: true, email: true, firstName: true },
  });

  if (approvers.length === 0) {
    logger.warn(`No approvers to notify for proposal ${params.proposalId}`);
    return { notified: 0 };
  }

  const queueUrl = `${frontendBase()}/proposals/approval-queue`;
  const subject = `Approval needed: ${params.proposalTitle}`;
  const html = `
    <p>Hello,</p>
    <p><strong>${params.submittedByName}</strong> has submitted a proposal for partner approval.</p>
    <ul>
      <li><strong>Proposal:</strong> ${params.proposalTitle}</li>
      <li><strong>Client:</strong> ${params.clientName}</li>
    </ul>
    <p><a href="${queueUrl}">Review the approval queue</a></p>
    <p style="font-size:12px;color:#64748b;">You can also open Proposals and filter by Awaiting approval.</p>
  `;
  const text = `${params.submittedByName} submitted "${params.proposalTitle}" for ${params.clientName}. Review: ${queueUrl}`;

  let notified = 0;
  for (const approver of approvers) {
    const result = await tenantMailerSend({
      tenantId: params.tenantId,
      messageType: 'FOLLOW_UP',
      relatedIds: { proposalId: params.proposalId },
      message: {
        to: approver.email,
        subject,
        html,
        text,
      },
    });
    if (result.success) notified++;
  }

  logger.info(`Partner approval notifications sent for proposal ${params.proposalId}`, {
    notified,
    total: approvers.length,
  });

  return { notified };
}