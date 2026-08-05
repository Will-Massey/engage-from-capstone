/**
 * Scheduled automations: document_request.stale trigger (drafts excluded),
 * tenant-scoped cooldown ledger, and the per-tenant opt-in gate.
 */
const prismaMock = {
  tenant: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  job: { findMany: jest.fn() },
  proposal: { findMany: jest.fn() },
  jobPhase: { findMany: jest.fn() },
  documentRequest: { findMany: jest.fn() },
  activityLog: { create: jest.fn(), createMany: jest.fn(), findFirst: jest.fn() },
};

jest.mock('../../config/database.js', () => ({ prisma: prismaMock }));

const resendMock = jest.fn();
jest.mock('../documentRequestService.js', () => ({
  resendDocumentRequest: (...args: unknown[]) => resendMock(...args),
}));

import { runAutomationRules } from '../automationRulesService.js';
import { runScheduledAutomations } from '../../jobs/automationRunJob.js';

const RULE = {
  id: 'r1',
  trigger: 'document_request.stale',
  action: 'resend_document_request',
  enabled: true,
};

function tenantWithRules(rules: unknown[]) {
  return { settings: JSON.stringify({ automationRules: rules }), name: 'Smith & Co' };
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.activityLog.create.mockResolvedValue({});
  prismaMock.activityLog.findFirst.mockResolvedValue(null);
  resendMock.mockResolvedValue({ id: 'req1' });
});

describe('document_request.stale trigger', () => {
  it('resends stale sent requests and excludes drafts via sentCount filter', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(tenantWithRules([RULE]));
    prismaMock.documentRequest.findMany.mockResolvedValue([
      { id: 'req1', title: 'Year-end records', client: { name: 'Acme' } },
    ]);

    const { results } = await runAutomationRules('t1', {});

    expect(prismaMock.documentRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 't1',
          status: 'OPEN',
          sentCount: { gte: 1 },
          lastSentAt: expect.objectContaining({ lte: expect.any(Date) }),
        }),
      })
    );
    expect(resendMock).toHaveBeenCalledWith({ tenantId: 't1', requestId: 'req1' });
    expect(results[0]).toMatchObject({ matched: 1, acted: 1, skippedCooldown: 0 });
  });

  it('dry-run reports without resending', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(tenantWithRules([RULE]));
    prismaMock.documentRequest.findMany.mockResolvedValue([
      { id: 'req1', title: 'Year-end records', client: { name: 'Acme' } },
    ]);

    const { results } = await runAutomationRules('t1', { dryRun: true });

    expect(resendMock).not.toHaveBeenCalled();
    expect(results[0].details[0]).toContain('Would resend');
  });
});

describe('cooldown ledger', () => {
  it('skips a (rule, entity) pair that acted within the window — tenant-scoped lookup', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(tenantWithRules([RULE]));
    prismaMock.documentRequest.findMany.mockResolvedValue([
      { id: 'req1', title: 'Year-end records', client: { name: 'Acme' } },
    ]);
    prismaMock.activityLog.findFirst.mockResolvedValue({ id: 'ledger1' });

    const { results } = await runAutomationRules('t1', { cooldownDays: 3 });

    expect(resendMock).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({ acted: 0, skippedCooldown: 1 });
    expect(prismaMock.activityLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 't1',
          action: 'AUTOMATION_RULE_ACTED',
          entityId: 'r1:req1',
        }),
      })
    );
  });

  it('writes a ledger row after acting when cooldown is active', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(tenantWithRules([RULE]));
    prismaMock.documentRequest.findMany.mockResolvedValue([
      { id: 'req1', title: 'Year-end records', client: { name: 'Acme' } },
    ]);

    await runAutomationRules('t1', { cooldownDays: 3 });

    expect(prismaMock.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'AUTOMATION_RULE_ACTED',
          entityId: 'r1:req1',
          tenantId: 't1',
        }),
      })
    );
  });

  it('manual runs (no cooldownDays) never touch the ledger', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(tenantWithRules([RULE]));
    prismaMock.documentRequest.findMany.mockResolvedValue([
      { id: 'req1', title: 'Year-end records', client: { name: 'Acme' } },
    ]);

    await runAutomationRules('t1', {});

    expect(prismaMock.activityLog.findFirst).not.toHaveBeenCalled();
    const ledgerWrites = prismaMock.activityLog.create.mock.calls.filter(
      (c) => c[0]?.data?.action === 'AUTOMATION_RULE_ACTED'
    );
    expect(ledgerWrites).toHaveLength(0);
  });
});

describe('runScheduledAutomations opt-in gate', () => {
  it('only queries tenants that opted into daily runs and writes a summary row each', async () => {
    prismaMock.tenant.findMany.mockResolvedValue([{ id: 't1', name: 'Smith & Co' }]);
    prismaMock.tenant.findUnique.mockResolvedValue(tenantWithRules([RULE]));
    prismaMock.documentRequest.findMany.mockResolvedValue([]);

    const out = await runScheduledAutomations();

    expect(prismaMock.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          settings: { contains: '"automationSchedule":"daily"' },
        }),
      })
    );
    expect(out).toEqual({ tenantsRun: 1, totalActed: 0 });
    expect(prismaMock.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'AUTOMATION_SCHEDULED_RUN',
          tenantId: 't1',
        }),
      })
    );
  });

  it('runs nothing when no tenant opted in', async () => {
    prismaMock.tenant.findMany.mockResolvedValue([]);
    const out = await runScheduledAutomations();
    expect(out).toEqual({ tenantsRun: 0, totalActed: 0 });
    expect(prismaMock.tenant.findUnique).not.toHaveBeenCalled();
  });
});
