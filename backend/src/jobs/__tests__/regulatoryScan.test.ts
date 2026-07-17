const clientFindMany = jest.fn();
const proposalFindMany = jest.fn();
const tenantFindMany = jest.fn();
const tenantFindUnique = jest.fn();
const signalFindMany = jest.fn();
const signalCreate = jest.fn();
const signalUpdate = jest.fn();
const activityLogCreate = jest.fn();

jest.mock('../../config/database.js', () => ({
  prisma: {
    client: { findMany: clientFindMany },
    proposal: { findMany: proposalFindMany },
    tenant: { findMany: tenantFindMany, findUnique: tenantFindUnique },
    regulatorySignal: {
      findMany: signalFindMany,
      create: signalCreate,
      update: signalUpdate,
    },
    activityLog: { create: activityLogCreate },
  },
}));

import { runRegulatoryScan, scanTenantRegulatorySignals } from '../regulatoryScan.js';

const NOW = new Date('2026-07-12T02:00:00.000Z');

/** LIMITED_COMPANY over the VAT threshold → fires exactly vat-registration-required. */
const FIRING_CLIENT = {
  id: 'c1',
  companyType: 'LIMITED_COMPANY',
  turnover: 120_000,
  mtditsaIncome: null,
  mtditsaStatus: 'NOT_REQUIRED',
  vatRegistered: false,
  employeeCount: null,
  nextVatDueDate: null,
  nextAccountsDueDate: null,
  nextConfirmationStatementDue: null,
};

const QUIET_CLIENT = { ...FIRING_CLIENT, turnover: 10_000 };

function existingSignal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sig1',
    tenantId: 't1',
    clientId: 'c1',
    ruleId: 'vat-registration-required',
    family: 'vat',
    severity: 'action_required',
    title: 'VAT registration likely required',
    detail: 'detail',
    metadata: '{}',
    status: 'OPEN',
    firstRaisedAt: new Date('2026-07-01T00:00:00.000Z'),
    lastEvaluatedAt: new Date('2026-07-01T00:00:00.000Z'),
    dismissedAt: null,
    dismissedByUserId: null,
    resolvedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  proposalFindMany.mockResolvedValue([]);
  signalFindMany.mockResolvedValue([]);
  signalCreate.mockResolvedValue({});
  signalUpdate.mockResolvedValue({});
  activityLogCreate.mockResolvedValue({});
});

describe('scanTenantRegulatorySignals reconciliation', () => {
  it('creates an OPEN signal and logs REGULATORY_SIGNAL_RAISED for a newly firing rule', async () => {
    clientFindMany.mockResolvedValue([FIRING_CLIENT]);

    const result = await scanTenantRegulatorySignals('t1', '{}', NOW);

    expect(result).toEqual({
      tenantId: 't1',
      clientsEvaluated: 1,
      raised: 1,
      resolved: 0,
      stillFiring: 0,
    });
    expect(signalCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 't1',
        clientId: 'c1',
        ruleId: 'vat-registration-required',
        family: 'vat',
        severity: 'action_required',
        status: 'OPEN',
        firstRaisedAt: NOW,
        lastEvaluatedAt: NOW,
      }),
    });
    expect(activityLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'REGULATORY_SIGNAL_RAISED',
        entityType: 'CLIENT',
        entityId: 'c1',
      }),
    });
  });

  it('bumps lastEvaluatedAt only when an OPEN signal is still firing', async () => {
    clientFindMany.mockResolvedValue([FIRING_CLIENT]);
    signalFindMany.mockResolvedValue([existingSignal()]);

    const result = await scanTenantRegulatorySignals('t1', '{}', NOW);

    expect(result.raised).toBe(0);
    expect(result.stillFiring).toBe(1);
    expect(signalCreate).not.toHaveBeenCalled();
    expect(signalUpdate).toHaveBeenCalledTimes(1);
    expect(signalUpdate).toHaveBeenCalledWith({
      where: { id: 'sig1' },
      data: { lastEvaluatedAt: NOW },
    });
    expect(activityLogCreate).not.toHaveBeenCalled();
  });

  it('resolves an OPEN signal whose rule no longer fires', async () => {
    clientFindMany.mockResolvedValue([QUIET_CLIENT]);
    signalFindMany.mockResolvedValue([existingSignal()]);

    const result = await scanTenantRegulatorySignals('t1', '{}', NOW);

    expect(result.resolved).toBe(1);
    expect(signalUpdate).toHaveBeenCalledWith({
      where: { id: 'sig1' },
      data: { status: 'RESOLVED', resolvedAt: NOW, lastEvaluatedAt: NOW },
    });
  });

  it('keeps a DISMISSED signal dismissed while the rule still fires', async () => {
    clientFindMany.mockResolvedValue([FIRING_CLIENT]);
    signalFindMany.mockResolvedValue([
      existingSignal({ status: 'DISMISSED', dismissedAt: new Date(), dismissedByUserId: 'u1' }),
    ]);

    await scanTenantRegulatorySignals('t1', '{}', NOW);

    expect(signalUpdate).toHaveBeenCalledWith({
      where: { id: 'sig1' },
      data: { lastEvaluatedAt: NOW },
    });
    expect(signalCreate).not.toHaveBeenCalled();
  });

  it('resolves a DISMISSED signal when the rule stops firing', async () => {
    clientFindMany.mockResolvedValue([QUIET_CLIENT]);
    signalFindMany.mockResolvedValue([existingSignal({ status: 'DISMISSED' })]);

    const result = await scanTenantRegulatorySignals('t1', '{}', NOW);

    expect(result.resolved).toBe(1);
    expect(signalUpdate).toHaveBeenCalledWith({
      where: { id: 'sig1' },
      data: { status: 'RESOLVED', resolvedAt: NOW, lastEvaluatedAt: NOW },
    });
  });

  it('reopens a RESOLVED signal as a fresh occurrence when the rule fires again', async () => {
    clientFindMany.mockResolvedValue([FIRING_CLIENT]);
    signalFindMany.mockResolvedValue([
      existingSignal({
        status: 'RESOLVED',
        resolvedAt: new Date('2026-07-05T00:00:00.000Z'),
        dismissedAt: new Date('2026-07-03T00:00:00.000Z'),
        dismissedByUserId: 'u1',
      }),
    ]);

    const result = await scanTenantRegulatorySignals('t1', '{}', NOW);

    expect(result.raised).toBe(1);
    expect(signalUpdate).toHaveBeenCalledWith({
      where: { id: 'sig1' },
      data: expect.objectContaining({
        status: 'OPEN',
        firstRaisedAt: NOW,
        lastEvaluatedAt: NOW,
        resolvedAt: null,
        dismissedAt: null,
        dismissedByUserId: null,
      }),
    });
    expect(activityLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'REGULATORY_SIGNAL_RAISED' }),
    });
  });

  it('leaves RESOLVED signals untouched when the rule stays quiet', async () => {
    clientFindMany.mockResolvedValue([QUIET_CLIENT]);
    signalFindMany.mockResolvedValue([existingSignal({ status: 'RESOLVED' })]);

    await scanTenantRegulatorySignals('t1', '{}', NOW);

    expect(signalUpdate).not.toHaveBeenCalled();
    expect(signalCreate).not.toHaveBeenCalled();
  });

  it('resolves open signals when the family is toggled off in tenant settings', async () => {
    clientFindMany.mockResolvedValue([FIRING_CLIENT]);
    signalFindMany.mockResolvedValue([existingSignal()]);

    const settingsJson = JSON.stringify({ regulatory: { vatEnabled: false } });
    const result = await scanTenantRegulatorySignals('t1', settingsJson, NOW);

    expect(result.raised).toBe(0);
    expect(result.resolved).toBe(1);
  });

  it('honours per-tenant threshold overrides', async () => {
    clientFindMany.mockResolvedValue([FIRING_CLIENT]);
    const settingsJson = JSON.stringify({ regulatory: { vatThreshold: 200_000 } });

    const result = await scanTenantRegulatorySignals('t1', settingsJson, NOW);

    expect(result.raised).toBe(0);
    expect(signalCreate).not.toHaveBeenCalled();
  });

  it('uses engaged services from accepted proposals to suppress gap rules', async () => {
    clientFindMany.mockResolvedValue([
      { ...QUIET_CLIENT, employeeCount: 4 },
      { ...QUIET_CLIENT, id: 'c2', employeeCount: 2 },
    ]);
    proposalFindMany.mockResolvedValue([
      {
        clientId: 'c1',
        services: [{ name: 'Monthly Payroll', serviceTemplate: { category: 'PAYROLL' } }],
      },
    ]);

    await scanTenantRegulatorySignals('t1', '{}', NOW);

    // c1 covered by payroll service; c2 has no coverage → one signal raised
    expect(signalCreate).toHaveBeenCalledTimes(1);
    expect(signalCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ clientId: 'c2', ruleId: 'payroll-no-service-gap' }),
    });
    // Batched: one client query + one accepted-proposal query per tenant
    expect(clientFindMany).toHaveBeenCalledTimes(1);
    expect(proposalFindMany).toHaveBeenCalledTimes(1);
  });

  it('fetches tenant settings when not supplied (on-demand scan path)', async () => {
    tenantFindUnique.mockResolvedValue({ settings: '{}' });
    clientFindMany.mockResolvedValue([]);

    await scanTenantRegulatorySignals('t1', undefined, NOW);

    expect(tenantFindUnique).toHaveBeenCalledWith({
      where: { id: 't1' },
      select: { settings: true },
    });
  });
});

describe('runRegulatoryScan', () => {
  it('scans every active tenant and aggregates totals', async () => {
    tenantFindMany.mockResolvedValue([
      { id: 't1', settings: '{}' },
      { id: 't2', settings: '{}' },
    ]);
    clientFindMany
      .mockResolvedValueOnce([FIRING_CLIENT])
      .mockResolvedValueOnce([{ ...QUIET_CLIENT, id: 'c9' }]);

    const totals = await runRegulatoryScan(NOW);

    expect(tenantFindMany).toHaveBeenCalledWith({
      where: { isActive: true },
      select: { id: true, settings: true },
    });
    expect(totals).toEqual({ tenants: 2, clientsEvaluated: 2, raised: 1, resolved: 0 });
  });

  it('continues with remaining tenants when one tenant scan throws', async () => {
    tenantFindMany.mockResolvedValue([
      { id: 't1', settings: '{}' },
      { id: 't2', settings: '{}' },
    ]);
    clientFindMany.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([FIRING_CLIENT]);

    const totals = await runRegulatoryScan(NOW);

    expect(totals.tenants).toBe(1);
    expect(totals.raised).toBe(1);
  });
});
