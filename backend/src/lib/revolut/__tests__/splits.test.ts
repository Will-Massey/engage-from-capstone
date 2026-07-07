import { calculatePaymentSplit, recordProposalPaymentSplit } from '../splits.js';
import { prisma } from '../../../config/database.js';
import { isPayoutCollectionEnabled } from '../../../services/payoutSettingsService.js';
import { isBusinessApiConfigured } from '../business-client.js';

jest.mock('../../../config/database.js', () => ({
  prisma: {
    tenantPayoutSettings: { findUnique: jest.fn() },
    tenant: { findUnique: jest.fn() },
    paymentSplit: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../../../services/payoutSettingsService.js', () => ({
  isPayoutCollectionEnabled: jest.fn(),
}));

jest.mock('../business-client.js', () => ({
  isBusinessApiConfigured: jest.fn(() => false),
  transferToAgency: jest.fn(),
}));

describe('calculatePaymentSplit', () => {
  it('derives platform fee in whole pence from bps', () => {
    const split = calculatePaymentSplit(10_000, 250);
    expect(split.totalPence).toBe(10_000);
    expect(split.platformFeePence).toBe(250);
    expect(split.platformFeeBps).toBe(250);
    expect(split.agencySharePence).toBe(
      10_000 - split.platformFeePence - split.processorFeePence - split.processorMarkupPence
    );
  });
});

describe('recordProposalPaymentSplit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isPayoutCollectionEnabled as jest.Mock).mockResolvedValue(true);
    (isBusinessApiConfigured as jest.Mock).mockReturnValue(false);
    (prisma.tenantPayoutSettings.findUnique as jest.Mock).mockResolvedValue({ enabled: true });
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ subscriptionTier: 'PROFESSIONAL' });
  });

  it('returns null when payout collection is disabled for the tenant', async () => {
    (isPayoutCollectionEnabled as jest.Mock).mockResolvedValue(false);

    const result = await recordProposalPaymentSplit({
      proposalId: 'prop-1',
      tenantId: 'tenant-1',
      revolutOrderId: 'ord-1',
      totalPence: 5000,
    });

    expect(result).toBeNull();
    expect(prisma.paymentSplit.create).not.toHaveBeenCalled();
  });

  it('returns existing split on idempotent redelivery', async () => {
    const existing = { id: 'split-existing', revolutOrderId: 'ord-dup' };
    (prisma.paymentSplit.findFirst as jest.Mock).mockResolvedValue(existing);

    const result = await recordProposalPaymentSplit({
      proposalId: 'prop-2',
      tenantId: 'tenant-2',
      revolutOrderId: 'ord-dup',
      totalPence: 12_000,
    });

    expect(result).toBe(existing);
    expect(prisma.paymentSplit.create).not.toHaveBeenCalled();
  });

  it('persists a single split row with exact pence fields', async () => {
    (prisma.paymentSplit.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.paymentSplit.create as jest.Mock).mockResolvedValue({ id: 'split-new' });

    await recordProposalPaymentSplit({
      proposalId: 'prop-3',
      tenantId: 'tenant-3',
      revolutOrderId: 'ord-new',
      totalPence: 10_000,
    });

    expect(prisma.paymentSplit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        proposalId: 'prop-3',
        tenantId: 'tenant-3',
        revolutOrderId: 'ord-new',
        idempotencyKey: 'revolut:ord-new',
        totalPence: 10_000,
        platformFeePence: 250,
        platformFeeBps: 250,
        currency: 'GBP',
        payoutStatus: 'MANUAL',
      }),
    });
  });
});
