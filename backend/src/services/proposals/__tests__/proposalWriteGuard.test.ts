import { ApiError } from '../../../middleware/errorHandler.js';
import {
  assertBotMayMutateProposal,
  refusalForLockedProposal,
  type LockedProposalRow,
} from '../proposalWriteGuard.js';

function row(overrides: Partial<LockedProposalRow> = {}): LockedProposalRow {
  return {
    id: 'p1',
    status: 'DRAFT',
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
    ...overrides,
  };
}

describe('proposal write guard', () => {
  it.each(['ACCEPTED', 'ARCHIVED', 'LOST', 'DECLINED', 'WITHDRAWN'])('refuses %s', (status) => {
    expect(refusalForLockedProposal(row({ status }), 0, 0, 'draft_edit')).toMatch(
      new RegExp(status)
    );
  });

  it('refuses a signature row and a legacy signature image', () => {
    expect(refusalForLockedProposal(row(), 1, 0, 'draft_edit')).toMatch(/signature/i);
    expect(
      refusalForLockedProposal(row({ signature: 'data:image/png' }), 0, 0, 'draft_edit')
    ).toMatch(/signature/i);
  });

  it.each([
    ['acceptedAt', new Date()],
    ['acceptedBy', 'Ada'],
    ['acceptedByIp', '1.1.1.1'],
    ['signatoryPosition', 'Director'],
    ['termsAccepted', true],
    ['termsAcceptedAt', new Date()],
    ['acceptanceNotifiedAt', new Date()],
    ['engagementLetterAccepted', true],
    ['engagementLetterAcceptedAt', new Date()],
  ] as Array<[keyof LockedProposalRow, unknown]>)('refuses acceptance field %s', (field, value) => {
    expect(
      refusalForLockedProposal(
        row({ [field]: value } as Partial<LockedProposalRow>),
        0,
        0,
        'draft_edit'
      )
    ).toMatch(/acceptance/i);
  });

  it.each([
    ['paymentId', 'pay_1'],
    ['paymentMandateId', 'man_1'],
    ['paymentProvider', 'stripe'],
    ['paymentStatus', 'PAID'],
    ['paymentUrl', 'https://pay.example'],
    ['paymentMethod', 'card'],
    ['paidAt', new Date()],
    ['paymentFailureReason', 'declined'],
    ['stripeSubscriptionId', 'sub_1'],
    ['paymentAuthAccepted', true],
    ['paymentAuthAcceptedAt', new Date()],
    ['paymentAuthVersion', 'v1'],
  ] as Array<[keyof LockedProposalRow, unknown]>)('refuses payment field %s', (field, value) => {
    expect(
      refusalForLockedProposal(
        row({ [field]: value } as Partial<LockedProposalRow>),
        0,
        0,
        'draft_edit'
      )
    ).toMatch(/payment/i);
  });

  it('refuses a payment split', () => {
    expect(refusalForLockedProposal(row(), 0, 1, 'draft_edit')).toMatch(/payment/i);
  });

  it('allows a clean draft edit and a clean sent revert', () => {
    expect(refusalForLockedProposal(row(), 0, 0, 'draft_edit')).toBeNull();
    expect(refusalForLockedProposal(row({ status: 'SENT' }), 0, 0, 'revert_to_draft')).toBeNull();
    expect(refusalForLockedProposal(row({ status: 'VIEWED' }), 0, 0, 'revert_to_draft')).toBeNull();
  });

  it('refuses a content edit once the locked row is no longer a draft', () => {
    expect(refusalForLockedProposal(row({ status: 'SENT' }), 0, 0, 'draft_edit')).toMatch(/SENT/);
  });
});

describe('guard race', () => {
  it('a confirm waiting on the row lock sees a signature that landed first and does not write', async () => {
    let signatures = 0;
    let notes = 'before';
    let tail = Promise.resolve();
    const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
      const run = tail.then(fn, fn);
      tail = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    };
    const tx = {
      $queryRaw: jest.fn(async () => [row()]),
      proposalSignature: { count: jest.fn(async () => signatures) },
      paymentSplit: { count: jest.fn(async () => 0) },
      proposal: {
        update: jest.fn(async (args: { data: { notes: string } }) => {
          notes = args.data.notes;
        }),
      },
    };

    const signer = exclusive(async () => {
      signatures = 1;
    });
    const confirmer = exclusive(async () => {
      await assertBotMayMutateProposal(tx as never, {
        proposalId: 'p1',
        tenantId: 't1',
        purpose: 'draft_edit',
      });
      await tx.proposal.update({ data: { notes: 'after' } });
    });

    await signer;
    await expect(confirmer).rejects.toBeInstanceOf(ApiError);
    expect(notes).toBe('before');
    expect(tx.proposal.update).not.toHaveBeenCalled();
    const sql = (tx.$queryRaw as jest.Mock).mock.calls
      .map((call) => (call[0] as string[]).join(' '))
      .join(' ');
    expect(sql).toContain('FOR UPDATE');
  });
});
