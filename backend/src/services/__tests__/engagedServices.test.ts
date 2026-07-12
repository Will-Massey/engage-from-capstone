const proposalFindMany = jest.fn();

jest.mock('../../config/database.js', () => ({
  prisma: { proposal: { findMany: proposalFindMany } },
}));

import { getEngagedServicesByClient, getEngagedServiceNames } from '../engagedServices.js';

beforeEach(() => {
  proposalFindMany.mockReset();
});

describe('getEngagedServicesByClient', () => {
  it('derives engaged services from accepted proposals with template categories', async () => {
    proposalFindMany.mockResolvedValue([
      {
        clientId: 'c1',
        services: [
          { name: 'Monthly Payroll', serviceTemplate: { category: 'PAYROLL' } },
          { name: 'Statutory Accounts', serviceTemplate: null },
        ],
      },
      {
        clientId: 'c2',
        services: [{ name: 'VAT Returns', serviceTemplate: { category: 'TAX' } }],
      },
    ]);

    const byClient = await getEngagedServicesByClient('t1');

    expect(proposalFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't1', status: 'ACCEPTED' } })
    );
    expect(byClient.get('c1')).toEqual([
      { name: 'Monthly Payroll', category: 'PAYROLL' },
      { name: 'Statutory Accounts', category: null },
    ]);
    expect(byClient.get('c2')).toEqual([{ name: 'VAT Returns', category: 'TAX' }]);
  });

  it('deduplicates the same service name across multiple accepted proposals', async () => {
    proposalFindMany.mockResolvedValue([
      { clientId: 'c1', services: [{ name: 'Bookkeeping', serviceTemplate: null }] },
      { clientId: 'c1', services: [{ name: 'bookkeeping ', serviceTemplate: null }] },
    ]);

    const byClient = await getEngagedServicesByClient('t1');
    expect(byClient.get('c1')).toHaveLength(1);
  });

  it('filters by clientIds when provided', async () => {
    proposalFindMany.mockResolvedValue([]);
    await getEngagedServicesByClient('t1', ['c1', 'c2']);
    expect(proposalFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 't1', status: 'ACCEPTED', clientId: { in: ['c1', 'c2'] } },
      })
    );
  });
});

describe('getEngagedServiceNames', () => {
  it('returns an empty list for a client with no accepted proposals', async () => {
    proposalFindMany.mockResolvedValue([]);
    await expect(getEngagedServiceNames('t1', 'c9')).resolves.toEqual([]);
  });

  it('returns the engaged services for the requested client only', async () => {
    proposalFindMany.mockResolvedValue([
      { clientId: 'c1', services: [{ name: 'Payroll', serviceTemplate: null }] },
    ]);
    await expect(getEngagedServiceNames('t1', 'c1')).resolves.toEqual([
      { name: 'Payroll', category: null },
    ]);
  });
});
