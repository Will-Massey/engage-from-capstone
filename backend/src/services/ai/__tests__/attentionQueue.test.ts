const proposalFindMany = jest.fn();
const signalFindMany = jest.fn();
const activityLogCreate = jest.fn();

jest.mock('../../../config/database.js', () => ({
  prisma: {
    proposal: { findMany: proposalFindMany },
    regulatorySignal: { findMany: signalFindMany },
    activityLog: { create: activityLogCreate },
  },
}));

const chatCompletion = jest.fn();
jest.mock('../aiClient.js', () => ({
  chatCompletion: (...args: unknown[]) => chatCompletion(...args),
  chatCompletionStream: jest.fn(),
  isAiConfigured: () => false,
  parseJsonResponse: jest.fn(),
  tokenMetaFromUsage: () => ({}),
}));

import { getAiAttentionQueue } from '../proposalAiService.js';

const NOW = Date.now();
const day = 86_400_000;

let idCounter = 0;

function proposal(overrides: Record<string, unknown> = {}) {
  idCounter += 1;
  return {
    id: `p${idCounter}`,
    reference: `PROP-${idCounter}`,
    title: `Proposal ${idCounter}`,
    status: 'SENT',
    total: 1000,
    validUntil: new Date(NOW + 30 * day),
    sentAt: new Date(NOW - 1 * day),
    updatedAt: new Date(NOW),
    views: [],
    client: { name: `Client ${idCounter}` },
    ...overrides,
  };
}

function signal(overrides: Record<string, unknown> = {}) {
  idCounter += 1;
  return {
    id: `sig${idCounter}`,
    clientId: `c${idCounter}`,
    ruleId: 'vat-registration-required',
    family: 'vat',
    severity: 'action_required',
    title: 'VAT registration likely required',
    detail: 'Turnover exceeds the £90,000 threshold.',
    status: 'OPEN',
    firstRaisedAt: new Date(NOW - 2 * day),
    client: { name: 'Reg Client' },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  idCounter = 0;
  signalFindMany.mockResolvedValue([]);
  activityLogCreate.mockResolvedValue({});
});

describe('getAiAttentionQueue — existing proposal scoring ladder (regression lock)', () => {
  it('scores the fixture exactly as the deterministic ladder dictates', async () => {
    proposalFindMany.mockResolvedValue([
      proposal({ status: 'EXPIRED', validUntil: new Date(NOW - 1 * day) }),
      proposal({
        status: 'SENT',
        sentAt: new Date(NOW - 15 * day),
        views: [{ viewedAt: new Date() }],
      }),
      proposal({ status: 'DRAFT', sentAt: null, updatedAt: new Date(NOW - 8 * day) }),
      proposal({ status: 'SENT', sentAt: new Date(NOW - 8 * day), views: [] }),
      proposal({
        status: 'SENT',
        sentAt: new Date(NOW - 2 * day),
        views: [{ viewedAt: new Date() }],
        validUntil: new Date(NOW + 5 * day),
      }),
      proposal({
        status: 'VIEWED',
        sentAt: new Date(NOW - 4 * day),
        views: [{ viewedAt: new Date() }],
      }),
      proposal({ status: 'DRAFT', sentAt: null, updatedAt: new Date(NOW) }),
    ]);

    const { items } = await getAiAttentionQueue('t1', 'u1');
    const proposalItems = items.filter((i) => i.kind === 'proposal');

    expect(proposalItems.map((i) => [i.priorityScore, i.reason])).toEqual([
      [95, 'Proposal has expired'],
      [85, 'No signature after 14+ days'],
      [80, 'Draft proposal untouched for over a week'],
      [75, 'Client has not opened the proposal'],
      [70, 'Valid until date within 7 days'],
      [60, 'Client viewed but has not signed'],
      [45, 'Draft awaiting completion'],
    ]);
    // Every proposal item keeps its original fields
    expect(proposalItems[0]).toMatchObject({
      kind: 'proposal',
      proposalId: 'p1',
      reference: 'PROP-1',
      clientName: 'Client 1',
      status: 'EXPIRED',
      recommendedAction: 'Create a revised proposal or extend the valid until date.',
    });
    // AI disabled → deterministic fallback narrative
    expect(proposalItems[0].narrative).toContain('Client 1');
    expect(chatCompletion).not.toHaveBeenCalled();
  });
});

describe('getAiAttentionQueue — regulatory signal append (R5.2)', () => {
  it('appends OPEN signals after proposals with severity-mapped scores', async () => {
    proposalFindMany.mockResolvedValue([
      proposal({ status: 'EXPIRED', validUntil: new Date(NOW - 1 * day) }),
    ]);
    signalFindMany.mockResolvedValue([
      signal({ severity: 'info', title: 'Info rule', detail: 'Info detail' }),
      signal({ severity: 'action_required' }),
      signal({ severity: 'warning', title: 'Warning rule', detail: 'Warning detail' }),
    ]);

    const { items } = await getAiAttentionQueue('t1', 'u1');

    expect(signalFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't1', status: 'OPEN' } })
    );
    expect(items).toHaveLength(4);
    // Proposal first (append, not interleave), then regulatory by score desc
    expect(items[0].kind).toBe('proposal');
    expect(items.slice(1).map((i) => [i.kind, i.priorityScore])).toEqual([
      ['regulatory', 85],
      ['regulatory', 65],
      ['regulatory', 45],
    ]);

    const reg = items[1];
    expect(reg.signalId).toBeDefined();
    expect(reg.clientId).toBeDefined();
    expect(reg.proposalId).toBeUndefined();
    expect(reg.clientName).toBe('Reg Client');
    expect(reg.reference).toBe('Regulatory');
    // Deterministic copy — reason is the rule title, narrative/action are the detail
    expect(reg.reason).toBe('VAT registration likely required');
    expect(reg.narrative).toBe('Turnover exceeds the £90,000 threshold.');
    expect(reg.recommendedAction).toBe(reg.narrative);
  });

  it('caps the combined list at 10 and skips signals when proposals fill it', async () => {
    proposalFindMany.mockResolvedValue(
      Array.from({ length: 12 }, () =>
        proposal({ status: 'EXPIRED', validUntil: new Date(NOW - 1 * day) })
      )
    );
    signalFindMany.mockResolvedValue([signal()]);

    const { items } = await getAiAttentionQueue('t1', 'u1');

    expect(items).toHaveLength(10);
    expect(items.every((i) => i.kind === 'proposal')).toBe(true);
    expect(signalFindMany).not.toHaveBeenCalled();
  });

  it('fills only the remaining slots with regulatory signals', async () => {
    proposalFindMany.mockResolvedValue(
      Array.from({ length: 8 }, () =>
        proposal({ status: 'EXPIRED', validUntil: new Date(NOW - 1 * day) })
      )
    );
    signalFindMany.mockResolvedValue([
      signal({ severity: 'warning' }),
      signal({ severity: 'action_required' }),
      signal({ severity: 'info' }),
    ]);

    const { items } = await getAiAttentionQueue('t1', 'u1');

    expect(items).toHaveLength(10);
    // Two slots → the two highest-severity signals win
    expect(items.slice(8).map((i) => i.priorityScore)).toEqual([85, 65]);
  });

  it('survives a regulatory query failure without breaking the proposal queue', async () => {
    proposalFindMany.mockResolvedValue([
      proposal({ status: 'EXPIRED', validUntil: new Date(NOW - 1 * day) }),
    ]);
    signalFindMany.mockRejectedValue(new Error('db down'));

    const { items } = await getAiAttentionQueue('t1', 'u1');

    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('proposal');
  });
});

describe('getAiAttentionQueue — Clara-actioned drafts (R5.1)', () => {
  function actionedSignal(overrides: Record<string, unknown> = {}) {
    return signal({
      status: 'ACTIONED',
      metadata: JSON.stringify({ proposalId: 'cd-1' }),
      ...overrides,
    });
  }

  /** Route the shared mocks by query shape: OPEN vs ACTIONED, list vs id-lookup */
  function routeMocks(options: {
    proposals?: unknown[];
    openSignals?: unknown[];
    actionedSignals?: unknown[];
    claraDrafts?: unknown[];
  }) {
    proposalFindMany.mockImplementation(async (args: { where?: { id?: unknown } }) =>
      args?.where?.id ? (options.claraDrafts ?? []) : (options.proposals ?? [])
    );
    signalFindMany.mockImplementation(async (args: { where?: { status?: string } }) =>
      args?.where?.status === 'OPEN' ? (options.openSignals ?? []) : (options.actionedSignals ?? [])
    );
  }

  it('surfaces ACTIONED signals with a pending Clara draft after the regulatory items', async () => {
    const actioned = actionedSignal();
    routeMocks({
      proposals: [proposal({ status: 'EXPIRED', validUntil: new Date(NOW - 1 * day) })],
      openSignals: [signal({ severity: 'warning' })],
      actionedSignals: [actioned],
      claraDrafts: [{ id: 'cd-1', title: 'VAT services — Acme Ltd', reference: 'PROP-CD' }],
    });

    const { items } = await getAiAttentionQueue('t1', 'u1');

    expect(items.map((i) => i.kind)).toEqual(['proposal', 'regulatory', 'clara_draft']);
    expect(items[2]).toMatchObject({
      kind: 'clara_draft',
      proposalId: 'cd-1',
      signalId: actioned.id,
      clientId: actioned.clientId,
      reference: 'PROP-CD',
      title: 'VAT services — Acme Ltd',
      clientName: 'Reg Client',
      status: 'DRAFT',
      priorityScore: 70,
      narrative: 'Clara drafted: VAT services — Acme Ltd — awaiting approval',
    });
    // The draft lookup is pinned to Clara's ceiling: DRAFT + PENDING only
    expect(proposalFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 't1',
          id: { in: ['cd-1'] },
          status: 'DRAFT',
          approvalStatus: 'PENDING',
        }),
      })
    );
  });

  it('drops actioned signals whose draft is no longer awaiting approval', async () => {
    routeMocks({
      proposals: [proposal({ status: 'EXPIRED', validUntil: new Date(NOW - 1 * day) })],
      actionedSignals: [actionedSignal()],
      claraDrafts: [], // approved/rejected/sent → excluded by the DRAFT+PENDING filter
    });

    const { items } = await getAiAttentionQueue('t1', 'u1');

    expect(items).toHaveLength(1);
    expect(items.some((i) => i.kind === 'clara_draft')).toBe(false);
  });

  it('ignores actioned signals without a parsable proposalId in metadata', async () => {
    routeMocks({
      proposals: [proposal({ status: 'EXPIRED', validUntil: new Date(NOW - 1 * day) })],
      actionedSignals: [
        actionedSignal({ metadata: '{}' }),
        actionedSignal({ metadata: 'not-json' }),
      ],
    });

    const { items } = await getAiAttentionQueue('t1', 'u1');

    expect(items.some((i) => i.kind === 'clara_draft')).toBe(false);
    // No proposalIds → no second proposal query
    expect(proposalFindMany).toHaveBeenCalledTimes(1);
  });

  it('never queries for Clara drafts once regulatory items fill the 10 slots', async () => {
    routeMocks({
      proposals: Array.from({ length: 9 }, () =>
        proposal({ status: 'EXPIRED', validUntil: new Date(NOW - 1 * day) })
      ),
      openSignals: [signal(), signal({ severity: 'warning' })],
      actionedSignals: [actionedSignal()],
      claraDrafts: [{ id: 'cd-1', title: 'X', reference: 'PROP-CD' }],
    });

    const { items } = await getAiAttentionQueue('t1', 'u1');

    expect(items).toHaveLength(10);
    expect(items.some((i) => i.kind === 'clara_draft')).toBe(false);
    // Only the OPEN query ran — the ACTIONED query was skipped with no slots left
    expect(signalFindMany).toHaveBeenCalledTimes(1);
  });
});
