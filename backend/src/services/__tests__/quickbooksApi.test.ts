/**
 * R4.1 — QBO v3 request construction: URL/base/minorversion, bearer auth,
 * pagination, query escaping, invoice/payment bodies.
 */

jest.mock('../../utils/logger.js', () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock('../../services/tenantQuickbooksSettings.js', () => ({
  getTenantQuickBooksSettings: jest.fn(),
  saveTenantQuickBooksSettings: jest.fn(),
  isQuickBooksOAuthConfigured: () => true,
}));

import {
  queryCustomers,
  findCustomerByEmail,
  createCustomer,
  createInvoice,
  createPayment,
} from '../quickbooksApi.js';
import type { QuickBooksSession } from '../quickbooksService.js';

const fetchMock = jest.fn();

const session: QuickBooksSession = {
  accessToken: 'at-1',
  realmId: 'realm-1',
  settings: { connected: true, refreshToken: 'rt', connectedAt: new Date().toISOString() },
};

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.QUICKBOOKS_SANDBOX;
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('quickbooksApi request construction', () => {
  it('queries customers against the company endpoint with bearer auth + minorversion', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ QueryResponse: { Customer: [{ Id: '1' }] } }));

    const customers = await queryCustomers(session);

    expect(customers).toEqual([{ Id: '1' }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain(
      'https://sandbox-quickbooks.api.intuit.com/v3/company/realm-1/query?query='
    );
    expect(url).toContain('minorversion=75');
    expect(decodeURIComponent(url)).toContain('select * from Customer startposition 1');
    expect(init.headers.Authorization).toBe('Bearer at-1');
  });

  it('uses the production base when QUICKBOOKS_SANDBOX=false', async () => {
    process.env.QUICKBOOKS_SANDBOX = 'false';
    fetchMock.mockResolvedValueOnce(jsonResponse({ QueryResponse: {} }));

    await queryCustomers(session);
    expect(fetchMock.mock.calls[0][0]).toContain(
      'https://quickbooks.api.intuit.com/v3/company/realm-1/query'
    );
  });

  it('escapes single quotes in targeted customer queries', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ QueryResponse: {} }));

    await findCustomerByEmail(session, "o'brien@x.io");
    const url = decodeURIComponent(fetchMock.mock.calls[0][0]);
    expect(url).toContain("PrimaryEmailAddr = 'o\\'brien@x.io'");
  });

  it('POSTs customer, invoice, and payment bodies as JSON', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ Customer: { Id: 'c-1' } }))
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: 'i-1' } }))
      .mockResolvedValueOnce(jsonResponse({ Payment: { Id: 'pay-1' } }));

    await createCustomer(session, { displayName: 'Acme', email: 'a@acme.io' });
    const invoice = await createInvoice(session, {
      customerId: 'c-1',
      docNumber: 'PROP-1',
      lines: [{ description: 'Bookkeeping', amount: 102 }],
    });
    await createPayment(session, {
      customerId: 'c-1',
      invoiceId: invoice.Id!,
      amount: 102,
      depositAccountId: '35',
    });

    const customerBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(customerBody).toEqual({
      DisplayName: 'Acme',
      PrimaryEmailAddr: { Address: 'a@acme.io' },
    });

    const invoiceBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(fetchMock.mock.calls[1][0]).toContain('/v3/company/realm-1/invoice?minorversion=75');
    expect(invoiceBody.CustomerRef).toEqual({ value: 'c-1' });
    expect(invoiceBody.GlobalTaxCalculation).toBe('NotApplicable');
    expect(invoiceBody.DocNumber).toBe('PROP-1');
    expect(invoiceBody.Line).toEqual([
      {
        Amount: 102,
        Description: 'Bookkeeping',
        DetailType: 'SalesItemLineDetail',
        SalesItemLineDetail: { Qty: 1, UnitPrice: 102 },
      },
    ]);

    const paymentBody = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(paymentBody).toEqual({
      CustomerRef: { value: 'c-1' },
      TotalAmt: 102,
      DepositToAccountRef: { value: '35' },
      Line: [{ Amount: 102, LinkedTxn: [{ TxnId: 'i-1', TxnType: 'Invoice' }] }],
    });
  });

  it('throws with status + detail on API errors', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ Fault: { Error: [{ Message: 'Invalid account' }] } }, false, 400)
    );

    await expect(
      createInvoice(session, { customerId: 'c-1', lines: [{ description: 'x', amount: 1 }] })
    ).rejects.toThrow('failed (400)');
  });
});
