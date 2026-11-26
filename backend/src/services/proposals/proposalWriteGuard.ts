import { ApiError } from '../../middleware/errorHandler.js';

/**
 * The one guard for assistant writes. It runs inside the same database
 * transaction as the write, after SELECT … FOR UPDATE, so a signature or
 * status change that commits first is visible and the write does not proceed.
 *
 * Refuses ACCEPTED, ARCHIVED, LOST, DECLINED and WITHDRAWN, any signature,
 * any acceptance field, and any payment field.
 */

export const BOT_REFUSED_STATUSES = [
  'ACCEPTED',
  'ARCHIVED',
  'LOST',
  'DECLINED',
  'WITHDRAWN',
] as const;

export type BotWritePurpose = 'draft_edit' | 'revert_to_draft';

export type LockedProposalRow = {
  id: string;
  status: string;
  signature: string | null;
  acceptedAt: Date | string | null;
  acceptedBy: string | null;
  acceptedByIp: string | null;
  signatoryPosition: string | null;
  termsAccepted: boolean | null;
  termsAcceptedAt: Date | string | null;
  acceptanceNotifiedAt: Date | string | null;
  engagementLetterAccepted: boolean | null;
  engagementLetterAcceptedAt: Date | string | null;
  paymentId: string | null;
  paymentMandateId: string | null;
  paymentProvider: string | null;
  paymentStatus: string | null;
  paymentUrl: string | null;
  paymentMethod: string | null;
  paidAt: Date | string | null;
  paymentFailureReason: string | null;
  stripeSubscriptionId: string | null;
  paymentAuthAccepted: boolean | null;
  paymentAuthAcceptedAt: Date | string | null;
  paymentAuthVersion: string | null;
};

type GuardClient = {
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<LockedProposalRow[]>;
  proposalSignature: {
    count: (args: { where: { proposalId: string } }) => Promise<number>;
  };
  paymentSplit: {
    count: (args: { where: { proposalId: string } }) => Promise<number>;
  };
};

function textSet(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function timeSet(value: unknown): boolean {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  return typeof value === 'string' && value.trim().length > 0;
}

export function refusalForLockedProposal(
  row: LockedProposalRow,
  signatureCount: number,
  paymentSplitCount: number,
  purpose: BotWritePurpose
): string | null {
  const status = String(row.status || '').toUpperCase();
  if ((BOT_REFUSED_STATUSES as readonly string[]).includes(status)) {
    return `This proposal is ${status}. The assistant cannot change a signed, accepted, or live proposal. A new draft can be copied from it. The original stays as it is.`;
  }
  if (signatureCount > 0 || textSet(row.signature)) {
    return 'This proposal has a signature. The assistant cannot remove it or change the proposal.';
  }
  if (
    timeSet(row.acceptedAt) ||
    textSet(row.acceptedBy) ||
    textSet(row.acceptedByIp) ||
    textSet(row.signatoryPosition) ||
    row.termsAccepted === true ||
    timeSet(row.termsAcceptedAt) ||
    timeSet(row.acceptanceNotifiedAt) ||
    row.engagementLetterAccepted === true ||
    timeSet(row.engagementLetterAcceptedAt)
  ) {
    return 'This proposal has acceptance details. The assistant cannot change it.';
  }
  if (
    paymentSplitCount > 0 ||
    textSet(row.paymentId) ||
    textSet(row.paymentMandateId) ||
    textSet(row.paymentProvider) ||
    textSet(row.paymentStatus) ||
    textSet(row.paymentUrl) ||
    textSet(row.paymentMethod) ||
    timeSet(row.paidAt) ||
    textSet(row.paymentFailureReason) ||
    textSet(row.stripeSubscriptionId) ||
    row.paymentAuthAccepted === true ||
    timeSet(row.paymentAuthAcceptedAt) ||
    textSet(row.paymentAuthVersion)
  ) {
    return 'This proposal has a payment record. The assistant cannot change it.';
  }
  if (purpose === 'draft_edit' && status !== 'DRAFT') {
    return `This proposal is ${status}. The assistant can only change a draft. Caroline sends it from Engage herself.`;
  }
  if (purpose === 'revert_to_draft' && status !== 'SENT' && status !== 'VIEWED') {
    return `This proposal is ${status}. Only a sent or viewed proposal with no signature can go back to draft.`;
  }
  return null;
}

export async function assertBotMayMutateProposal(
  tx: GuardClient,
  input: { proposalId: string; tenantId: string; purpose: BotWritePurpose }
): Promise<LockedProposalRow> {
  const rows = await tx.$queryRaw`
    SELECT
      id,
      status,
      signature,
      "acceptedAt",
      "acceptedBy",
      "acceptedByIp",
      "signatoryPosition",
      "termsAccepted",
      "termsAcceptedAt",
      "acceptanceNotifiedAt",
      "engagement_letter_accepted" AS "engagementLetterAccepted",
      "engagement_letter_accepted_at" AS "engagementLetterAcceptedAt",
      "paymentId",
      "paymentMandateId",
      "paymentProvider",
      "paymentStatus",
      "paymentUrl",
      "paymentMethod",
      "paidAt",
      "paymentFailureReason",
      "stripeSubscriptionId",
      "payment_auth_accepted" AS "paymentAuthAccepted",
      "payment_auth_accepted_at" AS "paymentAuthAcceptedAt",
      "payment_auth_version" AS "paymentAuthVersion"
    FROM "Proposal"
    WHERE id = ${input.proposalId} AND "tenantId" = ${input.tenantId}
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) {
    throw new ApiError('NOT_FOUND', 'Proposal not found', 404);
  }
  const signatureCount = await tx.proposalSignature.count({
    where: { proposalId: input.proposalId },
  });
  const paymentSplitCount = await tx.paymentSplit.count({
    where: { proposalId: input.proposalId },
  });
  const reason = refusalForLockedProposal(row, signatureCount, paymentSplitCount, input.purpose);
  if (reason) {
    throw new ApiError('PROPOSAL_LOCKED', reason, 409);
  }
  return row;
}

/** Lock a proposal without treating a signed or accepted row as a reason to stop.
 *  Used when copying a revision. The caller must not update this row.
 */
export async function lockProposalRow(
  tx: { $queryRaw: GuardClient['$queryRaw'] },
  proposalId: string,
  tenantId: string
): Promise<LockedProposalRow> {
  const rows = await tx.$queryRaw`
    SELECT id, status
    FROM "Proposal"
    WHERE id = ${proposalId} AND "tenantId" = ${tenantId}
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) {
    throw new ApiError('NOT_FOUND', 'Proposal not found', 404);
  }
  return row;
}
