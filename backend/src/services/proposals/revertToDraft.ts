import { ApiError } from '../../middleware/errorHandler.js';
import { assertBotMayMutateProposal } from './proposalWriteGuard.js';

type RevertClient = Parameters<typeof assertBotMayMutateProposal>[0] & {
  proposal: {
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  };
};

/**
 * Put a sent or viewed proposal back to draft and revoke the client link
 * in the same transaction as the guard. Does not clear a signature: the
 * guard refuses before the update when one exists.
 */
export async function revertProposalToDraft(
  tx: RevertClient,
  input: { proposalId: string; tenantId: string }
): Promise<{ id: string; status: 'DRAFT' }> {
  await assertBotMayMutateProposal(tx, {
    proposalId: input.proposalId,
    tenantId: input.tenantId,
    purpose: 'revert_to_draft',
  });
  await tx.proposal.update({
    where: { id: input.proposalId },
    data: {
      status: 'DRAFT',
      shareToken: null,
      shareTokenExpiry: null,
      publicAccessEnabled: false,
    },
  });
  return { id: input.proposalId, status: 'DRAFT' };
}

export function revertApiError(err: unknown): never {
  if (err instanceof ApiError) throw err;
  const message = err instanceof Error ? err.message : 'Could not return this proposal to draft';
  throw new ApiError('REVERT_FAILED', message, 400);
}
