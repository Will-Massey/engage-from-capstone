import { prisma } from '../../config/database.js';
import { readBotChangeDecision } from '../proposals/proposalWriteGuard.js';
import type { GrokActor } from './grokAudit.js';

const ACTIVITY_LIMIT = 20;
const SIGNER_LIMIT = 20;
const REVISION_LIMIT = 20;

function link(row: {
  id: string;
  reference: string;
  title: string;
  status: string;
  isRenewal: boolean;
}) {
  return {
    id: row.id,
    reference: row.reference,
    title: row.title,
    status: row.status,
    is_renewal: row.isRenewal,
  };
}

/**
 * Read-only history for one proposal in the caller's practice.
 * Revision drafts are ordinary proposals linked by originalProposalId.
 * There is no proposal_revisions table and no revisionOfId column.
 */
export async function getProposalHistory(ctx: GrokActor, proposalId: string) {
  if (!proposalId) throw new Error('proposal_id is required.');
  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, tenantId: ctx.tenantId },
    select: {
      id: true,
      reference: true,
      title: true,
      status: true,
      sentAt: true,
      viewedAt: true,
      originalProposalId: true,
      isRenewal: true,
    },
  });
  if (!proposal) throw new Error('Proposal not found in this practice.');

  const decision = await readBotChangeDecision(prisma as never, {
    proposalId: proposal.id,
    tenantId: ctx.tenantId,
  });
  if (!decision) throw new Error('Proposal not found in this practice.');

  const [viewCount, signatureCount, signers, activity, copiedFrom, copies] = await Promise.all([
    prisma.proposalView.count({ where: { proposalId: proposal.id } }),
    prisma.proposalSignature.count({ where: { proposalId: proposal.id } }),
    prisma.proposalSignature.findMany({
      where: { proposalId: proposal.id },
      orderBy: { signedAt: 'asc' },
      take: SIGNER_LIMIT,
      select: { signedBy: true, signedAt: true },
    }),
    prisma.activityLog.findMany({
      where: { proposalId: proposal.id, tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
      take: ACTIVITY_LIMIT,
      select: {
        id: true,
        action: true,
        description: true,
        createdAt: true,
        user: { select: { firstName: true, lastName: true } },
      },
    }),
    proposal.originalProposalId
      ? prisma.proposal.findFirst({
          where: { id: proposal.originalProposalId, tenantId: ctx.tenantId },
          select: {
            id: true,
            reference: true,
            title: true,
            status: true,
            isRenewal: true,
          },
        })
      : Promise.resolve(null),
    prisma.proposal.findMany({
      where: { originalProposalId: proposal.id, tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
      take: REVISION_LIMIT,
      select: {
        id: true,
        reference: true,
        title: true,
        status: true,
        isRenewal: true,
      },
    }),
  ]);

  return {
    id: proposal.id,
    reference: proposal.reference,
    title: proposal.title,
    status: proposal.status,
    sent_at: proposal.sentAt,
    viewed_at: proposal.viewedAt,
    view_count: viewCount,
    signature_count: signatureCount,
    signers: signers.map((signer) => ({
      name: signer.signedBy,
      signed_at: signer.signedAt,
    })),
    revisions: {
      copied_from: copiedFrom ? link(copiedFrom) : null,
      copies: copies.map(link),
    },
    activity: activity.map((row) => ({
      id: row.id,
      action: row.action,
      description: row.description,
      created_at: row.createdAt,
      user: row.user ? `${row.user.firstName} ${row.user.lastName}`.trim() : null,
    })),
    can_bot_change: decision.canBotChange,
    reason: decision.reason,
  };
}
