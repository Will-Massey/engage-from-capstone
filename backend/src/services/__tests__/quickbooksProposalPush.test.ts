/**
 * R4.1 — manual QBO proposal push: recurring-lines invoice, ActivityLog
 * idempotency (+force), qbo: tag customer resolution.
 */

const proposalFindFirst = jest.fn();
const activityFindFirst = jest.fn();
const activityCreate = jest.fn(async () => ({}));

jest.mock('../../config/database.js', () => ({
  prisma: {
    proposal: { findFirst: proposalFindFirst },
    activityLog: { findFirst: activityFindFirst, create: activityCreate },
  },
}));
jest.mock('../../config/logger.js', () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
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

const createCustomer = jest.fn(async (..._args: unknown[]) => ({ Id: 'cust-new' }));
const createInvoice = jest.fn(async (..._args: unknown[]) => ({ Id: 'qbo-inv-9' }));
const findCustomerByEmail = jest.fn(async (..._args: unknown[]) => null);
const findCustomerByName = jest.fn(async (..._args: unknown[]) => null);
jest.mock('../../services/quickbooksApi.js', () => ({
  createCustomer: (...args: unknown[]) => createCustomer(...args),
  createInvoice: (...args: unknown[]) => createInvoice(...args),
  findCustomerByEmail: (...args: unknown[]) => findCustomerByEmail(...args),
  findCustomerByName: (...args: unknown[]) => findCustomerByName(...args),
}));

const getTenantQuickBooksSettings = jest.fn(async (..._args: unknown[]) => ({
  connected: true,
  realmId: 'realm1',
  refreshToken: 'rt',
  connectedAt: new Date().toISOString(),
}));
const saveTenantQuickBooksSettings = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('../../services/tenantQuickbooksSettings.js', () => ({
  getTenantQuickBooksSettings: (...args: unknown[]) => getTenantQuickBooksSettings(...args),
  saveTenantQuickBooksSettings: (...args: unknown[]) => saveTenantQuickBooksSettings(...args),
}));

import {
  extractQboCustomerId,
  pushProposalToQuickBooks,
  QBO_PROPOSAL_PUSHED_ACTION,
} from '../quickbooksProposalPush.js';

const dbProposal = {
  id: 'p1',
  reference: 'PROP-9',
  title: 'Monthly bundle',
  status: 'ACCEPTED',
  client: { name: 'Acme', contactEmail: 'a@acme.io', tags: 'vip,qbo:cust-77' },
  services: [
    {
      name: 'Bookkeeping',
      billingFrequency: 'MONTHLY',
      grossTotal: 102,
      grossTotalPence: 10200,
      sortOrder: 0,
    },
    {
      name: 'Onboarding',
      billingFrequency: 'ONE_TIME',
      grossTotal: 300,
      grossTotalPence: 30000,
      sortOrder: 1,
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  proposalFindFirst.mockResolvedValue(dbProposal);
  activityFindFirst.mockResolvedValue(null);
  createInvoice.mockResolvedValue({ Id: 'qbo-inv-9' });
});

describe('extractQboCustomerId', () => {
  it('reads the qbo: tag from Client.tags', () => {
    expect(extractQboCustomerId('vip, qbo:42, xero:abc')).toBe('42');
    expect(extractQboCustomerId('vip')).toBeUndefined();
  });
});

describe('pushProposalToQuickBooks', () => {
  it('creates an invoice from recurring lines only, via the qbo:-tagged customer', async () => {
    const result = await pushProposalToQuickBooks('t1', 'p1');

    // Linked tag short-circuits lookup/creation
    expect(findCustomerByEmail).not.toHaveBeenCalled();
    expect(createCustomer).not.toHaveBeenCalled();

    const [, invoiceArgs] = createInvoice.mock.calls[0] as [unknown, any];
    expect(invoiceArgs.customerId).toBe('cust-77');
    expect(invoiceArgs.docNumber).toBe('PROP-9');
    expect(invoiceArgs.lines).toEqual([{ description: 'Bookkeeping (MONTHLY)', amount: 102 }]);

    expect(result.invoiceId).toBe('qbo-inv-9');
    expect(result.linesPushed).toBe(1);
    expect(result.warnings.join(' ')).toContain('one-off service line');

    expect(activityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: QBO_PROPOSAL_PUSHED_ACTION,
          proposalId: 'p1',
          metadata: expect.stringContaining('qbo-inv-9'),
        }),
      })
    );
    expect(saveTenantQuickBooksSettings).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ lastPushAt: expect.any(String) })
    );
  });

  it('falls back to email/name lookup then creation when no tag is present', async () => {
    proposalFindFirst.mockResolvedValue({
      ...dbProposal,
      client: { name: 'Acme', contactEmail: 'a@acme.io', tags: '' },
    });

    await pushProposalToQuickBooks('t1', 'p1');

    expect(findCustomerByEmail).toHaveBeenCalledWith(expect.anything(), 'a@acme.io');
    expect(findCustomerByName).toHaveBeenCalledWith(expect.anything(), 'Acme');
    expect(createCustomer).toHaveBeenCalledWith(expect.anything(), {
      displayName: 'Acme',
      email: 'a@acme.io',
    });
  });

  it('skips when a QBO_PROPOSAL_PUSHED record exists, unless forced', async () => {
    activityFindFirst.mockResolvedValue({
      createdAt: new Date('2026-07-01T09:00:00Z'),
      metadata: JSON.stringify({ invoiceId: 'qbo-inv-old' }),
    });

    const skipped = await pushProposalToQuickBooks('t1', 'p1');
    expect(skipped.skipped).toBe(true);
    expect(skipped.invoiceId).toBe('qbo-inv-old');
    expect(createInvoice).not.toHaveBeenCalled();

    const forced = await pushProposalToQuickBooks('t1', 'p1', { force: true });
    expect(forced.skipped).toBeUndefined();
    expect(createInvoice).toHaveBeenCalledTimes(1);
  });

  it('rejects non-accepted proposals and recurring-less proposals', async () => {
    proposalFindFirst.mockResolvedValue({ ...dbProposal, status: 'SENT' });
    await expect(pushProposalToQuickBooks('t1', 'p1')).rejects.toThrow('Only accepted proposals');

    proposalFindFirst.mockResolvedValue({
      ...dbProposal,
      services: [dbProposal.services[1]], // ONE_TIME only
    });
    await expect(pushProposalToQuickBooks('t1', 'p1')).rejects.toThrow(
      'No recurring service lines'
    );
  });
});
