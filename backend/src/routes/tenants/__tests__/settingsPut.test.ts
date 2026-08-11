/**
 * PUT /api/tenants/settings — `notifications` is no longer part of the
 * schema (backend never reads it to fire anything — see Settings.tsx UX
 * audit). It must be silently dropped from the request rather than
 * erroring, and any value already stored on the tenant must be left
 * untouched (no migration to strip it).
 */
import express from 'express';
import request from 'supertest';

jest.mock('../../../middleware/auth.js', () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const r = req as express.Request & { tenantId?: string; user?: unknown };
    r.tenantId = 't1';
    r.user = {
      id: 'u1',
      email: 'a@x.com',
      firstName: 'A',
      lastName: 'B',
      role: 'ADMIN',
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

const tenantFindUnique = jest.fn();
const tenantUpdate = jest.fn();
const activityLogCreate = jest.fn();

jest.mock('../../../config/database.js', () => ({
  prisma: {
    tenant: { findUnique: tenantFindUnique, update: tenantUpdate },
    activityLog: { create: activityLogCreate },
  },
}));

jest.mock('../../../services/proposalTermsService.js', () => ({
  previewEngageDefaultTermsForTenant: jest.fn(),
  getEngageDefaultTermsTemplate: jest.fn(),
}));

jest.mock('../../../services/integrationEvents.js', () => ({
  sendTestIntegrationWebhook: jest.fn(),
}));

jest.mock('../../../utils/tenantLogoConstraints.js', () => ({
  validateTenantLogoForStorage: (logo: string) => ({ ok: true, logo }),
}));

import settingsRoutes from '../settings.js';
import { errorHandler } from '../../../middleware/errorHandler.js';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/tenants', settingsRoutes);
  a.use(errorHandler);
  return a;
}

beforeEach(() => {
  jest.clearAllMocks();
  tenantUpdate.mockResolvedValue({
    vatRegistered: true,
    vatNumber: '',
    defaultVatRate: 'STANDARD_20',
    autoApplyVat: true,
    name: 'Acme',
    logo: null,
    primaryColor: '#000',
    secondaryColor: '#111',
  });
});

describe('PUT /api/tenants/settings — notifications is dead', () => {
  it('drops an unknown "notifications" key instead of erroring, and does not persist it', async () => {
    tenantFindUnique.mockResolvedValue({ settings: JSON.stringify({}) });

    const res = await request(app())
      .put('/api/tenants/settings')
      .send({ notifications: { proposalAccepted: false } });

    expect(res.status).toBe(200);
    const persisted = JSON.parse(tenantUpdate.mock.calls[0][0].data.settings);
    expect(persisted.notifications).toBeUndefined();
  });

  it('leaves an already-stored notifications value untouched (no strip migration)', async () => {
    tenantFindUnique.mockResolvedValue({
      settings: JSON.stringify({ notifications: { weeklySummary: true } }),
    });

    const res = await request(app())
      .put('/api/tenants/settings')
      .send({ proposals: { defaultExpiryDays: 45 } });

    expect(res.status).toBe(200);
    const persisted = JSON.parse(tenantUpdate.mock.calls[0][0].data.settings);
    expect(persisted.notifications).toEqual({ weeklySummary: true });
  });
});
