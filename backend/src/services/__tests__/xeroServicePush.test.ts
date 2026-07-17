/**
 * Regression-lock for pushAcceptedProposalToXero (R4.1): the exact
 * repeating-invoice payload construction must survive the sync-mode changes,
 * and paid_invoices mode (skipRepeatingInvoices) must never create them.
 */

import { RepeatingInvoice, Schedule, LineAmountTypes, CurrencyCode, Invoice } from 'xero-node';

jest.mock('../../config/database.js', () => ({ prisma: {} }));
jest.mock('../../config/logger.js', () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import {
  pushAcceptedProposalToXero,
  createXeroAccRecInvoice,
  createXeroPaymentForInvoice,
  type XeroSession,
} from '../xeroService.js';

const getContact = jest.fn();
const getContacts = jest.fn();
const updateOrCreateContacts = jest.fn();
const createContactHistory = jest.fn(async (..._args: any[]) => ({ body: {} }));
const createRepeatingInvoices = jest.fn();
const createInvoices = jest.fn();
const createPayment = jest.fn(async (..._args: any[]) => ({ body: {} }));

function session(settings: Record<string, unknown> = {}): XeroSession {
  return {
    client: {
      accountingApi: {
        getContact,
        getContacts,
        updateOrCreateContacts,
        createContactHistory,
        createRepeatingInvoices,
        createInvoices,
        createPayment,
      },
    } as unknown as XeroSession['client'],
    settings: {
      connected: true,
      xeroTenantId: 'xt1',
      refreshToken: 'r',
      connectedAt: new Date().toISOString(),
      ...settings,
    } as XeroSession['settings'],
    xeroTenantId: 'xt1',
  };
}

const proposal = {
  reference: 'PROP-42',
  title: 'Annual accounts + bookkeeping',
  acceptedAt: new Date('2026-07-01T00:00:00Z'),
  total: 1740,
  subtotal: 1450,
  vatAmount: 290,
  paymentFrequency: 'MONTHLY',
  client: { name: 'Acme Ltd', contactEmail: 'finance@acme.co.uk', contactName: 'Jo' },
  services: [
    {
      name: 'Bookkeeping',
      displayPrice: 85,
      billingFrequency: 'MONTHLY',
      lineTotal: 85,
      vatAmount: 17,
    },
    {
      name: 'VAT returns',
      displayPrice: 40,
      billingFrequency: 'QUARTERLY',
      lineTotal: 40,
      vatAmount: 8,
    },
    {
      name: 'Onboarding',
      displayPrice: 600,
      billingFrequency: 'ONE_TIME',
      lineTotal: 600,
      vatAmount: 120,
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  // Email search finds an existing contact.
  getContacts.mockResolvedValue({
    body: { contacts: [{ contactID: 'c-1', emailAddress: 'finance@acme.co.uk' }] },
  });
  createRepeatingInvoices.mockResolvedValue({
    body: { repeatingInvoices: [{ repeatingInvoiceID: 'ri-1' }] },
  });
});

describe('pushAcceptedProposalToXero — repeating_draft (existing behaviour)', () => {
  it('creates one DRAFT repeating invoice per billing frequency with the exact payload', async () => {
    const result = await pushAcceptedProposalToXero(session(), proposal);

    expect(createRepeatingInvoices).toHaveBeenCalledTimes(2);
    const [tenantArg, payload, summarizeErrors] = createRepeatingInvoices.mock.calls[0];
    expect(tenantArg).toBe('xt1');
    expect(summarizeErrors).toBe(true);

    const draft = payload.repeatingInvoices[0];
    expect(draft).toEqual({
      type: RepeatingInvoice.TypeEnum.ACCREC,
      contact: { contactID: 'c-1' },
      schedule: {
        period: 1,
        unit: Schedule.UnitEnum.MONTHLY,
        dueDate: 20,
        dueDateType: Schedule.DueDateTypeEnum.OFFOLLOWINGMONTH,
        startDate: new Date().toISOString().slice(0, 10),
      },
      lineItems: [
        {
          description: 'Bookkeeping',
          quantity: 1,
          unitAmount: 85,
          accountCode: '200',
          taxAmount: 17,
        },
      ],
      lineAmountTypes: LineAmountTypes.Exclusive,
      status: RepeatingInvoice.StatusEnum.DRAFT,
      reference: 'PROP-42 (MONTHLY)',
      currencyCode: CurrencyCode.GBP,
    });

    const quarterly = createRepeatingInvoices.mock.calls[1][1].repeatingInvoices[0];
    expect(quarterly.schedule.period).toBe(3);
    expect(quarterly.schedule.unit).toBe(Schedule.UnitEnum.MONTHLY);
    expect(quarterly.reference).toBe('PROP-42 (QUARTERLY)');

    expect(result.repeatingInvoice.created).toBe(2);
    expect(result.repeatingInvoice.repeatingInvoiceIds).toEqual(['ri-1', 'ri-1']);
    // One-off lines are flagged, not silently dropped.
    expect(result.repeatingInvoice.errors.join(' ')).toContain('one-off service line');
  });

  it('writes the contact history note', async () => {
    await pushAcceptedProposalToXero(session(), proposal);

    expect(createContactHistory).toHaveBeenCalledTimes(1);
    const [, contactId, history] = createContactHistory.mock.calls[0];
    expect(contactId).toBe('c-1');
    expect(history.historyRecords[0].details).toContain('[Engage] Accepted proposal PROP-42');
    expect(history.historyRecords[0].details).toContain('Synced from Engage by Capstone');
  });

  it('uses the tenant default revenue account code when configured', async () => {
    await pushAcceptedProposalToXero(session({ defaultRevenueAccountCode: '4000' }), proposal);
    const draft = createRepeatingInvoices.mock.calls[0][1].repeatingInvoices[0];
    expect(draft.lineItems[0].accountCode).toBe('4000');
  });

  it('returns stub drafts without API calls when no session', async () => {
    const result = await pushAcceptedProposalToXero(null, proposal);
    expect(result.repeatingInvoice.stub).toBe(true);
    expect(result.repeatingInvoice.drafts).toHaveLength(2);
    expect(createRepeatingInvoices).not.toHaveBeenCalled();
    expect(createContactHistory).not.toHaveBeenCalled();
  });
});

describe('pushAcceptedProposalToXero — paid_invoices (skipRepeatingInvoices)', () => {
  it('still syncs contact + note but never creates repeating invoices', async () => {
    const result = await pushAcceptedProposalToXero(session(), proposal, {
      skipRepeatingInvoices: true,
    });

    expect(createContactHistory).toHaveBeenCalledTimes(1);
    expect(createRepeatingInvoices).not.toHaveBeenCalled();
    expect(result.contactNote.updated).toBe(true);
    expect(result.repeatingInvoice.created).toBe(0);
    expect(result.repeatingInvoice.message).toContain('paid-invoices sync mode');
  });
});

describe('createXeroAccRecInvoice', () => {
  it('creates an AUTHORISED ACCREC invoice with the Stripe reference', async () => {
    createInvoices.mockResolvedValue({ body: { invoices: [{ invoiceID: 'inv-1' }] } });

    const id = await createXeroAccRecInvoice(session(), {
      contactId: 'c-1',
      reference: 'in_stripe_123',
      lines: [
        { description: 'Bookkeeping', unitAmount: 85, taxAmount: 17 },
        { description: 'Fallback', unitAmount: 120, taxAmount: 0, taxType: 'NONE' },
      ],
    });

    expect(id).toBe('inv-1');
    const [tenantArg, payload, summarizeErrors] = createInvoices.mock.calls[0];
    expect(tenantArg).toBe('xt1');
    expect(summarizeErrors).toBe(true);
    const invoice = payload.invoices[0];
    expect(invoice.type).toBe(Invoice.TypeEnum.ACCREC);
    expect(invoice.status).toBe(Invoice.StatusEnum.AUTHORISED);
    expect(invoice.reference).toBe('in_stripe_123');
    expect(invoice.currencyCode).toBe(CurrencyCode.GBP);
    expect(invoice.lineAmountTypes).toBe(LineAmountTypes.Exclusive);
    expect(invoice.lineItems).toEqual([
      {
        description: 'Bookkeeping',
        quantity: 1,
        unitAmount: 85,
        accountCode: '200',
        taxAmount: 17,
      },
      {
        description: 'Fallback',
        quantity: 1,
        unitAmount: 120,
        accountCode: '200',
        taxAmount: 0,
        taxType: 'NONE',
      },
    ]);
  });

  it('throws with validation detail when Xero returns no invoice ID', async () => {
    createInvoices.mockResolvedValue({
      body: { invoices: [{ validationErrors: [{ message: 'Account code is invalid' }] }] },
    });

    await expect(
      createXeroAccRecInvoice(session(), {
        contactId: 'c-1',
        reference: 'in_x',
        lines: [{ description: 'x', unitAmount: 1 }],
      })
    ).rejects.toThrow('Account code is invalid');
  });
});

describe('createXeroPaymentForInvoice', () => {
  it('applies a payment against the given account code', async () => {
    await createXeroPaymentForInvoice(session(), {
      invoiceId: 'inv-1',
      accountCode: '090',
      amount: 102,
    });

    const [tenantArg, payment] = createPayment.mock.calls[0];
    expect(tenantArg).toBe('xt1');
    expect(payment).toEqual({
      invoice: { invoiceID: 'inv-1' },
      account: { code: '090' },
      amount: 102,
      date: new Date().toISOString().slice(0, 10),
    });
  });
});
