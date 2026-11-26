jest.mock('../../../config/database.js', () => {
  const prisma = {
    proposal: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), create: jest.fn() },
    proposalView: { count: jest.fn(), findMany: jest.fn() },
    proposalSignature: { count: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    paymentSplit: { count: jest.fn() },
    activityLog: { findMany: jest.fn(), create: jest.fn() },
    grokConnectorAudit: { create: jest.fn() },
  };
  return { prisma };
});

import { prisma as prismaModule } from '../../../config/database.js';
import { callGrokTool, type GrokToolContext } from '../grokTools';

const prisma = prismaModule as any;

const ctx: GrokToolContext = {
  tenantId: 't1',
  tenantName: 'Marks and Co',
  userId: 'u1',
  userName: 'Caroline Marks',
  tokenId: 'tok1',
  scopes: new Set(['read', 'draft_proposals']),
};

const SIGNATURE_IMAGE = 'data:image/png;base64,SECRETIMAGE';
const SIGNER_IMAGE = 'data:image/png;base64,SIGNIMAGE';
const SIGNER_IP = '203.0.113.8';
const DOCUMENT_HASH = 'abc123hashsecretdocument';
const ACTIVITY_IP = '198.51.100.9';
const TOKEN_IN_METADATA = 'secret-token-value';

function guardFields(overrides: Record<string, unknown> = {}) {
  return {
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

function proposalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    reference: 'PROP-1',
    title: 'Year end',
    status: 'DRAFT',
    sentAt: new Date('2026-11-01T00:00:00.000Z'),
    viewedAt: new Date('2026-11-02T00:00:00.000Z'),
    originalProposalId: 'parent-1',
    isRenewal: false,
    ...guardFields(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.proposal.findFirst.mockImplementation(async (args: { where: Record<string, string> }) => {
    if (args.where.tenantId !== 't1') return null;
    if (args.where.id === 'p1') return proposalRow();
    if (args.where.id === 'parent-1') {
      return {
        id: 'parent-1',
        reference: 'PROP-0',
        title: 'Original',
        status: 'ACCEPTED',
        isRenewal: false,
      };
    }
    return null;
  });
  prisma.proposal.findMany.mockImplementation(async (args: { where: { tenantId: string } }) => {
    if (args.where.tenantId !== 't1') return [];
    return [
      {
        id: 'child-1',
        reference: 'PROP-2',
        title: 'Copy',
        status: 'DRAFT',
        isRenewal: false,
      },
    ];
  });
  prisma.proposalView.count.mockResolvedValue(4);
  prisma.proposalSignature.count.mockResolvedValue(1);
  prisma.proposalSignature.findMany.mockResolvedValue([
    {
      signedBy: 'Ada Lovelace',
      signedAt: new Date('2026-11-03T10:00:00.000Z'),
      signatureData: SIGNER_IMAGE,
      signatureFilePath: '/uploads/secret.png',
      ipAddress: SIGNER_IP,
      userAgent: 'SecretAgent',
      documentHash: DOCUMENT_HASH,
      termsHash: 'terms-hash-secret',
    },
  ]);
  prisma.paymentSplit.count.mockResolvedValue(0);
  prisma.activityLog.findMany.mockResolvedValue([
    {
      id: 'a1',
      action: 'PROPOSAL_VIEWED',
      description: 'Client opened the proposal',
      createdAt: new Date('2026-11-02T09:00:00.000Z'),
      user: { firstName: 'Caroline', lastName: 'Marks' },
      ipAddress: ACTIVITY_IP,
      userAgent: 'BrowserSecret',
      metadata: JSON.stringify({ tokenId: TOKEN_IN_METADATA }),
    },
  ]);
});

describe('engage_get_proposal_history', () => {
  it('redacts signature images and keeps signer names, dates, and the guard decision', async () => {
    prisma.proposal.findFirst.mockImplementation(
      async (args: { where: Record<string, string> }) => {
        if (args.where.tenantId !== 't1') return null;
        if (args.where.id === 'p1')
          return proposalRow({ signature: SIGNATURE_IMAGE, status: 'SENT' });
        if (args.where.id === 'parent-1') {
          return {
            id: 'parent-1',
            reference: 'PROP-0',
            title: 'Original',
            status: 'ACCEPTED',
            isRenewal: false,
          };
        }
        return null;
      }
    );

    const result = await callGrokTool('engage_get_proposal_history', { proposal_id: 'p1' }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as any;
    expect(data.status).toBe('SENT');
    expect(data.sent_at).toEqual(new Date('2026-11-01T00:00:00.000Z'));
    expect(data.viewed_at).toEqual(new Date('2026-11-02T00:00:00.000Z'));
    expect(data.view_count).toBe(4);
    expect(data.signature_count).toBe(1);
    expect(data.signers).toEqual([
      { name: 'Ada Lovelace', signed_at: new Date('2026-11-03T10:00:00.000Z') },
    ]);
    expect(data.revisions.copied_from).toMatchObject({ id: 'parent-1', reference: 'PROP-0' });
    expect(data.revisions.copies).toEqual([
      expect.objectContaining({ id: 'child-1', reference: 'PROP-2', status: 'DRAFT' }),
    ]);
    expect(data.activity[0]).toMatchObject({
      action: 'PROPOSAL_VIEWED',
      description: 'Client opened the proposal',
      user: 'Caroline Marks',
    });
    expect(data.can_bot_change).toBe(false);
    expect(data.reason).toMatch(/signature/i);

    const dumped = JSON.stringify(data);
    for (const secret of [
      SIGNATURE_IMAGE,
      SIGNER_IMAGE,
      SIGNER_IP,
      DOCUMENT_HASH,
      ACTIVITY_IP,
      TOKEN_IN_METADATA,
      'SecretAgent',
      'BrowserSecret',
      'terms-hash-secret',
      '/uploads/secret.png',
    ]) {
      expect(dumped).not.toContain(secret);
    }
    expect(prisma.proposalSignature.findMany.mock.calls[0][0].select).toEqual({
      signedBy: true,
      signedAt: true,
    });
    expect(prisma.activityLog.findMany.mock.calls[0][0].select.ipAddress).toBeUndefined();
    expect(prisma.activityLog.findMany.mock.calls[0][0].select.metadata).toBeUndefined();
    expect(prisma.activityLog.findMany.mock.calls[0][0].select.userAgent).toBeUndefined();
    expect(prisma.proposalView.findMany).not.toHaveBeenCalled();
    expect(prisma.proposal.update).not.toHaveBeenCalled();
    expect(prisma.proposal.create).not.toHaveBeenCalled();
    expect(prisma.activityLog.create).not.toHaveBeenCalled();
    expect(prisma.grokConnectorAudit.create).not.toHaveBeenCalled();
    expect(prisma.proposalSignature.update).not.toHaveBeenCalled();
  });

  it('is limited to the practice on the token, both ways on revision links', async () => {
    const other = await callGrokTool(
      'engage_get_proposal_history',
      { proposal_id: 'p1' },
      { ...ctx, tenantId: 't2' }
    );
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.error).toMatch(/not found/i);
    expect(prisma.proposal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'p1', tenantId: 't2' }) })
    );

    prisma.proposal.findFirst.mockImplementation(
      async (args: { where: Record<string, string> }) => {
        if (args.where.tenantId !== 't1') return null;
        if (args.where.id === 'p1') return proposalRow({ originalProposalId: 'foreign-id-999' });
        return null;
      }
    );
    prisma.proposal.findMany.mockResolvedValue([]);
    prisma.proposalSignature.count.mockResolvedValue(0);
    const hidden = await callGrokTool('engage_get_proposal_history', { proposal_id: 'p1' }, ctx);
    expect(hidden.ok).toBe(true);
    if (!hidden.ok) return;
    const data = hidden.data as any;
    expect(data.revisions.copied_from).toBeNull();
    expect(data.can_bot_change).toBe(true);
    expect(data.reason).toBeNull();
    expect(JSON.stringify(data)).not.toContain('foreign-id-999');
    expect(prisma.proposal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ originalProposalId: 'p1', tenantId: 't1' }),
      })
    );
    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ proposalId: 'p1', tenantId: 't1' }),
      })
    );
  });
});
