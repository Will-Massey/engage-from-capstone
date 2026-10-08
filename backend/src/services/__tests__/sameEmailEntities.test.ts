/**
 * One contact email, several companies: creation is allowed, acceptance and
 * the portal stay on the token, and Stripe does not reuse another entity's customer.
 */

const clientFindMany = jest.fn();
const clientUpdate = jest.fn(async () => ({}));
const proposalFindFirst = jest.fn();
const customersSearch = jest.fn();
const customersCreate = jest.fn();

jest.mock('../../config/database.js', () => ({
  prisma: {
    client: { findMany: clientFindMany, update: clientUpdate, findFirst: jest.fn() },
    proposal: { findFirst: proposalFindFirst },
  },
}));

jest.mock('../../config/stripe.js', () => ({
  stripe: {
    customers: {
      search: (...args: unknown[]) => customersSearch(...args),
      create: (...args: unknown[]) => customersCreate(...args),
    },
  },
}));

jest.mock('../../config/logger.js', () => ({
  __esModule: true,
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

import {
  chooseStripeCustomerStrategy,
  findSameEntity,
  pickAccountingContactId,
  selectUniqueClientMatch,
} from '../clientIdentity.js';
import { resolveStripeCustomerForCheckout } from '../stripeClientCustomer.js';
import { getClientByPortalToken, getProposalByShareToken } from '../proposalSharingService.js';

const michaela = 'michaela@example.com';

describe('same email, several entities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('treats a second legal name as a new client even when the email matches', () => {
    const existing = [
      {
        id: 'trading',
        name: 'Michaela Trading Ltd',
        contactEmail: michaela,
        companyNumber: '11111111',
      },
    ];

    expect(
      findSameEntity(existing, {
        name: 'Michaela Holdings Ltd',
        companyNumber: '22222222',
      })
    ).toBeNull();

    expect(
      findSameEntity(existing, {
        name: 'Michaela Trading Ltd',
        companyNumber: '11111111',
      })?.reason
    ).toBe('duplicate_company_number');
  });

  it('does not match an accounting contact on email alone', () => {
    expect(
      pickAccountingContactId({
        clientName: 'Michaela Holdings Ltd',
        email: michaela,
        emailMatches: [{ id: 'xero-trading', name: 'Michaela Trading Ltd', email: michaela }],
        nameMatches: [],
      })
    ).toBeUndefined();

    expect(
      pickAccountingContactId({
        clientName: 'Michaela Holdings Ltd',
        email: michaela,
        nameMatches: [{ id: 'xero-holdings', name: 'Michaela Holdings Ltd' }],
        emailMatches: [{ id: 'xero-trading', name: 'Michaela Trading Ltd', email: michaela }],
      })
    ).toBe('xero-holdings');
  });

  it('links inbound mail only when a single client owns the email', () => {
    expect(selectUniqueClientMatch([{ id: 'only' }])?.id).toBe('only');
    expect(selectUniqueClientMatch([{ id: 'trading' }, { id: 'holdings' }])).toBeNull();
  });

  it('keeps Stripe customer_email for the original quote and a dedicated customer for the next company', () => {
    const peers = [
      { id: 'trading', createdAt: new Date('2026-01-01'), stripeCustomerId: null },
      { id: 'holdings', createdAt: new Date('2026-06-01'), stripeCustomerId: null },
    ];

    expect(
      chooseStripeCustomerStrategy({ clientId: 'trading', contactEmail: michaela, peers })
    ).toEqual({ mode: 'legacy_email', customerEmail: michaela });

    expect(
      chooseStripeCustomerStrategy({ clientId: 'holdings', contactEmail: michaela, peers })
    ).toEqual({ mode: 'dedicated' });

    expect(
      chooseStripeCustomerStrategy({
        clientId: 'holdings',
        contactEmail: michaela,
        peers: [{ ...peers[1], stripeCustomerId: 'cus_holdings' }],
      })
    ).toEqual({ mode: 'stored', customerId: 'cus_holdings' });
  });

  it('creates a Stripe customer by Engage client id, not by searching email', async () => {
    clientFindMany.mockResolvedValue([
      { id: 'trading', createdAt: new Date('2026-01-01'), stripeCustomerId: null },
      { id: 'holdings', createdAt: new Date('2026-06-01'), stripeCustomerId: null },
    ]);
    customersSearch.mockResolvedValue({ data: [] });
    customersCreate.mockResolvedValue({ id: 'cus_holdings' });

    const result = await resolveStripeCustomerForCheckout({
      clientId: 'holdings',
      tenantId: 'fortis',
      contactEmail: michaela,
      clientName: 'Michaela Holdings Ltd',
      companyNumber: '22222222',
    });

    expect(result).toEqual({ customerId: 'cus_holdings' });
    expect(customersSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining("metadata['engageClientId']:'holdings'"),
      })
    );
    expect(customersCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        email: michaela,
        name: 'Michaela Holdings Ltd',
        metadata: expect.objectContaining({ engageClientId: 'holdings', tenantId: 'fortis' }),
      })
    );
    const searchQuery = String(customersSearch.mock.calls[0][0].query);
    expect(searchQuery).not.toContain(michaela);
  });

  it('leaves the original quote on customer_email so its checkout is unchanged', async () => {
    clientFindMany.mockResolvedValue([
      { id: 'trading', createdAt: new Date('2026-01-01'), stripeCustomerId: null },
    ]);

    const result = await resolveStripeCustomerForCheckout({
      clientId: 'trading',
      tenantId: 'fortis',
      contactEmail: michaela,
      clientName: 'Michaela Trading Ltd',
      companyNumber: '11111111',
    });

    expect(result).toEqual({ customerEmail: michaela });
    expect(customersCreate).not.toHaveBeenCalled();
    expect(customersSearch).not.toHaveBeenCalled();
  });

  it('loads a quote for acceptance by share token, not by signer email', async () => {
    proposalFindFirst.mockResolvedValue({ id: 'proposal-holdings', reference: 'PROP-2' });

    const proposal = await getProposalByShareToken('share-token-holdings');

    expect(proposal?.id).toBe('proposal-holdings');
    expect(proposalFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ shareToken: 'share-token-holdings' }),
      })
    );
    const where = proposalFindFirst.mock.calls[0][0].where;
    expect(JSON.stringify(where)).not.toContain('contactEmail');
    expect(JSON.stringify(where)).not.toContain(michaela);
  });

  it('opens the client portal by token so two companies do not share a login', async () => {
    const clientFindFirst = jest.requireMock('../../config/database.js').prisma.client
      .findFirst as jest.Mock;
    clientFindFirst.mockResolvedValue({
      id: 'holdings',
      name: 'Michaela Holdings Ltd',
      contactEmail: michaela,
    });

    const client = await getClientByPortalToken('portal-token-holdings');

    expect(client?.id).toBe('holdings');
    expect(clientFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ portalToken: 'portal-token-holdings' }),
      })
    );
    const where = clientFindFirst.mock.calls[0][0].where;
    expect(where.contactEmail).toBeUndefined();
  });
});
