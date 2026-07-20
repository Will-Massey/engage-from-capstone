/**
 * GET /api/aml/documents/:clientId/:type — practice-facing AML document viewer.
 * Tenant-scoped, role-gated, streams bytes from storage, logs a view. Paths are
 * resolved server-side from Client.amlSubmissionData; no user path input.
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
const activityLogCreate = jest.fn();
const readAmlDocument = jest.fn();

jest.mock('../../config/database.js', () => ({
  prisma: {
    client: { findFirst: clientFindFirst },
    activityLog: { create: activityLogCreate },
  },
}));

jest.mock('../../services/fileStorage.js', () => ({
  readAmlDocument: (...a: unknown[]) => readAmlDocument(...a),
  saveAmlDocument: jest.fn(),
}));

jest.mock('../../services/amlService.js', () => ({
  getAmlStatusForClient: jest.fn(),
  getAmlPartnerConfig: jest.fn(() => ({})),
  initiateAmlCheck: jest.fn(),
  processAmlWebhook: jest.fn(),
}));

jest.mock('../../services/aml/amlUsageService.js', () => ({ getAmlUsage: jest.fn() }));
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

const submission = JSON.stringify({
  photoIdDocument: {
    relativePath: 'aml-documents/t1/c1/photo_id_1_passport.png',
    fileName: 'passport.png',
    mimeType: 'image/png',
    sizeBytes: 3,
    uploadedAt: '2026-07-19T20:44:10.000Z',
  },
});

beforeEach(() => {
  clientFindFirst.mockReset();
  activityLogCreate.mockReset().mockResolvedValue({});
  readAmlDocument.mockReset().mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e]));
});

describe('GET /api/aml/documents/:clientId/:type', () => {
  it('streams the document bytes with content type and logs a view', async () => {
    clientFindFirst.mockResolvedValue({ id: 'c1', amlSubmissionData: submission });

    const res = await request(app()).get('/api/aml/documents/c1/photo_id');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.headers['content-disposition']).toContain('inline');
    expect(readAmlDocument).toHaveBeenCalledWith('aml-documents/t1/c1/photo_id_1_passport.png');
    expect(activityLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'CLIENT_AML_DOCUMENT_VIEWED', entityId: 'c1' }),
      })
    );
  });

  it('rejects an invalid document type', async () => {
    const res = await request(app()).get('/api/aml/documents/c1/passport');
    expect(res.status).toBe(400);
    expect(clientFindFirst).not.toHaveBeenCalled();
  });

  it('404s when the client is not in the tenant', async () => {
    clientFindFirst.mockResolvedValue(null);
    const res = await request(app()).get('/api/aml/documents/c1/photo_id');
    expect(res.status).toBe(404);
    expect(readAmlDocument).not.toHaveBeenCalled();
  });

  it('404s when the requested document was not submitted', async () => {
    clientFindFirst.mockResolvedValue({ id: 'c1', amlSubmissionData: submission });
    const res = await request(app()).get('/api/aml/documents/c1/proof_of_address');
    expect(res.status).toBe(404);
    expect(readAmlDocument).not.toHaveBeenCalled();
  });
});
