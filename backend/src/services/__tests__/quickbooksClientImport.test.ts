/**
 * R4.1 — QuickBooks customer import: email/name dedupe, dryRun, qbo:<Id> tag.
 */

const clientFindMany = jest.fn();
const clientCreate = jest.fn();

jest.mock('../../config/database.js', () => ({
  prisma: {
    client: { findMany: clientFindMany, create: clientCreate },
  },
}));

const getAuthenticatedQuickBooksSession = jest.fn(async (..._args: unknown[]) => ({
  accessToken: 'at',
  realmId: 'realm1',
  settings: {},
}));
jest.mock('../../services/quickbooksService.js', () => ({
  getAuthenticatedQuickBooksSession: (...args: unknown[]) =>
    getAuthenticatedQuickBooksSession(...args),
}));

const queryCustomers = jest.fn();
jest.mock('../../services/quickbooksApi.js', () => ({
  queryCustomers: (...args: unknown[]) => queryCustomers(...args),
}));

const getTenantQuickBooksSettings = jest.fn();
const saveTenantQuickBooksSettings = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('../../services/tenantQuickbooksSettings.js', () => ({
  getTenantQuickBooksSettings: (...args: unknown[]) => getTenantQuickBooksSettings(...args),
  saveTenantQuickBooksSettings: (...args: unknown[]) => saveTenantQuickBooksSettings(...args),
}));

import { importQuickBooksClients } from '../quickbooksClientImport.js';

const qboCustomers = [
  { Id: '1', DisplayName: 'Acme Ltd', PrimaryEmailAddr: { Address: 'finance@acme.io' } },
  { Id: '2', DisplayName: 'Beta LLP', PrimaryEmailAddr: { Address: 'hello@beta.co' } },
  { Id: '3', DisplayName: 'Existing By Email', PrimaryEmailAddr: { Address: 'known@x.io' } },
  { Id: '4', DisplayName: 'Existing  By   Name' },
  { Id: '5', DisplayName: 'Inactive Co', Active: false },
  { Id: '6', DisplayName: '' },
];

beforeEach(() => {
  jest.clearAllMocks();
  queryCustomers.mockResolvedValue(qboCustomers);
  clientFindMany.mockResolvedValue([
    { id: 'c-known', name: 'Known Client', contactEmail: 'known@x.io', tags: '' },
    { id: 'c-name', name: 'existing by name', contactEmail: 'other@x.io', tags: '' },
  ]);
  clientCreate.mockImplementation(async ({ data }: any) => ({ id: 'new', ...data }));
  getTenantQuickBooksSettings.mockResolvedValue({
    connected: true,
    realmId: 'realm1',
    refreshToken: 'rt',
    connectedAt: new Date().toISOString(),
  });
});

describe('importQuickBooksClients', () => {
  it('creates new clients with the qbo:<Id> tag and dedupes by email and normalised name', async () => {
    const result = await importQuickBooksClients('t1', false);

    expect(result.qboCustomersFetched).toBe(6);
    expect(result.created).toBe(2);
    expect(result.skipped).toBe(4);
    expect(result.errors).toBe(0);

    expect(clientCreate).toHaveBeenCalledTimes(2);
    expect(clientCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 't1',
          name: 'Acme Ltd',
          contactEmail: 'finance@acme.io',
          tags: 'qbo:1',
        }),
      })
    );

    const reasons = result.skippedCustomers.map((s) => s.reason).sort();
    expect(reasons).toEqual([
      'duplicate_email',
      'duplicate_name',
      'inactive_customer',
      'missing_name_and_email',
    ]);

    // lastImportAt stamped on a real (non-dry) run
    expect(saveTenantQuickBooksSettings).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ lastImportAt: expect.any(String) })
    );
  });

  it('dryRun previews without writing', async () => {
    const result = await importQuickBooksClients('t1', true);

    expect(result.dryRun).toBe(true);
    expect(result.created).toBe(2);
    expect(clientCreate).not.toHaveBeenCalled();
    expect(saveTenantQuickBooksSettings).not.toHaveBeenCalled();
  });

  it('collects per-customer create errors without aborting the run', async () => {
    clientCreate
      .mockRejectedValueOnce(new Error('unique constraint'))
      .mockImplementation(async ({ data }: any) => ({ id: 'new', ...data }));

    const result = await importQuickBooksClients('t1', false);
    expect(result.errors).toBe(1);
    expect(result.created).toBe(1);
    expect(result.importErrors[0].error).toContain('unique constraint');
  });
});
