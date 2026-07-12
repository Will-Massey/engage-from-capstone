/**
 * R4.1 — paid Stripe invoices mirrored into Xero (paid_invoices mode) and
 * QuickBooks: line-match vs fallback, Reference = Stripe invoice id, payment
 * only when an account is configured, ActivityLog idempotency, never throws.
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

const getTenantXeroSettings = jest.fn();
const isXeroOAuthConfigured = jest.fn(() => true);
jest.mock('../../services/tenantXeroSettings.js', () => ({
  getTenantXeroSettings: (...args: unknown[]) => getTenantXeroSettings(...args),
  isXeroOAuthConfigured: () => isXeroOAuthConfigured(),
}));

const getTenantQuickBooksSettings = jest.fn();
const isQuickBooksOAuthConfigured = jest.fn(() => true);
jest.mock('../../services/tenantQuickbooksSettings.js', () => ({
  getTenantQuickBooksSettings: (...args: unknown[]) => getTenantQuickBooksSettings(...args),
  isQuickBooksOAuthConfigured: () => isQuickBooksOAuthConfigured(),
}));

const getAuthenticatedXeroSession = jest.fn(async (..._args: unknown[]) => ({
  settings: {},
  xeroTenantId: 'xt1',
}));
const resolveOrCreateContact = jest.fn(async (..._args: unknown[]) => 'c-1');
const createXeroAccRecInvoice = jest.fn(async (..._args: unknown[]) => 'inv-1');
const createXeroPaymentForInvoice = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('../../services/xeroService.js', () => ({
  getAuthenticatedXeroSession: (...args: unknown[]) => getAuthenticatedXeroSession(...args),
  resolveOrCreateContact: (...args: unknown[]) => resolveOrCreateContact(...args),
  createXeroAccRecInvoice: (...args: unknown[]) => createXeroAccRecInvoice(...args),
  createXeroPaymentForInvoice: (...args: unknown[]) => createXeroPaymentForInvoice(...args),
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

const qboCreateInvoice = jest.fn(async (..._args: unknown[]) => ({ Id: 'qbo-inv-1' }));
const qboCreatePayment = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('../../services/quickbooksApi.js', () => ({
  createInvoice: (...args: unknown[]) => qboCreateInvoice(...args),
  createPayment: (...args: unknown[]) => qboCreatePayment(...args),
}));

const resolveOrCreateQboCustomer = jest.fn(async (..._args: unknown[]) => 'cust-1');
jest.mock('../../services/quickbooksProposalPush.js', () => ({
  resolveOrCreateQboCustomer: (...args: unknown[]) => resolveOrCreateQboCustomer(...args),
}));

import {
  planPaidInvoiceLines,
  syncPaidStripeInvoice,
  XERO_INVOICE_SYNCED_ACTION,
  QBO_INVOICE_SYNCED_ACTION,
} from '../accountingPaidInvoiceSync.js';

const services = [
  {
    name: 'Bookkeeping',
    billingFrequency: 'MONTHLY',
    lineTotal: 85,
    vatAmount: 17,
    grossTotal: 102,
    grossTotalPence: 10200,
  },
  {
    name: 'Payroll',
    billingFrequency: 'MONTHLY',
    lineTotal: 40,
    vatAmount: 8,
    grossTotal: 48,
    grossTotalPence: 4800,
  },
  {
    name: 'Accounts',
    billingFrequency: 'ANNUALLY',
    lineTotal: 500,
    vatAmount: 100,
    grossTotal: 600,
    grossTotalPence: 60000,
  },
  {
    name: 'Onboarding',
    billingFrequency: 'ONE_TIME',
    lineTotal: 250,
    vatAmount: 50,
    grossTotal: 300,
    grossTotalPence: 30000,
  },
];

const dbProposal = {
  id: 'p1',
  title: 'Full service',
  reference: 'PROP-7',
  client: { name: 'Acme', contactEmail: 'a@acme.io', contactName: null, tags: '' },
  services,
};

const args = {
  tenantId: 't1',
  proposalId: 'p1',
  stripeInvoiceId: 'in_abc123',
  amountPaidPence: 15000, // monthly group: 10200 + 4800
};

beforeEach(() => {
  jest.clearAllMocks();
  isXeroOAuthConfigured.mockReturnValue(true);
  isQuickBooksOAuthConfigured.mockReturnValue(true);
  proposalFindFirst.mockResolvedValue(dbProposal);
  activityFindFirst.mockResolvedValue(null);
  getTenantXeroSettings.mockResolvedValue({ connected: true, xeroSyncMode: 'paid_invoices' });
  getTenantQuickBooksSettings.mockResolvedValue(null); // QBO off unless a test opts in
  createXeroAccRecInvoice.mockResolvedValue('inv-1');
  qboCreateInvoice.mockResolvedValue({ Id: 'qbo-inv-1' });
});

describe('planPaidInvoiceLines', () => {
  it('uses the matching billing-frequency group with its VAT split', () => {
    const plan = planPaidInvoiceLines(services, 15000, 'Full service');
    expect(plan.matchedLines).toBe(true);
    expect(plan.lines).toEqual([
      { description: 'Bookkeeping', netAmount: 85, vatAmount: 17, grossAmount: 102 },
      { description: 'Payroll', netAmount: 40, vatAmount: 8, grossAmount: 48 },
    ]);
  });

  it('matches the annual group independently', () => {
    const plan = planPaidInvoiceLines(services, 60000, 'Full service');
    expect(plan.matchedLines).toBe(true);
    expect(plan.lines).toHaveLength(1);
    expect(plan.lines[0].description).toBe('Accounts');
  });

  it('falls back to a single line when nothing matches (e.g. first invoice with one-offs)', () => {
    const plan = planPaidInvoiceLines(services, 45000, 'Full service');
    expect(plan.matchedLines).toBe(false);
    expect(plan.lines).toEqual([
      {
        description: 'Recurring fees — Full service',
        netAmount: 450,
        vatAmount: 0,
        grossAmount: 450,
      },
    ]);
  });

  it('never matches against ONE_TIME lines', () => {
    const plan = planPaidInvoiceLines(services, 30000, 'Full service');
    expect(plan.matchedLines).toBe(false);
  });
});

describe('syncPaidStripeInvoice — Xero', () => {
  it('creates an invoice with matched lines, Reference = Stripe invoice id', async () => {
    await syncPaidStripeInvoice(args);

    expect(createXeroAccRecInvoice).toHaveBeenCalledTimes(1);
    const [, invoiceArgs] = createXeroAccRecInvoice.mock.calls[0] as [unknown, any];
    expect(invoiceArgs.reference).toBe('in_abc123');
    expect(invoiceArgs.contactId).toBe('c-1');
    expect(invoiceArgs.lines).toEqual([
      { description: 'Bookkeeping', unitAmount: 85, taxAmount: 17 },
      { description: 'Payroll', unitAmount: 40, taxAmount: 8 },
    ]);
    expect(activityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: XERO_INVOICE_SYNCED_ACTION,
          metadata: expect.stringContaining('in_abc123'),
        }),
      })
    );
  });

  it('falls back to a single NONE-tax line when the amount disagrees with the lines', async () => {
    await syncPaidStripeInvoice({ ...args, amountPaidPence: 12345 });

    const [, invoiceArgs] = createXeroAccRecInvoice.mock.calls[0] as [unknown, any];
    expect(invoiceArgs.lines).toEqual([
      {
        description: 'Recurring fees — Full service',
        unitAmount: 123.45,
        taxAmount: 0,
        taxType: 'NONE',
      },
    ]);
  });

  it('creates a payment only when a payment account code is configured', async () => {
    await syncPaidStripeInvoice(args);
    expect(createXeroPaymentForInvoice).not.toHaveBeenCalled();

    getTenantXeroSettings.mockResolvedValue({
      connected: true,
      xeroSyncMode: 'paid_invoices',
      xeroPaymentAccountCode: '090',
    });
    await syncPaidStripeInvoice({ ...args, stripeInvoiceId: 'in_next' });

    expect(createXeroPaymentForInvoice).toHaveBeenCalledWith(expect.anything(), {
      invoiceId: 'inv-1',
      accountCode: '090',
      amount: 150,
    });
  });

  it('skips when an XERO_INVOICE_SYNCED record already exists for the Stripe invoice', async () => {
    activityFindFirst.mockResolvedValue({ id: 'log-1' });
    await syncPaidStripeInvoice(args);

    expect(activityFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          action: XERO_INVOICE_SYNCED_ACTION,
          metadata: { contains: 'in_abc123' },
        }),
      })
    );
    expect(createXeroAccRecInvoice).not.toHaveBeenCalled();
  });

  it('does nothing in repeating_draft mode', async () => {
    getTenantXeroSettings.mockResolvedValue({ connected: true, xeroSyncMode: 'repeating_draft' });
    await syncPaidStripeInvoice(args);
    expect(createXeroAccRecInvoice).not.toHaveBeenCalled();
  });

  it('never throws when the Xero API fails', async () => {
    createXeroAccRecInvoice.mockRejectedValue(new Error('xero 500'));
    await expect(syncPaidStripeInvoice(args)).resolves.toBeUndefined();
    expect(activityCreate).not.toHaveBeenCalled(); // no success record on failure
  });
});

describe('syncPaidStripeInvoice — QuickBooks', () => {
  beforeEach(() => {
    getTenantXeroSettings.mockResolvedValue(null); // isolate QBO
    getTenantQuickBooksSettings.mockResolvedValue({ connected: true, realmId: 'realm1' });
  });

  it('creates a QBO invoice carrying the Stripe invoice id and logs QBO_INVOICE_SYNCED', async () => {
    await syncPaidStripeInvoice(args);

    expect(qboCreateInvoice).toHaveBeenCalledTimes(1);
    const [, invoiceArgs] = qboCreateInvoice.mock.calls[0] as [unknown, any];
    expect(invoiceArgs.customerId).toBe('cust-1');
    expect(invoiceArgs.privateNote).toContain('in_abc123');
    expect(invoiceArgs.lines).toEqual([
      { description: 'Bookkeeping', amount: 102 },
      { description: 'Payroll', amount: 48 },
    ]);
    expect(qboCreatePayment).not.toHaveBeenCalled(); // no payment account configured
    expect(activityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: QBO_INVOICE_SYNCED_ACTION,
          metadata: expect.stringContaining('in_abc123'),
        }),
      })
    );
  });

  it('records a payment when paymentAccountId is configured', async () => {
    getTenantQuickBooksSettings.mockResolvedValue({
      connected: true,
      realmId: 'realm1',
      paymentAccountId: '35',
    });
    await syncPaidStripeInvoice(args);

    expect(qboCreatePayment).toHaveBeenCalledWith(expect.anything(), {
      customerId: 'cust-1',
      invoiceId: 'qbo-inv-1',
      amount: 150,
      depositAccountId: '35',
    });
  });

  it('is idempotent per Stripe invoice id', async () => {
    activityFindFirst.mockResolvedValue({ id: 'log-2' });
    await syncPaidStripeInvoice(args);
    expect(qboCreateInvoice).not.toHaveBeenCalled();
  });

  it('never throws when the QBO API fails', async () => {
    qboCreateInvoice.mockRejectedValue(new Error('qbo 500'));
    await expect(syncPaidStripeInvoice(args)).resolves.toBeUndefined();
  });
});

describe('syncPaidStripeInvoice — guards', () => {
  it('ignores zero/negative amounts and missing proposals', async () => {
    await syncPaidStripeInvoice({ ...args, amountPaidPence: 0 });
    expect(proposalFindFirst).not.toHaveBeenCalled();

    proposalFindFirst.mockResolvedValue(null);
    await syncPaidStripeInvoice(args);
    expect(createXeroAccRecInvoice).not.toHaveBeenCalled();
    expect(qboCreateInvoice).not.toHaveBeenCalled();
  });
});
