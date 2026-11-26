import { revertProposalToDraft } from '../revertToDraft.js';

describe('revert to draft', () => {
  it('clears the client link in the same update as the status change', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const tx = {
      $queryRaw: jest.fn(async () => [
        {
          id: 'p1',
          status: 'SENT',
          signature: null,
          acceptedAt: null,
          acceptedBy: null,
          acceptedByIp: null,
          signatoryPosition: null,
          termsAccepted: false,
          termsAcceptedAt: null,
          acceptanceNotifiedAt: null,
          engagementLetterAccepted: false,
          engagementLetterAcceptedAt: null,
          paymentId: null,
          paymentMandateId: null,
          paymentProvider: null,
          paymentStatus: null,
          paymentUrl: null,
          paymentMethod: null,
          paidAt: null,
          paymentFailureReason: null,
          stripeSubscriptionId: null,
          paymentAuthAccepted: false,
          paymentAuthAcceptedAt: null,
          paymentAuthVersion: null,
        },
      ]),
      proposalSignature: { count: jest.fn(async () => 0) },
      paymentSplit: { count: jest.fn(async () => 0) },
      proposal: {
        update: jest.fn(async (args: { data: Record<string, unknown> }) => {
          updates.push(args.data);
          return args.data;
        }),
      },
    };

    await revertProposalToDraft(tx as never, { proposalId: 'p1', tenantId: 't1' });

    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({
      status: 'DRAFT',
      shareToken: null,
      shareTokenExpiry: null,
      publicAccessEnabled: false,
    });
    const sql = (tx.$queryRaw as jest.Mock).mock.calls[0][0].join(' ');
    expect(sql).toContain('FOR UPDATE');
  });

  it('does not clear the link when a signature is already on the proposal', async () => {
    const update = jest.fn();
    const tx = {
      $queryRaw: jest.fn(async () => [
        {
          id: 'p1',
          status: 'SENT',
          signature: null,
          acceptedAt: null,
          acceptedBy: null,
          acceptedByIp: null,
          signatoryPosition: null,
          termsAccepted: false,
          termsAcceptedAt: null,
          acceptanceNotifiedAt: null,
          engagementLetterAccepted: false,
          engagementLetterAcceptedAt: null,
          paymentId: null,
          paymentMandateId: null,
          paymentProvider: null,
          paymentStatus: null,
          paymentUrl: null,
          paymentMethod: null,
          paidAt: null,
          paymentFailureReason: null,
          stripeSubscriptionId: null,
          paymentAuthAccepted: false,
          paymentAuthAcceptedAt: null,
          paymentAuthVersion: null,
        },
      ]),
      proposalSignature: { count: jest.fn(async () => 1) },
      paymentSplit: { count: jest.fn(async () => 0) },
      proposal: { update },
    };
    await expect(
      revertProposalToDraft(tx as never, { proposalId: 'p1', tenantId: 't1' })
    ).rejects.toThrow(/signature/i);
    expect(update).not.toHaveBeenCalled();
  });
});
