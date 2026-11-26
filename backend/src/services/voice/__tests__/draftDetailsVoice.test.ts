jest.mock('../../../config/database.js', () => ({
  prisma: {
    proposal: { findFirst: jest.fn(), update: jest.fn() },
    proposalSignature: { count: jest.fn() },
    paymentSplit: { count: jest.fn() },
    voicePendingChange: {
      create: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../../grok/grokTools.js', () => ({
  callGrokTool: jest.fn(),
}));

import { prisma } from '../../../config/database.js';
import { callGrokTool } from '../../grok/grokTools.js';
import { runVoiceTool } from '../pendingChange.js';

const db = prisma as any;
const apply = callGrokTool as jest.Mock;

const actor = {
  userId: 'u1',
  tenantId: 't1',
  userName: 'Caroline Marks',
  tenantName: 'Marks and Co',
};

function draft(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    reference: 'PROP-1',
    title: 'Old title',
    status: 'DRAFT',
    validUntil: new Date('2027-01-31T12:00:00.000Z'),
    paymentTerms: '7 days',
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

describe('voice draft details', () => {
  let row: Record<string, any> | null;

  beforeEach(() => {
    jest.clearAllMocks();
    row = null;
    db.proposal.findFirst.mockImplementation(async (args: { where: { tenantId: string } }) => {
      if (args.where.tenantId !== 't1') return null;
      return draft();
    });
    db.proposalSignature.count.mockResolvedValue(0);
    db.paymentSplit.count.mockResolvedValue(0);
    db.proposal.update.mockResolvedValue({});
    db.voicePendingChange.create.mockImplementation(
      async (args: { data: Record<string, unknown> }) => {
        row = {
          id: 'chg1',
          userId: actor.userId,
          tenantId: actor.tenantId,
          confirmedAt: null,
          ...args.data,
        };
        return row;
      }
    );
    db.voicePendingChange.updateMany.mockImplementation(async () => {
      if (!row || row.status !== 'PENDING' || row.expiresAt.getTime() <= Date.now()) {
        return { count: 0 };
      }
      row = { ...row, status: 'APPLYING' };
      return { count: 1 };
    });
    db.voicePendingChange.findFirst.mockImplementation(async () => row);
    db.voicePendingChange.update.mockImplementation(
      async (args: { data: Record<string, unknown> }) => {
        row = { ...row, ...args.data };
        return row;
      }
    );
    apply.mockResolvedValue({ ok: true, data: { reference: 'PROP-1', title: 'New title' } });
  });

  it('shows a before and after card and does not write until confirm', async () => {
    const pending = (await runVoiceTool(actor, 'propose_update_details', {
      proposal_id: 'p1',
      title: 'New title',
      payment_terms: '14 days',
    })) as {
      saved: boolean;
      summary: string;
      before: Record<string, unknown>;
      after: Record<string, unknown>;
    };

    expect(pending.saved).toBe(false);
    expect(pending.summary).toMatch(/PROP-1/);
    expect(pending.summary).toMatch(/Old title/);
    expect(pending.summary).toMatch(/New title/);
    expect(pending.before).toMatchObject({ title: 'Old title', payment_terms: '7 days' });
    expect(pending.after).toMatchObject({ title: 'New title', payment_terms: '14 days' });
    expect(apply).not.toHaveBeenCalled();
    expect(db.proposal.update).not.toHaveBeenCalled();

    const created = db.voicePendingChange.create.mock.calls[0][0].data;
    expect(created.tool).toBe('engage_update_draft_details');
    expect(created.expiresAt.getTime()).toBeGreaterThan(Date.now() + 90_000);
    expect(created.expiresAt.getTime()).toBeLessThan(Date.now() + 130_000);
    expect(JSON.parse(created.payload)).toMatchObject({
      name: 'engage_update_draft_details',
      arguments: { proposal_id: 'p1', title: 'New title', payment_terms: '14 days' },
    });

    const saved = (await runVoiceTool(actor, 'confirm_pending_change', {
      pending_change_id: 'chg1',
    })) as { saved: boolean };
    expect(saved.saved).toBe(true);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(
      'engage_update_draft_details',
      { proposal_id: 'p1', title: 'New title', payment_terms: '14 days' },
      expect.objectContaining({ tenantId: 't1', userId: 'u1', scopes: expect.any(Set) })
    );
    expect(row?.status).toBe('CONFIRMED');
  });

  it('rechecks the guard at confirm and does not mark the change saved when it refuses', async () => {
    await runVoiceTool(actor, 'propose_update_details', { proposal_id: 'p1', title: 'New title' });
    apply.mockResolvedValue({
      ok: false,
      error:
        'This proposal has a signature. The assistant cannot remove it or change the proposal.',
    });
    await expect(
      runVoiceTool(actor, 'confirm_pending_change', { pending_change_id: 'chg1' })
    ).rejects.toMatchObject({ code: 'PROPOSAL_LOCKED' });
    expect(row?.status).toBe('FAILED');
  });

  it('expires a change after two minutes', async () => {
    await runVoiceTool(actor, 'propose_update_details', { proposal_id: 'p1', title: 'New title' });
    row = { ...row, expiresAt: new Date(Date.now() - 1000) };
    await expect(
      runVoiceTool(actor, 'confirm_pending_change', { pending_change_id: 'chg1' })
    ).rejects.toMatchObject({ code: 'EXPIRED' });
    expect(apply).not.toHaveBeenCalled();
  });

  it('refuses a direct write tool, a past date, another practice, and a sent or signed proposal', async () => {
    await expect(
      runVoiceTool(actor, 'engage_update_draft_details', { proposal_id: 'p1', title: 'Skip' })
    ).rejects.toMatchObject({ code: 'UNKNOWN_TOOL' });

    await expect(
      runVoiceTool(actor, 'propose_update_details', {
        proposal_id: 'p1',
        valid_until: '2000-01-01',
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(db.voicePendingChange.create).not.toHaveBeenCalled();

    await expect(
      runVoiceTool({ ...actor, tenantId: 't2' }, 'propose_update_details', {
        proposal_id: 'p1',
        title: 'Other',
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    db.proposal.findFirst.mockResolvedValue(draft({ status: 'SENT' }));
    await expect(
      runVoiceTool(actor, 'propose_update_details', { proposal_id: 'p1', title: 'Sent' })
    ).rejects.toMatchObject({ code: 'PROPOSAL_LOCKED' });

    db.proposal.findFirst.mockResolvedValue(draft({ status: 'ACCEPTED' }));
    await expect(
      runVoiceTool(actor, 'propose_update_details', { proposal_id: 'p1', title: 'Accepted' })
    ).rejects.toMatchObject({ code: 'PROPOSAL_LOCKED' });

    db.proposal.findFirst.mockResolvedValue(draft());
    db.proposalSignature.count.mockResolvedValue(1);
    await expect(
      runVoiceTool(actor, 'propose_update_details', { proposal_id: 'p1', title: 'Signed' })
    ).rejects.toMatchObject({ code: 'PROPOSAL_LOCKED' });

    expect(db.voicePendingChange.create).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it('reads history without a pending change', async () => {
    apply.mockResolvedValue({
      ok: true,
      data: {
        status: 'DRAFT',
        signature_count: 0,
        signers: [{ name: 'Ada', signed_at: '2026-11-01' }],
      },
    });
    const data = await runVoiceTool(actor, 'engage_get_proposal_history', { proposal_id: 'p1' });
    expect(data).toMatchObject({ status: 'DRAFT', signature_count: 0 });
    expect(apply).toHaveBeenCalledWith(
      'engage_get_proposal_history',
      { proposal_id: 'p1' },
      expect.objectContaining({ tenantId: 't1' })
    );
    expect(db.voicePendingChange.create).not.toHaveBeenCalled();
  });
});
