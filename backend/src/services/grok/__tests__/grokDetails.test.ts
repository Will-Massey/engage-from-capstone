jest.mock('../../../config/database.js', () => {
  const prisma = {
    proposal: { findFirst: jest.fn(), update: jest.fn() },
    proposalSignature: { count: jest.fn() },
    paymentSplit: { count: jest.fn() },
    grokConnectorAudit: { create: jest.fn() },
    activityLog: { create: jest.fn() },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
    fn(prisma)
  );
  return { prisma };
});

import { prisma as prismaModule } from '../../../config/database.js';
import { callGrokTool, type GrokToolContext } from '../grokTools';
import { updateDraftDetails } from '../grokDetails';

const prisma = prismaModule as any;

const ctx: GrokToolContext = {
  tenantId: 't1',
  tenantName: 'Marks and Co',
  userId: 'u1',
  userName: 'Caroline Marks',
  tokenId: 'tok1',
  scopes: new Set(['read', 'draft_proposals']),
};

function locked(overrides: Record<string, unknown> = {}) {
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

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    reference: 'PROP-1',
    title: 'Old title',
    status: 'DRAFT',
    approvalStatus: 'NONE',
    notes: 'Keep',
    coverLetter: null,
    proposalSummary: null,
    terms: 'Standard terms',
    paymentTerms: '7 days',
    paymentFrequency: 'MONTHLY',
    validUntil: new Date('2027-01-31T12:00:00.000Z'),
    contractStartDate: null,
    subtotalPence: 15000,
    vatAmountPence: 3000,
    totalPence: 18000,
    createdAt: new Date('2026-11-26T00:00:00.000Z'),
    updatedAt: new Date('2026-11-26T00:00:00.000Z'),
    client: {
      id: 'c1',
      name: 'Acme Ltd',
      contactName: 'Ada',
      contactEmail: 'ada@acme.test',
      companyType: 'LIMITED_COMPANY',
      companyNumber: '12345678',
    },
    services: [],
    createdBy: { id: 'u1', firstName: 'Caroline', lastName: 'Marks' },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
    fn(prisma)
  );
  prisma.$queryRaw.mockResolvedValue([locked()]);
  prisma.proposalSignature.count.mockResolvedValue(0);
  prisma.paymentSplit.count.mockResolvedValue(0);
  prisma.proposal.findFirst.mockImplementation(async (args: { where: { tenantId: string } }) => {
    if (args.where.tenantId !== 't1') return null;
    return proposal();
  });
  prisma.proposal.update.mockResolvedValue({});
});

describe('engage_update_draft_details', () => {
  it('updates a draft title, valid until date, and payment terms, and writes both audit rows', async () => {
    const result = await callGrokTool(
      'engage_update_draft_details',
      {
        proposal_id: 'p1',
        title: '  New title  ',
        valid_until: '2099-06-01',
        payment_terms: '14 days',
      },
      ctx
    );
    expect(result.ok).toBe(true);
    const data = prisma.proposal.update.mock.calls[0][0].data;
    expect(data).toEqual({
      title: 'New title',
      validUntil: new Date('2099-06-01T12:00:00.000Z'),
      paymentTerms: '14 days',
    });
    expect(data.status).toBeUndefined();
    const sql = (prisma.$queryRaw as jest.Mock).mock.calls
      .map((call) => (call[0] as string[]).join(' '))
      .join(' ');
    expect(sql).toContain('FOR UPDATE');
    expect(prisma.grokConnectorAudit.create).toHaveBeenCalled();
    const audit = prisma.grokConnectorAudit.create.mock.calls[0][0].data;
    expect(audit.tool).toBe('engage_update_draft_details');
    expect(audit.userId).toBe('u1');
    expect(audit.proposalId).toBe('p1');
    expect(audit.tenantId).toBe('t1');
    const activity = prisma.activityLog.create.mock.calls[0][0].data;
    expect(activity.action).toBe('GROK_CONNECTOR');
    expect(activity.proposalId).toBe('p1');
    expect(activity.tenantId).toBe('t1');
    expect(activity.description).toMatch(/New title/);
    expect(activity.description).toMatch(/14 days/);
  });

  it('stores one day as the same phrase the staff screens use, and writes the voice activity row', async () => {
    await updateDraftDetails(
      { tokenId: '', userId: 'u1', tenantId: 't1' },
      { proposal_id: 'p1', payment_terms: 1 }
    );
    expect(prisma.proposal.update.mock.calls[0][0].data).toEqual({ paymentTerms: '1 day' });
    expect(prisma.grokConnectorAudit.create).not.toHaveBeenCalled();
    expect(prisma.activityLog.create.mock.calls[0][0].data.action).toBe('VOICE_ASSISTANT');
  });

  it.each(['SENT', 'VIEWED', 'ACCEPTED'])('refuses %s', async (status) => {
    prisma.$queryRaw.mockResolvedValue([locked({ status })]);
    const result = await callGrokTool(
      'engage_update_draft_details',
      { proposal_id: 'p1', title: 'Nope' },
      ctx
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(new RegExp(status));
    expect(prisma.proposal.update).not.toHaveBeenCalled();
    expect(prisma.grokConnectorAudit.create).not.toHaveBeenCalled();
    expect(prisma.activityLog.create).not.toHaveBeenCalled();
  });

  it('refuses a signed draft and a legacy signature image', async () => {
    prisma.proposalSignature.count.mockResolvedValue(1);
    const signed = await callGrokTool(
      'engage_update_draft_details',
      { proposal_id: 'p1', title: 'Nope' },
      ctx
    );
    expect(signed.ok).toBe(false);
    if (!signed.ok) expect(signed.error).toMatch(/signature/i);
    expect(prisma.proposal.update).not.toHaveBeenCalled();

    prisma.proposalSignature.count.mockResolvedValue(0);
    prisma.$queryRaw.mockResolvedValue([locked({ signature: 'data:image/png;base64,SECRET' })]);
    const legacy = await callGrokTool(
      'engage_update_draft_details',
      { proposal_id: 'p1', title: 'Nope' },
      ctx
    );
    expect(legacy.ok).toBe(false);
    if (!legacy.ok) expect(legacy.error).toMatch(/signature/i);
    expect(prisma.proposal.update).not.toHaveBeenCalled();
  });

  it('refuses another practice', async () => {
    const result = await callGrokTool(
      'engage_update_draft_details',
      { proposal_id: 'p1', title: 'Nope' },
      { ...ctx, tenantId: 't2' }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not found/i);
    expect(prisma.proposal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 't2' }) })
    );
    expect(prisma.proposal.update).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('refuses a past date, payment terms outside 1 to 90 days, a blank title, and unexpected fields', async () => {
    const past = await callGrokTool(
      'engage_update_draft_details',
      { proposal_id: 'p1', valid_until: '2000-01-01' },
      ctx
    );
    expect(past.ok).toBe(false);
    if (!past.ok) expect(past.error).toMatch(/future/i);

    const terms = await callGrokTool(
      'engage_update_draft_details',
      { proposal_id: 'p1', payment_terms: 'net 30' },
      ctx
    );
    expect(terms.ok).toBe(false);
    if (!terms.ok) expect(terms.error).toMatch(/1 to 90/);

    const tooLong = await callGrokTool(
      'engage_update_draft_details',
      { proposal_id: 'p1', payment_terms: '91 days' },
      ctx
    );
    expect(tooLong.ok).toBe(false);

    const blank = await callGrokTool(
      'engage_update_draft_details',
      { proposal_id: 'p1', title: '   ' },
      ctx
    );
    expect(blank.ok).toBe(false);
    if (!blank.ok) expect(blank.error).toMatch(/1 and 200/);

    const status = await callGrokTool(
      'engage_update_draft_details',
      { proposal_id: 'p1', title: 'Ok', status: 'SENT' },
      ctx
    );
    expect(status.ok).toBe(false);
    if (!status.ok) expect(status.error).toMatch(/Unexpected field "status"/);

    expect(prisma.proposal.update).not.toHaveBeenCalled();
  });
});
