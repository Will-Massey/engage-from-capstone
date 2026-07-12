import express from 'express';
import request from 'supertest';

// Mutable role so authz can be exercised per test
type Role = 'ADMIN' | 'PARTNER' | 'MD' | 'MANAGER' | 'SENIOR' | 'JUNIOR';
let currentRole: Role = 'ADMIN';

jest.mock('../../middleware/auth.js', () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const r = req as express.Request & { tenantId?: string; user?: unknown };
    r.tenantId = 't1';
    r.user = {
      id: 'u1',
      email: 'a@x.com',
      firstName: 'A',
      lastName: 'B',
      role: currentRole,
      tenantId: 't1',
    };
    next();
  },
  authorize:
    (...roles: string[]) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const role = (req as express.Request & { user?: { role?: string } }).user?.role;
      if (role && roles.includes(role)) return next();
      res.status(403).json({ success: false, error: { message: 'Forbidden' } });
    },
}));

const signalFindMany = jest.fn();
const signalFindFirst = jest.fn();
const signalUpdate = jest.fn();
const activityLogCreate = jest.fn();
const clientFindFirst = jest.fn();

jest.mock('../../config/database.js', () => ({
  prisma: {
    regulatorySignal: {
      findMany: signalFindMany,
      findFirst: signalFindFirst,
      update: signalUpdate,
    },
    activityLog: { create: activityLogCreate },
    client: { findFirst: clientFindFirst },
  },
}));

const scanTenantRegulatorySignals = jest.fn();
jest.mock('../../jobs/regulatoryScan.js', () => ({
  scanTenantRegulatorySignals: (...args: unknown[]) => scanTenantRegulatorySignals(...args),
}));

jest.mock('../../config/sentry.js', () => ({
  captureException: jest.fn(),
  initSentry: jest.fn(),
  Sentry: {},
}));

import regulatoryRoutes from '../regulatory.js';
import { errorHandler } from '../../middleware/errorHandler.js';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/regulatory', regulatoryRoutes);
  a.use(errorHandler);
  return a;
}

const SIGNAL_ROW = {
  id: 'a0000000-0000-4000-8000-000000000001',
  tenantId: 't1',
  clientId: 'b0000000-0000-4000-8000-000000000002',
  ruleId: 'vat-registration-required',
  family: 'vat',
  severity: 'action_required',
  title: 'VAT registration likely required',
  detail: 'Turnover exceeds threshold',
  metadata: '{}',
  status: 'OPEN',
  firstRaisedAt: new Date('2026-07-01T00:00:00.000Z'),
  lastEvaluatedAt: new Date('2026-07-11T00:00:00.000Z'),
  dismissedAt: null,
  dismissedByUserId: null,
  resolvedAt: null,
  client: { name: 'Acme Ltd' },
};

beforeEach(() => {
  jest.clearAllMocks();
  currentRole = 'ADMIN';
});

describe('GET /api/regulatory/signals', () => {
  it('lists tenant signals with client name', async () => {
    signalFindMany.mockResolvedValue([SIGNAL_ROW]);

    const res = await request(app()).get('/api/regulatory/signals');

    expect(res.status).toBe(200);
    expect(res.body.data.signals).toHaveLength(1);
    expect(res.body.data.signals[0]).toMatchObject({
      id: SIGNAL_ROW.id,
      clientName: 'Acme Ltd',
      ruleId: 'vat-registration-required',
      family: 'vat',
      status: 'OPEN',
    });
    expect(signalFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't1' } })
    );
  });

  it('filters by status and clientId', async () => {
    signalFindMany.mockResolvedValue([]);

    const res = await request(app()).get(
      `/api/regulatory/signals?status=OPEN&clientId=${SIGNAL_ROW.clientId}`
    );

    expect(res.status).toBe(200);
    expect(signalFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 't1', status: 'OPEN', clientId: SIGNAL_ROW.clientId },
      })
    );
  });

  it('rejects an invalid status value', async () => {
    const res = await request(app()).get('/api/regulatory/signals?status=BOGUS');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/regulatory/signals/:id/dismiss', () => {
  it('dismisses a signal and logs REGULATORY_SIGNAL_DISMISSED', async () => {
    signalFindFirst.mockResolvedValue(SIGNAL_ROW);
    signalUpdate.mockResolvedValue({
      ...SIGNAL_ROW,
      status: 'DISMISSED',
      dismissedAt: new Date(),
    });

    const res = await request(app())
      .post(`/api/regulatory/signals/${SIGNAL_ROW.id}/dismiss`)
      .send({ reason: 'Client handles VAT in-house' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('DISMISSED');
    expect(signalUpdate).toHaveBeenCalledWith({
      where: { id: SIGNAL_ROW.id },
      data: expect.objectContaining({ status: 'DISMISSED', dismissedByUserId: 'u1' }),
    });
    expect(activityLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'REGULATORY_SIGNAL_DISMISSED',
        entityType: 'CLIENT',
        entityId: SIGNAL_ROW.clientId,
        metadata: expect.stringContaining('Client handles VAT in-house'),
      }),
    });
  });

  it('is tenant-scoped and 404s on unknown signal', async () => {
    signalFindFirst.mockResolvedValue(null);

    const res = await request(app())
      .post(`/api/regulatory/signals/${SIGNAL_ROW.id}/dismiss`)
      .send({});

    expect(res.status).toBe(404);
    expect(signalFindFirst).toHaveBeenCalledWith({
      where: { id: SIGNAL_ROW.id, tenantId: 't1' },
    });
  });

  it('rejects reasons over 500 characters', async () => {
    const res = await request(app())
      .post(`/api/regulatory/signals/${SIGNAL_ROW.id}/dismiss`)
      .send({ reason: 'x'.repeat(501) });

    expect(res.status).toBe(400);
    expect(signalUpdate).not.toHaveBeenCalled();
  });

  it.each(['SENIOR', 'JUNIOR', 'MD'] as const)('denies %s role', async (role) => {
    currentRole = role;

    const res = await request(app())
      .post(`/api/regulatory/signals/${SIGNAL_ROW.id}/dismiss`)
      .send({});

    expect(res.status).toBe(403);
    expect(signalFindFirst).not.toHaveBeenCalled();
  });

  it.each(['ADMIN', 'PARTNER', 'MANAGER'] as const)('allows %s role', async (role) => {
    currentRole = role;
    signalFindFirst.mockResolvedValue(SIGNAL_ROW);
    signalUpdate.mockResolvedValue({ ...SIGNAL_ROW, status: 'DISMISSED' });

    const res = await request(app())
      .post(`/api/regulatory/signals/${SIGNAL_ROW.id}/dismiss`)
      .send({});

    expect(res.status).toBe(200);
  });
});

describe('POST /api/regulatory/scan', () => {
  it('runs the tenant scan on demand and returns the reconcile counts', async () => {
    scanTenantRegulatorySignals.mockResolvedValue({
      tenantId: 't1',
      clientsEvaluated: 4,
      raised: 2,
      resolved: 1,
      stillFiring: 3,
    });

    const res = await request(app()).post('/api/regulatory/scan').send({});

    expect(res.status).toBe(200);
    expect(scanTenantRegulatorySignals).toHaveBeenCalledWith('t1');
    expect(res.body.data).toMatchObject({ raised: 2, resolved: 1 });
    expect(res.body.message).toContain('4 client(s)');
  });

  it('denies junior roles', async () => {
    currentRole = 'JUNIOR';
    const res = await request(app()).post('/api/regulatory/scan').send({});
    expect(res.status).toBe(403);
    expect(scanTenantRegulatorySignals).not.toHaveBeenCalled();
  });
});
