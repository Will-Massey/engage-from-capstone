/**
 * Role-gate regression tests for the 2026-07-07 security audit (M1/M3):
 * tenant-wide settings, email config, service catalog mutations, and the
 * staff proposal accept route must reject roles below MANAGER (or SENIOR
 * for proposal lifecycle) with 403.
 */
import express from 'express';
import request from 'supertest';

jest.mock('../src/middleware/auth.js', () => {
  const actual = jest.requireActual('../src/middleware/auth.js');
  return {
    ...actual,
    // Bypass JWT verification: take the role from a test header so the real
    // authorize() middleware is exercised.
    authenticate: (req: any, _res: any, next: any) => {
      req.user = {
        id: 'user-1',
        email: 'user@test.dev',
        role: req.headers['x-test-role'] || 'JUNIOR',
        firstName: 'Test',
        lastName: 'User',
      };
      req.tenantId = 'tenant-1';
      next();
    },
  };
});

// Stub prisma so allowed-role requests never hit a database: every model
// method resolves to null (handlers then 404/500 — anything but 401/403).
jest.mock('../src/config/database.js', () => {
  const model = new Proxy({}, { get: () => () => Promise.resolve(null) });
  return { prisma: new Proxy({}, { get: () => model }) };
});

import tenantSettingsRouter from '../src/routes/tenants/settings.js';
import emailRouter from '../src/routes/email.js';
import servicesNewRouter from '../src/routes/services-new.js';
import lifecycleRouter from '../src/routes/proposals/lifecycle.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

function buildApp(router: express.Router): express.Express {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/', router);
  app.use(errorHandler);
  return app;
}

const settingsApp = buildApp(tenantSettingsRouter);
const emailApp = buildApp(emailRouter);
const servicesApp = buildApp(servicesNewRouter);
const lifecycleApp = buildApp(lifecycleRouter);

interface RouteCase {
  name: string;
  app: express.Express;
  method: 'get' | 'put' | 'post' | 'delete';
  path: string;
  body?: Record<string, unknown>;
  deniedRoles: string[];
  allowedRole: string;
}

const cases: RouteCase[] = [
  {
    name: 'PUT /api/tenants/settings',
    app: settingsApp,
    method: 'put',
    path: '/settings',
    body: {},
    deniedRoles: ['JUNIOR', 'SENIOR'],
    allowedRole: 'MANAGER',
  },
  {
    name: 'PUT /api/email/reply-to',
    app: emailApp,
    method: 'put',
    path: '/reply-to',
    body: { replyToEmail: 'reply@test.dev' },
    deniedRoles: ['JUNIOR', 'SENIOR'],
    allowedRole: 'MANAGER',
  },
  {
    name: 'PUT /api/email/config',
    app: emailApp,
    method: 'put',
    path: '/config',
    body: { provider: 'smtp', fromName: 'Test', fromEmail: 'from@test.dev' },
    deniedRoles: ['JUNIOR', 'SENIOR'],
    allowedRole: 'MANAGER',
  },
  {
    name: 'DELETE /api/email/config',
    app: emailApp,
    method: 'delete',
    path: '/config',
    deniedRoles: ['JUNIOR', 'SENIOR'],
    allowedRole: 'MANAGER',
  },
  {
    name: 'POST /api/email/auth/gmail/exchange',
    app: emailApp,
    method: 'post',
    path: '/auth/gmail/exchange',
    // Invalid body on purpose: allowed roles must reach zod (400), not 403.
    body: {},
    deniedRoles: ['JUNIOR', 'SENIOR'],
    allowedRole: 'MANAGER',
  },
  {
    name: 'POST /api/email/auth/microsoft/exchange',
    app: emailApp,
    method: 'post',
    path: '/auth/microsoft/exchange',
    body: {},
    deniedRoles: ['JUNIOR', 'SENIOR'],
    allowedRole: 'MANAGER',
  },
  {
    name: 'POST /api/email/auth/:provider/callback',
    app: emailApp,
    method: 'post',
    path: '/auth/gmail/callback',
    body: {},
    deniedRoles: ['JUNIOR', 'SENIOR'],
    allowedRole: 'MANAGER',
  },
  {
    name: 'POST /api/email/auth/:provider/disconnect',
    app: emailApp,
    method: 'post',
    path: '/auth/gmail/disconnect',
    deniedRoles: ['JUNIOR', 'SENIOR'],
    allowedRole: 'MANAGER',
  },
  {
    name: 'POST /api/services-new/import-from-catalog',
    app: servicesApp,
    method: 'post',
    path: '/import-from-catalog',
    body: {},
    deniedRoles: ['JUNIOR', 'SENIOR'],
    allowedRole: 'MANAGER',
  },
  {
    name: 'POST /api/services-new/bulk-import-catalog',
    app: servicesApp,
    method: 'post',
    path: '/bulk-import-catalog',
    body: {},
    deniedRoles: ['JUNIOR', 'SENIOR'],
    allowedRole: 'MANAGER',
  },
  {
    name: 'PUT /api/services-new/:id/billing-vat',
    app: servicesApp,
    method: 'put',
    path: '/service-1/billing-vat',
    body: {},
    deniedRoles: ['JUNIOR', 'SENIOR'],
    allowedRole: 'MANAGER',
  },
  {
    name: 'POST /api/proposals/:id/accept',
    app: lifecycleApp,
    method: 'post',
    path: '/proposal-1/accept',
    body: { signature: 'x'.repeat(120) },
    deniedRoles: ['JUNIOR'],
    allowedRole: 'SENIOR',
  },
];

describe('security hardening — role gates (M1/M3)', () => {
  describe.each(cases)('$name', ({ app, method, path, body, deniedRoles, allowedRole }) => {
    it.each(deniedRoles)('rejects %s with 403', async (role) => {
      const res = await (request(app) as any)
        [method](path)
        .set('X-Test-Role', role)
        .send(body ?? {});
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it(`does not 401/403 for ${allowedRole}`, async () => {
      const res = await (request(app) as any)
        [method](path)
        .set('X-Test-Role', allowedRole)
        .send(body ?? {});
      expect([401, 403]).not.toContain(res.status);
    });
  });
});
