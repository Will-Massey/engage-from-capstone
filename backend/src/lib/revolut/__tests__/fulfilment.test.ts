import { fulfilEngageOrder } from '../fulfilment.js';
import { prisma } from '../../../config/database.js';
import { recordProposalPaymentSplit } from '../splits.js';

jest.mock('../../../config/database.js', () => ({
  prisma: {
    tenant: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    proposal: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../splits.js', () => ({
  recordProposalPaymentSplit: jest.fn(),
}));

jest.mock('../../superadmin.js', () => ({
  getEngageSuperadmin: jest.fn(() => null),
}));

describe('fulfilEngageOrder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('is idempotent when proposal payment is already completed', async () => {
    (prisma.proposal.findFirst as jest.Mock).mockResolvedValue({
      id: 'prop-1',
      total: 120,
      paymentStatus: 'COMPLETED',
    });

    await fulfilEngageOrder({
      order: {
        id: 'ord_repeat',
        metadata: {
          type: 'proposal_payment',
          proposalId: 'prop-1',
          tenantId: 'tenant-1',
        },
      },
    });

    expect(recordProposalPaymentSplit).not.toHaveBeenCalled();
    expect(prisma.proposal.update).not.toHaveBeenCalled();
  });

  it('records split then marks proposal paid on first delivery', async () => {
    (prisma.proposal.findFirst as jest.Mock).mockResolvedValue({
      id: 'prop-2',
      total: 250.5,
      paymentStatus: 'PENDING',
    });
    (recordProposalPaymentSplit as jest.Mock).mockResolvedValue({ id: 'split-1' });

    await fulfilEngageOrder({
      order: {
        id: 'ord_new',
        metadata: {
          type: 'proposal_payment',
          proposalId: 'prop-2',
          tenantId: 'tenant-2',
        },
      },
    });

    expect(recordProposalPaymentSplit).toHaveBeenCalledWith({
      proposalId: 'prop-2',
      tenantId: 'tenant-2',
      revolutOrderId: 'ord_new',
      totalPence: 25050,
    });
    expect(prisma.proposal.update).toHaveBeenCalledWith({
      where: { id: 'prop-2' },
      data: expect.objectContaining({
        paymentStatus: 'COMPLETED',
        paymentMethod: 'revolut',
        paymentId: 'ord_new',
      }),
    });
  });

  it('activates platform subscription from merchant_order_ext_ref fallback', async () => {
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ subscriptionStatus: 'trial' });

    await fulfilEngageOrder({
      order: {
        id: 'ord_platform',
        merchant_order_ext_ref: 'engage:platform:tenant-3:PROFESSIONAL',
        amount: 9900,
      },
    });

    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: 'tenant-3' },
      data: expect.objectContaining({
        subscriptionTier: 'PROFESSIONAL',
        subscriptionStatus: 'active',
        revolutOrderId: 'ord_platform',
      }),
    });
  });
});
