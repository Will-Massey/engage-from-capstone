/**
 * POST /api/forms/templates — payload validation and role gate. Field ids must
 * be unique within a template (duplicate ids would collide in portal answers
 * and response rendering), and only management roles may write templates.
 */
import express from 'express';
import request from 'supertest';

let currentRole: 'MANAGER' | 'SENIOR' = 'MANAGER';

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

const tenantFindUnique = jest.fn();
const tenantUpdate = jest.fn();

jest.mock('../../config/database.js', () => ({
  prisma: {
    tenant: { findUnique: tenantFindUnique, update: tenantUpdate },
    activityLog: { findMany: jest.fn(), create: jest.fn() },
    client: { findMany: jest.fn() },
  },
}));

import formsRoutes from '../forms.js';
import { errorHandler } from '../../middleware/errorHandler.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/forms', formsRoutes);
  app.use(errorHandler);
  return app;
}

const field = (id: string) => ({ id, type: 'text', label: `Field ${id}` });

beforeEach(() => {
  jest.clearAllMocks();
  currentRole = 'MANAGER';
  tenantFindUnique.mockResolvedValue({
    settings: JSON.stringify({ practiceForms: { templates: [] } }),
  });
  tenantUpdate.mockResolvedValue({});
});

describe('POST /api/forms/templates', () => {
  it('rejects duplicate field ids with 400', async () => {
    const res = await request(makeApp())
      .post('/api/forms/templates')
      .send({ name: 'Dup pack', fields: [field('q1'), field('q1')] });
    expect(res.status).toBe(400);
    expect(tenantUpdate).not.toHaveBeenCalled();
  });

  it('accepts unique field ids with 201', async () => {
    const res = await request(makeApp())
      .post('/api/forms/templates')
      .send({ name: 'Good pack', fields: [field('q1'), field('q2')] });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Good pack');
  });

  it('rejects non-management roles with 403', async () => {
    currentRole = 'SENIOR';
    const res = await request(makeApp())
      .post('/api/forms/templates')
      .send({ name: 'Nope', fields: [field('q1')] });
    expect(res.status).toBe(403);
  });
});
