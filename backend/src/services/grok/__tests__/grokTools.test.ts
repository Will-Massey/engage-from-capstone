jest.mock('../../../config/database.js', () => {
  const prisma = {
    client: { count: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    proposal: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    proposalService: { create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    proposalSignature: { count: jest.fn() },
    paymentSplit: { count: jest.fn() },
    serviceTemplate: { count: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    tenant: { findUnique: jest.fn() },
    grokConnectorAudit: { create: jest.fn() },
    activityLog: { create: jest.fn() },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
    fn(prisma)
  );
  return { prisma };
});

import { prisma as prismaModule } from '../../../config/database.js';

const prisma = prismaModule as any;

jest.mock('../../proposalTermsService.js', () => ({
  resolveProposalTerms: jest.fn(async () => 'Standard terms'),
}));

import { callGrokTool, listGrokToolsForProtocol, type GrokToolContext } from '../grokTools';
import { draftOnlyMessage } from '../grokDraft';

const ctx: GrokToolContext = {
  tenantId: 't1',
  tenantName: 'Marks and Co',
  userId: 'u1',
  userName: 'Caroline Marks',
  tokenId: 'tok1',
  scopes: new Set(['read', 'draft_proposals']),
};

function line(overrides: Record<string, unknown> = {}) {
  return {
    id: 'l1',
    serviceTemplateId: 's1',
    name: 'Monthly bookkeeping',
    description: 'Books',
    billingFrequency: 'MONTHLY',
    priceDisplayMode: 'PER_MONTH',
    quantity: 1,
    discountPercent: 0,
    frequency: 'MONTHLY',
    vatRate: 20,
    displayPricePence: 15000,
    unitPricePence: 15000,
    annualEquivalentPence: 180000,
    lineTotalPence: 15000,
    vatAmountPence: 3000,
    grossTotalPence: 18000,
    oneOffDueDate: null,
    hourlyBillingMode: null,
    sortOrder: 0,
    ...overrides,
  };
}

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    reference: 'PROP-1',
    title: 'Draft',
    status: 'DRAFT',
    approvalStatus: 'NONE',
    notes: 'Keep',
    coverLetter: null,
    proposalSummary: null,
    terms: 'Standard terms',
    paymentTerms: '7 days',
    paymentFrequency: 'MONTHLY',
    validUntil: new Date('2026-12-26T00:00:00Z'),
    contractStartDate: null,
    subtotalPence: 15000,
    vatAmountPence: 3000,
    totalPence: 18000,
    createdAt: new Date('2026-11-26T00:00:00Z'),
    updatedAt: new Date('2026-11-26T00:00:00Z'),
    client: {
      id: 'c1',
      name: 'Acme Ltd',
      contactName: 'Ada',
      contactEmail: 'ada@acme.test',
      companyType: 'LIMITED_COMPANY',
      companyNumber: '12345678',
    },
    services: [line()],
    createdBy: { id: 'u1', firstName: 'Caroline', lastName: 'Marks' },
    ...overrides,
  };
}

const catalogue = {
  id: 's1',
  name: 'Monthly bookkeeping',
  description: 'Books',
  category: 'BOOKKEEPING',
  subcategory: null,
  priceAmount: 150,
  basePrice: 150,
  billingCycle: 'MONTHLY',
  defaultFrequency: 'MONTHLY',
  priceDisplayMode: 'PER_MONTH',
  frequencyOptions: 'MONTHLY',
  vatRate: 'STANDARD_20',
  isVatApplicable: true,
  isActive: true,
  isPopular: false,
  tags: '',
};

beforeEach(() => {
  jest.clearAllMocks();
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
    fn(prisma)
  );
  prisma.$queryRaw.mockResolvedValue([
    {
      id: 'p1',
      status: 'DRAFT',
      signature: null,
      acceptedAt: null,
      acceptedBy: null,
      acceptedByIp: null,
      signatoryPosition: null,
      termsAccepted: false,
      termsAcceptedAt: null,
      acceptanceNotifiedAt: null,
      engagementLetterAccepted: false,
      engagementLetterAcceptedAt: null,
      paymentId: null,
      paymentMandateId: null,
      paymentProvider: null,
      paymentStatus: null,
      paymentUrl: null,
      paymentMethod: null,
      paidAt: null,
      paymentFailureReason: null,
      stripeSubscriptionId: null,
      paymentAuthAccepted: false,
      paymentAuthAcceptedAt: null,
      paymentAuthVersion: null,
    },
  ]);
  prisma.proposalSignature.count.mockResolvedValue(0);
  prisma.paymentSplit.count.mockResolvedValue(0);
});

describe('connector tool list', () => {
  it('exposes the draft tools and no send, email, or sign tool', () => {
    const names = listGrokToolsForProtocol().map((tool) => tool.name);
    expect(names).toEqual([
      'engage_list_clients',
      'engage_list_proposals',
      'engage_get_proposal',
      'engage_list_services',
      'engage_create_draft_proposal',
      'engage_add_draft_line',
      'engage_update_draft_line',
      'engage_remove_draft_line',
      'engage_update_draft_notes',
      'engage_revert_to_draft',
      'engage_create_revision_draft',
    ]);
    for (const name of names) {
      expect(name).not.toMatch(/send|email|sign|accept/i);
    }
    const reads = listGrokToolsForProtocol().filter((tool) => tool.annotations.readOnlyHint);
    expect(reads.map((tool) => tool.name)).toEqual([
      'engage_list_clients',
      'engage_list_proposals',
      'engage_get_proposal',
      'engage_list_services',
    ]);
  });
});

describe('read tools do not write', () => {
  it('lists clients, proposals, services, and one proposal without writes', async () => {
    prisma.client.count.mockResolvedValue(1);
    prisma.client.findMany.mockResolvedValue([
      {
        id: 'c1',
        name: 'Acme Ltd',
        contactName: 'Ada',
        contactEmail: 'ada@acme.test',
        companyNumber: '123',
        companyType: 'LIMITED_COMPANY',
        isActive: true,
      },
    ]);
    prisma.proposal.count.mockResolvedValue(1);
    prisma.proposal.findMany.mockResolvedValue([
      {
        id: 'p1',
        reference: 'PROP-1',
        title: 'Draft',
        status: 'DRAFT',
        totalPence: 18000,
        validUntil: new Date('2026-12-26T00:00:00Z'),
        updatedAt: new Date('2026-11-26T00:00:00Z'),
        client: { id: 'c1', name: 'Acme Ltd' },
      },
    ]);
    prisma.proposal.findFirst.mockResolvedValue(proposal());
    prisma.serviceTemplate.count.mockResolvedValue(1);
    prisma.serviceTemplate.findMany.mockResolvedValue([catalogue]);

    const clients = await callGrokTool('engage_list_clients', {}, ctx);
    const proposals = await callGrokTool('engage_list_proposals', { status: 'DRAFT' }, ctx);
    const services = await callGrokTool('engage_list_services', {}, ctx);
    const one = await callGrokTool('engage_get_proposal', { proposal_id: 'p1' }, ctx);

    expect(clients.ok && clients.data).toMatchObject({ items: [{ name: 'Acme Ltd' }] });
    expect(proposals.ok && (proposals.data as any).items[0].gross_gbp).toBe(180);
    expect(services.ok && (services.data as any).items[0]).toMatchObject({
      price_gbp: 150,
      billing_frequency: 'MONTHLY',
      vat_rate: 20,
    });
    expect(one.ok && (one.data as any).services[0].id).toBe('l1');
    expect(one.ok && (one.data as any).notes).toBe('Keep');
    expect(JSON.stringify(one.ok ? one.data : {})).not.toMatch(/shareToken|signature/i);

    expect(prisma.proposal.create).not.toHaveBeenCalled();
    expect(prisma.proposal.update).not.toHaveBeenCalled();
    expect(prisma.proposalService.create).not.toHaveBeenCalled();
    expect(prisma.proposalService.update).not.toHaveBeenCalled();
    expect(prisma.proposalService.delete).not.toHaveBeenCalled();
    expect(prisma.grokConnectorAudit.create).not.toHaveBeenCalled();
    expect(prisma.activityLog.create).not.toHaveBeenCalled();
    expect(prisma.client.findMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.anything() })
    );
  });
});

describe('engage_create_draft_proposal', () => {
  it('stores a draft using the catalogue price and line VAT', async () => {
    prisma.client.findFirst.mockResolvedValue({ id: 'c1', name: 'Acme Ltd', tenantId: 't1' });
    prisma.serviceTemplate.findMany.mockResolvedValue([
      { ...catalogue, priceAmount: 100, basePrice: 100 },
    ]);
    prisma.tenant.findUnique.mockResolvedValue({ settings: '{}' });
    prisma.proposal.create.mockResolvedValue({ id: 'p1', reference: 'PROP-X' });
    prisma.proposal.findFirst.mockResolvedValue(
      proposal({
        services: [
          line({
            displayPricePence: 10000,
            quantity: 2,
            lineTotalPence: 20000,
            vatAmountPence: 4000,
            grossTotalPence: 24000,
          }),
        ],
      })
    );

    const result = await callGrokTool(
      'engage_create_draft_proposal',
      { client_id: 'c1', lines: [{ service_id: 's1', quantity: 2 }] },
      ctx
    );
    expect(result.ok).toBe(true);
    const created = prisma.proposal.create.mock.calls[0][0].data;
    expect(created.status).toBe('DRAFT');
    expect(created.createdById).toBe('u1');
    expect(created.services.create[0]).toMatchObject({
      lineTotalPence: 20000,
      vatAmountPence: 4000,
      grossTotalPence: 24000,
      billingFrequency: 'MONTHLY',
    });
    expect(created).not.toHaveProperty('sentAt');
    expect(prisma.grokConnectorAudit.create).toHaveBeenCalled();
    const audit = prisma.grokConnectorAudit.create.mock.calls[0][0].data;
    expect(audit.userId).toBe('u1');
    expect(audit.proposalId).toBe('p1');
    expect(audit.summary).toMatch(/Created draft/);
  });
});

describe('engage_update_draft_line', () => {
  it('recalculates a quarterly fee from the real line engine', async () => {
    prisma.proposal.findFirst.mockResolvedValue(proposal());
    const result = await callGrokTool(
      'engage_update_draft_line',
      {
        proposal_id: 'p1',
        line_id: 'l1',
        display_price_gbp: 180,
        billing_frequency: 'QUARTERLY',
      },
      ctx
    );
    expect(result.ok).toBe(true);
    expect(prisma.proposalService.update.mock.calls[0][0].data).toMatchObject({
      displayPricePence: 18000,
      billingFrequency: 'QUARTERLY',
      lineTotalPence: 18000,
      vatAmountPence: 3600,
      grossTotalPence: 21600,
      annualEquivalentPence: 72000,
    });
    expect(prisma.proposal.update.mock.calls[0][0].data).toMatchObject({
      subtotalPence: 18000,
      vatAmountPence: 3600,
      totalPence: 21600,
    });
    expect(prisma.proposal.update.mock.calls[0][0].data.status).toBeUndefined();
  });

  it('prices a one-off hourly block as rate times hours', async () => {
    prisma.proposal.findFirst.mockResolvedValue(proposal());
    const result = await callGrokTool(
      'engage_update_draft_line',
      {
        proposal_id: 'p1',
        line_id: 'l1',
        display_price_gbp: 75,
        billing_frequency: 'HOURLY',
        quantity: 4,
        hourly_billing_mode: 'ONE_OFF',
      },
      ctx
    );
    expect(result.ok).toBe(true);
    expect(prisma.proposalService.update.mock.calls[0][0].data).toMatchObject({
      billingFrequency: 'HOURLY',
      hourlyBillingMode: 'ONE_OFF',
      quantity: 4,
      lineTotalPence: 30000,
      vatAmountPence: 6000,
      grossTotalPence: 36000,
      annualEquivalentPence: 7500,
    });
  });

  it('annualises monthly-actual hourly on the unit rate, and nets rate times hours', async () => {
    prisma.proposal.findFirst.mockResolvedValue(proposal());
    const result = await callGrokTool(
      'engage_update_draft_line',
      {
        proposal_id: 'p1',
        line_id: 'l1',
        display_price_gbp: 75,
        billing_frequency: 'HOURLY',
        quantity: 4,
        hourly_billing_mode: 'MONTHLY_ACTUAL',
      },
      ctx
    );
    expect(result.ok).toBe(true);
    expect(prisma.proposalService.update.mock.calls[0][0].data).toMatchObject({
      hourlyBillingMode: 'MONTHLY_ACTUAL',
      lineTotalPence: 30000,
      annualEquivalentPence: 90000,
    });
  });
});

describe('draft guards', () => {
  const writes: Array<[string, Record<string, unknown>]> = [
    ['engage_add_draft_line', { proposal_id: 'p1', service_id: 's1' }],
    ['engage_update_draft_line', { proposal_id: 'p1', line_id: 'l1', display_price_gbp: 10 }],
    ['engage_remove_draft_line', { proposal_id: 'p1', line_id: 'l1' }],
    ['engage_update_draft_notes', { proposal_id: 'p1', notes: 'no' }],
  ];

  it.each(writes)('refuses %s when the proposal is not a draft', async (name, args) => {
    prisma.proposal.findFirst.mockResolvedValue(proposal({ status: 'SENT' }));
    const result = await callGrokTool(name, args, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(draftOnlyMessage('SENT'));
    expect(prisma.proposal.update).not.toHaveBeenCalled();
    expect(prisma.proposalService.update).not.toHaveBeenCalled();
    expect(prisma.proposalService.delete).not.toHaveBeenCalled();
    expect(prisma.grokConnectorAudit.create).not.toHaveBeenCalled();
  });

  it('refuses a status field', async () => {
    prisma.proposal.findFirst.mockResolvedValue(proposal());
    const result = await callGrokTool(
      'engage_update_draft_notes',
      { proposal_id: 'p1', notes: 'Hi', status: 'SENT' },
      ctx
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Unexpected field "status"/);
    expect(prisma.proposal.update).not.toHaveBeenCalled();
  });

  it('refuses a write when the token is read only', async () => {
    const result = await callGrokTool(
      'engage_update_draft_notes',
      { proposal_id: 'p1', notes: 'x' },
      {
        ...ctx,
        scopes: new Set(['read']),
      }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/cannot change proposals/);
    expect(prisma.proposal.findFirst).not.toHaveBeenCalled();
  });
});

describe('engage_add_draft_line and engage_remove_draft_line and notes', () => {
  it('adds a line and writes an audit row', async () => {
    prisma.proposal.findFirst.mockResolvedValue(proposal({ services: [] }));
    prisma.serviceTemplate.findFirst.mockResolvedValue(catalogue);
    prisma.proposalService.create.mockResolvedValue({ id: 'l2' });
    const result = await callGrokTool(
      'engage_add_draft_line',
      { proposal_id: 'p1', service_id: 's1' },
      ctx
    );
    expect(result.ok).toBe(true);
    expect(prisma.proposalService.create.mock.calls[0][0].data).toMatchObject({
      displayPricePence: 15000,
      lineTotalPence: 15000,
      vatAmountPence: 3000,
      proposalId: 'p1',
    });
    expect(prisma.grokConnectorAudit.create).toHaveBeenCalled();
  });

  it('removes a line and zeros the header when it was the last one', async () => {
    prisma.proposal.findFirst.mockResolvedValue(proposal());
    const result = await callGrokTool(
      'engage_remove_draft_line',
      { proposal_id: 'p1', line_id: 'l1' },
      ctx
    );
    expect(result.ok).toBe(true);
    expect(prisma.proposalService.delete).toHaveBeenCalledWith({ where: { id: 'l1' } });
    expect(prisma.proposal.update.mock.calls[0][0].data).toMatchObject({
      subtotalPence: 0,
      vatAmountPence: 0,
      totalPence: 0,
    });
  });

  it('replaces draft notes', async () => {
    prisma.proposal.findFirst.mockResolvedValue(proposal());
    const result = await callGrokTool(
      'engage_update_draft_notes',
      { proposal_id: 'p1', notes: 'Call before year end' },
      ctx
    );
    expect(result.ok).toBe(true);
    expect(prisma.proposal.update.mock.calls[0][0].data).toEqual({ notes: 'Call before year end' });
    const audit = prisma.grokConnectorAudit.create.mock.calls[0][0].data;
    expect(audit.tool).toBe('engage_update_draft_notes');
    expect(JSON.parse(audit.changes)).toMatchObject({
      before: 'Keep',
      after: 'Call before year end',
    });
  });
});

describe('unknown tool', () => {
  it('does not invent a send tool', async () => {
    const result = await callGrokTool('engage_send_proposal', { proposal_id: 'p1' }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Unknown tool/);
  });
});
