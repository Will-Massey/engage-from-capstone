const clientFindFirst = jest.fn();
const clientUpdate = jest.fn();

jest.mock('../../config/database.js', () => ({
  prisma: { client: { findFirst: clientFindFirst, update: clientUpdate } },
}));

const getCompanyDetails = jest.fn();

jest.mock('../companiesHouse.js', () => ({
  createCompaniesHouseService: () => ({
    getCompanyDetails,
    searchCompanies: jest.fn(),
    formatForClientCreation: (d: {
      company_number: string;
      company_name: string;
      company_status: string;
      accounts?: { accounting_reference_date?: { month: string; day: string } };
    }) => ({
      name: d.company_name,
      companyNumber: d.company_number,
      companyType: 'LIMITED_COMPANY',
      address: {
        line1: '1 High St',
        line2: '',
        city: '',
        postcode: 'AB1 2CD',
        country: 'United Kingdom',
      },
      yearEnd: d.accounts?.accounting_reference_date
        ? `${d.accounts.accounting_reference_date.month}-${d.accounts.accounting_reference_date.day}`
        : undefined,
      status: d.company_status,
    }),
  }),
}));

import type { CompanyDetails } from '../companiesHouse.js';
import {
  enrichClientFromCompaniesHouse,
  mapDetailsToAiContext,
  parseChDate,
} from '../companiesHouseEnrichment.js';

const CH_DETAILS: CompanyDetails = {
  company_number: '01234567',
  company_name: 'Acme Widgets Ltd',
  company_status: 'active',
  company_type: 'ltd',
  date_of_creation: '2015-02-01',
  registered_office_address: { address_line_1: '1 High St', postal_code: 'AB1 2CD' },
  sic_codes: ['62020'],
  accounts: {
    accounting_reference_date: { month: '03', day: '31' },
    next_due: '2026-12-31',
  },
  confirmation_statement: {
    next_due: '2026-09-14',
    last_made_up_to: '2025-08-31',
  },
};

const CLIENT_ROW = {
  id: 'c1',
  name: 'Acme Widgets Ltd',
  companyNumber: '01234567',
  yearEnd: '03-31',
  industry: 'IT',
  address: '{"line1":"1 High St"}',
  employeeCount: null,
  turnover: null,
  notes: null,
  nextAccountsDueDate: null,
  nextConfirmationStatementDue: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  clientFindFirst.mockResolvedValue(CLIENT_ROW);
  clientUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...CLIENT_ROW,
    ...data,
  }));
  getCompanyDetails.mockResolvedValue(CH_DETAILS);
});

describe('mapDetailsToAiContext', () => {
  it('parses confirmation_statement.next_due alongside accounts next_due', () => {
    const ctx = mapDetailsToAiContext(CH_DETAILS);
    expect(ctx.accountsNextDue).toBe('2026-12-31');
    expect(ctx.confirmationStatementNextDue).toBe('2026-09-14');
  });

  it('leaves the field undefined when CH omits the confirmation statement block', () => {
    const ctx = mapDetailsToAiContext({ ...CH_DETAILS, confirmation_statement: undefined });
    expect(ctx.confirmationStatementNextDue).toBeUndefined();
  });
});

describe('parseChDate', () => {
  it('parses YYYY-MM-DD at UTC noon', () => {
    expect(parseChDate('2026-09-14')?.toISOString()).toBe('2026-09-14T12:00:00.000Z');
  });

  it('rejects missing or malformed values', () => {
    expect(parseChDate(undefined)).toBeNull();
    expect(parseChDate('')).toBeNull();
    expect(parseChDate('14/09/2026')).toBeNull();
    expect(parseChDate('not a date')).toBeNull();
  });
});

describe('enrichClientFromCompaniesHouse compliance dates', () => {
  it('persists accounts next_due and confirmation statement next_due to the client', async () => {
    const result = await enrichClientFromCompaniesHouse('t1', 'c1', {});

    expect(result.enriched).toBe(true);
    expect(clientUpdate).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({
        nextAccountsDueDate: new Date('2026-12-31T12:00:00.000Z'),
        nextConfirmationStatementDue: new Date('2026-09-14T12:00:00.000Z'),
      }),
    });
  });

  it('refreshes the dates even when the client already has values (CH is authoritative)', async () => {
    clientFindFirst.mockResolvedValue({
      ...CLIENT_ROW,
      nextAccountsDueDate: new Date('2025-12-31T12:00:00.000Z'),
      nextConfirmationStatementDue: new Date('2025-09-14T12:00:00.000Z'),
    });

    await enrichClientFromCompaniesHouse('t1', 'c1', { fillMissingOnly: true });

    expect(clientUpdate).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({
        nextAccountsDueDate: new Date('2026-12-31T12:00:00.000Z'),
        nextConfirmationStatementDue: new Date('2026-09-14T12:00:00.000Z'),
      }),
    });
  });

  it('does not write date fields when CH provides none', async () => {
    getCompanyDetails.mockResolvedValue({
      ...CH_DETAILS,
      accounts: { accounting_reference_date: { month: '03', day: '31' } },
      confirmation_statement: undefined,
    });

    await enrichClientFromCompaniesHouse('t1', 'c1', {});

    expect(clientUpdate).not.toHaveBeenCalled();
  });
});
