import { prisma } from '../../config/database.js';
import { revertProposalToDraft } from '../proposals/revertToDraft.js';
import { writeGrokAudit, type GrokActor } from './grokAudit.js';
import { presentProposal } from './grokDraft.js';

function str(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

const INCLUDE = {
  client: {
    select: {
      id: true,
      name: true,
      contactName: true,
      contactEmail: true,
      companyType: true,
      companyNumber: true,
    },
  },
  services: { orderBy: { sortOrder: 'asc' as const } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
};

export async function revertSentProposal(ctx: GrokActor, args: Record<string, unknown>) {
  for (const key of Object.keys(args)) {
    if (key !== 'proposal_id') {
      throw new Error(
        `Unexpected field "${key}". This assistant cannot change that. Caroline sends and signs proposals in Engage.`
      );
    }
  }
  const proposalId = str(args.proposal_id);
  if (!proposalId) throw new Error('proposal_id is required.');
  const existing = await prisma.proposal.findFirst({
    where: { id: proposalId, tenantId: ctx.tenantId },
    select: { id: true, reference: true, status: true },
  });
  if (!existing) throw new Error('Proposal not found in this practice.');

  await prisma.$transaction(async (tx) => {
    await revertProposalToDraft(tx as never, { proposalId, tenantId: ctx.tenantId });
    await writeGrokAudit(tx, {
      ctx,
      proposalId,
      tool: 'engage_revert_to_draft',
      summary: `Returned ${existing.reference} to draft and stopped the client link.`,
      changes: { from_status: existing.status, to_status: 'DRAFT', share_link_revoked: true },
    });
  });

  const loaded = await prisma.proposal.findFirst({
    where: { id: proposalId, tenantId: ctx.tenantId },
    include: INCLUDE,
  });
  if (!loaded) throw new Error('Proposal not found in this practice.');
  return {
    ...presentProposal(loaded as never),
    client_link: 'stopped',
  };
}
