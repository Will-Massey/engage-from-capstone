jest.mock('../../../config/database.js', () => ({
  prisma: {
    voicePendingChange: {
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    proposal: { findFirst: jest.fn() },
  },
}));

jest.mock('../../grok/grokTools.js', () => ({
  callGrokTool: jest.fn(),
}));

import { prisma } from '../../../config/database.js';
import { callGrokTool } from '../../grok/grokTools.js';
import { confirmPendingChange } from '../pendingChange.js';

const db = prisma as any;
const apply = callGrokTool as jest.Mock;

const actor = {
  userId: 'u1',
  tenantId: 't1',
  userName: 'Caroline Marks',
  tenantName: 'Marks and Co',
};

function pending(overrides: Record<string, unknown> = {}) {
  return {
    id: 'chg1',
    userId: 'u1',
    tenantId: 't1',
    tool: 'engage_update_draft_notes',
    proposalId: 'p1',
    summary: 'Change the notes.',
    beforeJson: '{"notes":"before"}',
    afterJson: '{"notes":"after"}',
    payload: JSON.stringify({
      name: 'engage_update_draft_notes',
      arguments: { proposal_id: 'p1', notes: 'after' },
    }),
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 60_000),
    confirmedAt: null,
    ...overrides,
  };
}

describe('confirm_pending_change', () => {
  let row: ReturnType<typeof pending>;
  let tail: Promise<void>;

  beforeEach(() => {
    jest.clearAllMocks();
    row = pending();
    tail = Promise.resolve();
    const exclusive = <T>(fn: () => Promise<T> | T): Promise<T> => {
      const run = tail.then(fn, fn);
      tail = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    };
    db.voicePendingChange.updateMany.mockImplementation(
      async (args: { where: { userId: string; status: string }; data: { status: string } }) =>
        exclusive(async () => {
          if (
            row.status !== 'PENDING' ||
            row.userId !== args.where.userId ||
            row.expiresAt.getTime() <= Date.now()
          ) {
            return { count: 0 };
          }
          row = { ...row, status: args.data.status };
          return { count: 1 };
        })
    );
    db.voicePendingChange.findFirst.mockImplementation(
      async (args?: { where?: { userId?: string } }) => {
        if (args?.where?.userId && args.where.userId !== row.userId) return null;
        return row;
      }
    );
    db.voicePendingChange.update.mockImplementation(
      async (args: { data: Record<string, unknown> }) => {
        row = { ...row, ...args.data };
        return row;
      }
    );
    apply.mockResolvedValue({ ok: true, data: { reference: 'PROP-1' } });
  });

  it('rejects anything except the pending change id', async () => {
    await expect(
      confirmPendingChange(actor, { pending_change_id: 'chg1', notes: 'no' })
    ).rejects.toMatchObject({ code: 'PENDING_ID_ONLY' });
    expect(apply).not.toHaveBeenCalled();
  });

  it('refuses a different user, an expired change, and a second confirm', async () => {
    await expect(
      confirmPendingChange({ ...actor, userId: 'other' }, { pending_change_id: 'chg1' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    row = pending({ expiresAt: new Date(Date.now() - 1000) });
    await expect(confirmPendingChange(actor, { pending_change_id: 'chg1' })).rejects.toMatchObject({
      code: 'EXPIRED',
    });
    expect(apply).not.toHaveBeenCalled();
  });

  it('rechecks the guard at confirm time and does not mark the change saved when the guard refuses', async () => {
    apply.mockResolvedValue({
      ok: false,
      error:
        'This proposal has a signature. The assistant cannot remove it or change the proposal.',
    });
    await expect(confirmPendingChange(actor, { pending_change_id: 'chg1' })).rejects.toMatchObject({
      code: 'PROPOSAL_LOCKED',
    });
    expect(row.status).toBe('FAILED');
  });

  it('lets only one of two overlapping confirms apply the write', async () => {
    const [first, second] = await Promise.allSettled([
      confirmPendingChange(actor, { pending_change_id: 'chg1' }),
      confirmPendingChange(actor, { pending_change_id: 'chg1' }),
    ]);
    const saved = [first, second].filter((item) => item.status === 'fulfilled');
    const refused = [first, second].filter((item) => item.status === 'rejected');
    expect(saved).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(row.status).toBe('CONFIRMED');
  });
});
