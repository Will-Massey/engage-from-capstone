import { approveAndSendTouchpoint } from '../../jobs/touchpointEngine.js';
import { prisma } from '../../config/database.js';

jest.mock('../../config/database.js', () => ({
  prisma: {
    touchpoint: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    client: {
      update: jest.fn(),
    },
  },
}));

describe('approveAndSendTouchpoint tenant isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns false when touchpoint belongs to another tenant', async () => {
    (
      prisma.touchpoint.findFirst as jest.MockedFunction<typeof prisma.touchpoint.findFirst>
    ).mockResolvedValue(null as any);

    const ok = await approveAndSendTouchpoint('tp-1', 'tenant-a', 'user-1');
    expect(ok).toBe(false);
    expect(prisma.touchpoint.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tp-1', tenantId: 'tenant-a' },
      })
    );
  });
});
