import express from 'express';
import request from 'supertest';

jest.mock('../../src/middleware/auth.js', () => {
  const actual = jest.requireActual('../../src/middleware/auth.js');
  return {
    ...actual,
    authenticate: (req: any, _res: any, next: any) => {
      req.user = {
        id: 'user-1',
        email: 'partner@test.dev',
        role: 'PARTNER',
        firstName: 'Test',
        lastName: 'Partner',
      };
      req.tenantId = 'tenant-1';
      next();
    },
  };
});

const saveTenantXeroSettings = jest.fn();
const clearTenantXeroSettings = jest.fn();

jest.mock('../../src/services/tenantXeroSettings.js', () => ({
  getTenantXeroSettings: jest.fn(),
  saveTenantXeroSettings,
  clearTenantXeroSettings,
  xeroStatusFromSettings: jest.fn(),
  isXeroOAuthConfigured: jest.fn(() => false),
  getXeroPublicConfig: jest.fn(() => ({})),
}));

jest.mock('../../src/config/database.js', () => {
  const model = new Proxy({}, { get: () => () => Promise.resolve(null) });
  return { prisma: new Proxy({}, { get: () => model }) };
});

import xeroRouter from '../../src/routes/xero.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/xero', xeroRouter);
  app.use(errorHandler);
  return app;
}

describe('POST /xero/mock-connect', () => {
  const app = buildApp();

  it('rejects without X-Test-Mode header', async () => {
    const res = await request(app).post('/xero/mock-connect');
    expect(res.status).toBe(403);
    expect(saveTenantXeroSettings).not.toHaveBeenCalled();
  });

  it('persists stub settings when e2e header is present', async () => {
    const res = await request(app).post('/xero/mock-connect').set('X-Test-Mode', 'e2e-build');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(saveTenantXeroSettings).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        connected: true,
        xeroTenantId: 'e2e-xero-tenant',
      })
    );
  });
});
