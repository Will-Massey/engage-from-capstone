/**
 * POST /api/aml/manual-clear — recording AML completion on the practice's own
 * evidence.
 *
 * The only other route to CLEAR is a provider webhook, and no provider is live,
 * so a client entering AML_PENDING when its proposal was accepted stayed there
 * permanently. This must mirror the webhook's transition exactly, and must
 * record who asserted clearance and on what basis.
 */
import express from 'express';
import request from 'supertest';

jest.mock('../../middleware/auth.js', () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const r = req as express.Request & { tenantId?: string; user?: unknown };
    r.tenantId = 't1';
    r.user = {
      id: 'u1',
      email: 'a@x.com',
      firstName: 'A',
      lastName: 'B',
      role: 'PARTNER',
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

const clientFindFirst = jest.fn();
const clientUpdate = jest.fn();
const activityLogCreate = jest.fn();

jest.mock('../../config/database.js', () => ({
  prisma: {
    client: { findFirst: clientFindFirst, update: clientUpdate },
    activityLog: { create: activityLogCreate },
  },
}));

jest.mock('../../services/amlService.js', () => ({
  initiateAmlCheck: jest.fn(),
  getAmlStatusForClient: jest.fn(),
  processAmlWebhook: jest.fn(),
  getAmlPartnerConfig: jest.fn(() => ({ partnerConfigured: false })),
}));

jest.mock('../../services/aml/amlUsageService.js', () => ({ getAmlUsage: jest.fn() }));
jest.mock('../../services/fileStorage.js', () => ({ readAmlDocument: jest.fn() }));
jest.mock('../../services/aml/amlDocuments.js', () => ({ resolveAmlDocumentPath: jest.fn() }));
jest.mock('../../config/sentry.js', () => ({
  captureException: jest.fn(),
  initSentry: jest.fn(),
  Sentry: {},
}));

import amlRoutes from '../aml.js';
import { errorHandler } from '../../middleware/errorHandler.js';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/aml', amlRoutes);
  a.use(errorHandler);
  return a;
}

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';

const pendingClient = {
  id: CLIENT_ID,
  name: 'Swain Building & Maintenance Ltd',
  amlStatus: 'NOT_STARTED',
  lifecycleStage: 'AML_PENDING',
};

beforeEach(() => {
  clientFindFirst.mockReset();
  clientUpdate
    .mockReset()
    .mockImplementation(({ data }) => Promise.resolve({ id: CLIENT_ID, ...data }));
  activityLogCreate.mockReset().mockResolvedValue({});
});

describe('POST /api/aml/manual-clear', () => {
  it('clears AML and moves the client off AML_PENDING, with an audit row', async () => {
    clientFindFirst.mockResolvedValue(pendingClient);

    const res = await request(app())
      .post('/api/aml/manual-clear')
      .send({ clientId: CLIENT_ID, basis: 'DOCUMENTS_VERIFIED' });

    expect(res.status).toBe(200);
    expect(clientUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amlStatus: 'CLEAR',
          lifecycleStage: 'AML_COMPLETE',
          amlCompletedAt: expect.any(Date),
        }),
      })
    );
    expect(activityLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'AML_MANUALLY_CLEARED', userId: 'u1' }),
      })
    );
  });

  it('leaves a lifecycle stage alone when the client was not AML_PENDING', async () => {
    clientFindFirst.mockResolvedValue({ ...pendingClient, lifecycleStage: 'PROSPECT' });

    const res = await request(app())
      .post('/api/aml/manual-clear')
      .send({ clientId: CLIENT_ID, basis: 'EXISTING_CLIENT' });

    expect(res.status).toBe(200);
    expect(clientUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lifecycleStage: 'PROSPECT' }) })
    );
  });

  it('requires a note when the basis is Other', async () => {
    clientFindFirst.mockResolvedValue(pendingClient);

    const res = await request(app())
      .post('/api/aml/manual-clear')
      .send({ clientId: CLIENT_ID, basis: 'OTHER' });

    expect(res.status).toBe(400);
    expect(clientUpdate).not.toHaveBeenCalled();
  });

  it('rejects an unrecognised basis', async () => {
    const res = await request(app())
      .post('/api/aml/manual-clear')
      .send({ clientId: CLIENT_ID, basis: 'BECAUSE_I_SAID_SO' });

    expect(res.status).toBe(400);
    expect(clientUpdate).not.toHaveBeenCalled();
  });

  it('refuses a client already recorded as clear', async () => {
    clientFindFirst.mockResolvedValue({ ...pendingClient, amlStatus: 'CLEAR' });

    const res = await request(app())
      .post('/api/aml/manual-clear')
      .send({ clientId: CLIENT_ID, basis: 'DOCUMENTS_VERIFIED' });

    expect(res.status).toBe(400);
    expect(clientUpdate).not.toHaveBeenCalled();
  });

  it('404s outside the tenant', async () => {
    clientFindFirst.mockResolvedValue(null);

    const res = await request(app())
      .post('/api/aml/manual-clear')
      .send({ clientId: CLIENT_ID, basis: 'DOCUMENTS_VERIFIED' });

    expect(res.status).toBe(404);
    expect(clientUpdate).not.toHaveBeenCalled();
  });

  it('records a REFER result being overridden, keeping the previous status', async () => {
    clientFindFirst.mockResolvedValue({ ...pendingClient, amlStatus: 'REFER' });

    const res = await request(app())
      .post('/api/aml/manual-clear')
      .send({ clientId: CLIENT_ID, basis: 'EXTERNAL_CHECK', note: 'Passport seen in person' });

    expect(res.status).toBe(200);
    const logged = activityLogCreate.mock.calls[0][0].data;
    expect(JSON.parse(logged.metadata)).toEqual(
      expect.objectContaining({ previousAmlStatus: 'REFER', basis: 'EXTERNAL_CHECK' })
    );
  });
});
