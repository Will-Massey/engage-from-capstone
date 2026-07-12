/**
 * R4.1 — acceptance trigger gating, ActivityLog idempotency (+force), and
 * paid_invoices mode routing for the Xero proposal push.
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
const saveTenantXeroSettings = jest.fn(async (..._args: unknown[]) => undefined);
const isXeroOAuthConfigured = jest.fn(() => true);

jest.mock('../../services/tenantXeroSettings.js', () => ({
  getTenantXeroSettings: (...args: unknown[]) => getTenantXeroSettings(...args),
  saveTenantXeroSettings: (...args: unknown[]) => saveTenantXeroSettings(...args),
  isXeroOAuthConfigured: () => isXeroOAuthConfigured(),
}));

const getAuthenticatedXeroSession = jest.fn(async (..._args: unknown[]) => ({ session: true }));
const pushAcceptedProposalToXero = jest.fn();

jest.mock('../../services/xeroService.js', () => ({
  getAuthenticatedXeroSession: (...args: unknown[]) => getAuthenticatedXeroSession(...args),
  pushAcceptedProposalToXero: (...args: unknown[]) => pushAcceptedProposalToXero(...args),
}));

import {
  pushProposalToXero,
  triggerXeroPushOnAcceptance,
  XERO_PROPOSAL_PUSHED_ACTION,
} from '../xeroProposalPush.js';

const dbProposal = {
  id: 'p1',
  reference: 'PROP-42',
  title: 'Annual accounts',
  status: 'ACCEPTED',
  acceptedAt: new Date(),
  total: 120,
  subtotal: 100,
  vatAmount: 20,
  paymentFrequency: 'MONTHLY',
  client: { name: 'Acme', contactEmail: 'a@acme.io', contactName: null, tags: 'xero:c-9' },
  services: [
    {
      name: 'Bookkeeping',
      displayPrice: 100,
      billingFrequency: 'MONTHLY',
      lineTotal: 100,
      vatAmount: 20,
    },
  ],
};

const connectedSettings = {
  connected: true,
  xeroTenantId: 'xt1',
  refreshToken: 'r',
  connectedAt: new Date().toISOString(),
};

const liveResult = {
  contactNote: { implemented: true, contactId: 'c-9', updated: true },
  repeatingInvoice: {
    implemented: true,
    stub: false,
    created: 1,
    repeatingInvoiceIds: ['ri-1'],
    drafts: [{}],
    errors: [],
    message: 'Created 1 repeating invoice template(s) in Xero.',
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  isXeroOAuthConfigured.mockReturnValue(true);
  proposalFindFirst.mockResolvedValue(dbProposal);
  activityFindFirst.mockResolvedValue(null);
  getTenantXeroSettings.mockResolvedValue(connectedSettings);
  pushAcceptedProposalToXero.mockResolvedValue(liveResult);
});

describe('pushProposalToXero idempotency', () => {
  it('pushes and writes a XERO_PROPOSAL_PUSHED success record', async () => {
    const result = await pushProposalToXero('t1', 'p1');

    expect(result.mode).toBe('live');
    expect(result.skipped).toBeUndefined();
    expect(pushAcceptedProposalToXero).toHaveBeenCalledWith(
      { session: true },
      expect.objectContaining({ reference: 'PROP-42' }),
      { skipRepeatingInvoices: false }
    );
    expect(activityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: XERO_PROPOSAL_PUSHED_ACTION,
          proposalId: 'p1',
          metadata: expect.stringContaining('"repeatingInvoiceIds":["ri-1"]'),
        }),
      })
    );
  });

  it('skips when a prior success record exists', async () => {
    activityFindFirst.mockResolvedValue({
      createdAt: new Date('2026-07-01T10:00:00Z'),
      metadata: JSON.stringify({ repeatingInvoiceIds: ['ri-1'] }),
    });

    const result = await pushProposalToXero('t1', 'p1');

    expect(result.skipped).toBe(true);
    expect(result.xero.repeatingInvoice.repeatingInvoiceIds).toEqual(['ri-1']);
    expect(result.xero.repeatingInvoice.message).toContain('Already pushed');
    expect(pushAcceptedProposalToXero).not.toHaveBeenCalled();
    expect(activityCreate).not.toHaveBeenCalled();
  });

  it('force overrides the prior success record', async () => {
    activityFindFirst.mockResolvedValue({
      createdAt: new Date(),
      metadata: JSON.stringify({ repeatingInvoiceIds: ['ri-1'] }),
    });

    const result = await pushProposalToXero('t1', 'p1', { force: true });

    expect(result.skipped).toBeUndefined();
    expect(activityFindFirst).not.toHaveBeenCalled(); // force skips the lookup
    expect(pushAcceptedProposalToXero).toHaveBeenCalled();
  });

  it('does not write a success record for a push that created nothing', async () => {
    pushAcceptedProposalToXero.mockResolvedValue({
      ...liveResult,
      contactNote: { implemented: true, updated: false },
      repeatingInvoice: { ...liveResult.repeatingInvoice, created: 0, repeatingInvoiceIds: [] },
    });

    await pushProposalToXero('t1', 'p1');
    expect(activityCreate).not.toHaveBeenCalled();
  });
});

describe('pushProposalToXero paid_invoices mode', () => {
  it('passes skipRepeatingInvoices and records success off the contact note', async () => {
    getTenantXeroSettings.mockResolvedValue({
      ...connectedSettings,
      xeroSyncMode: 'paid_invoices',
    });
    pushAcceptedProposalToXero.mockResolvedValue({
      contactNote: { implemented: true, contactId: 'c-9', updated: true },
      repeatingInvoice: { ...liveResult.repeatingInvoice, created: 0, repeatingInvoiceIds: [] },
    });

    await pushProposalToXero('t1', 'p1');

    expect(pushAcceptedProposalToXero).toHaveBeenCalledWith({ session: true }, expect.anything(), {
      skipRepeatingInvoices: true,
    });
    expect(activityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: XERO_PROPOSAL_PUSHED_ACTION,
          metadata: expect.stringContaining('"syncMode":"paid_invoices"'),
        }),
      })
    );
  });
});

describe('pushProposalToXero guards', () => {
  it('rejects non-accepted proposals', async () => {
    proposalFindFirst.mockResolvedValue({ ...dbProposal, status: 'SENT' });
    await expect(pushProposalToXero('t1', 'p1')).rejects.toThrow('Only accepted proposals');
  });

  it('returns stub mode when the tenant is not connected', async () => {
    getTenantXeroSettings.mockResolvedValue(null);
    pushAcceptedProposalToXero.mockResolvedValue({
      contactNote: { implemented: false, updated: false },
      repeatingInvoice: { ...liveResult.repeatingInvoice, stub: true, created: 0 },
    });

    const result = await pushProposalToXero('t1', 'p1');
    expect(result.mode).toBe('stub');
    expect(pushAcceptedProposalToXero).toHaveBeenCalledWith(null, expect.anything());
  });
});

describe('triggerXeroPushOnAcceptance gating', () => {
  it('does nothing when Xero OAuth is not configured', async () => {
    isXeroOAuthConfigured.mockReturnValue(false);
    await triggerXeroPushOnAcceptance('t1', 'p1');
    expect(getTenantXeroSettings).not.toHaveBeenCalled();
    expect(pushAcceptedProposalToXero).not.toHaveBeenCalled();
  });

  it('does nothing when the tenant is not connected', async () => {
    getTenantXeroSettings.mockResolvedValue(null);
    await triggerXeroPushOnAcceptance('t1', 'p1');
    expect(pushAcceptedProposalToXero).not.toHaveBeenCalled();
  });

  it('does nothing when autoPushOnAcceptance is disabled', async () => {
    getTenantXeroSettings.mockResolvedValue({ ...connectedSettings, autoPushOnAcceptance: false });
    await triggerXeroPushOnAcceptance('t1', 'p1');
    expect(pushAcceptedProposalToXero).not.toHaveBeenCalled();
  });

  it('pushes when connected with auto-push left at its default (true)', async () => {
    await triggerXeroPushOnAcceptance('t1', 'p1');
    expect(pushAcceptedProposalToXero).toHaveBeenCalled();
  });

  it('never throws, even when the push fails', async () => {
    pushAcceptedProposalToXero.mockRejectedValue(new Error('xero down'));
    await expect(triggerXeroPushOnAcceptance('t1', 'p1')).resolves.toBeUndefined();
  });
});
