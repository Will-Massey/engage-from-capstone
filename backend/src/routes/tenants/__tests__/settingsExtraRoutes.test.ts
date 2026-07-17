/**
 * Route wiring for the two settings endpoints completed in the functional pass:
 *   GET  /api/tenants/settings/proposal-terms-default  (default T&Cs for editor)
 *   POST /api/tenants/settings/test-webhook            (sample integration event)
 * Underlying services are mocked; the no-URL branch must surface a clear 400.
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

const previewEngageDefaultTermsForTenant = jest.fn();
const getEngageDefaultTermsTemplate = jest.fn();
jest.mock('../../../services/proposalTermsService.js', () => ({
  previewEngageDefaultTermsForTenant: (...a: unknown[]) => previewEngageDefaultTermsForTenant(...a),
  getEngageDefaultTermsTemplate: (...a: unknown[]) => getEngageDefaultTermsTemplate(...a),
}));

const sendTestIntegrationWebhook = jest.fn();
jest.mock('../../../services/integrationEvents.js', () => ({
  sendTestIntegrationWebhook: (...a: unknown[]) => sendTestIntegrationWebhook(...a),
}));

jest.mock('../../../config/sentry.js', () => ({
  captureException: jest.fn(),
  initSentry: jest.fn(),
  Sentry: {},
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
});

describe('GET /api/tenants/settings/proposal-terms-default', () => {
  it('returns the rendered preview and the editable template', async () => {
    previewEngageDefaultTermsForTenant.mockResolvedValue('RENDERED PREVIEW');
    getEngageDefaultTermsTemplate.mockReturnValue('EDITABLE {{PRACTICE_NAME}} TEMPLATE');

    const res = await request(app()).get('/api/tenants/settings/proposal-terms-default');

    expect(res.status).toBe(200);
    expect(res.body.data.preview).toBe('RENDERED PREVIEW');
    expect(res.body.data.template).toBe('EDITABLE {{PRACTICE_NAME}} TEMPLATE');
    expect(previewEngageDefaultTermsForTenant).toHaveBeenCalledWith('t1');
  });
});

describe('POST /api/tenants/settings/test-webhook', () => {
  it('dispatches a sample event and reports delivery', async () => {
    sendTestIntegrationWebhook.mockResolvedValue({
      delivered: true,
      webhookUrl: 'https://hooks.example.com/x',
    });

    const res = await request(app())
      .post('/api/tenants/settings/test-webhook')
      .send({ format: 'zapier' });

    expect(res.status).toBe(200);
    expect(res.body.data.delivered).toBe(true);
    expect(sendTestIntegrationWebhook).toHaveBeenCalledWith('t1', 'zapier');
  });

  it('returns 400 NO_WEBHOOK_URL when no webhook URL is configured', async () => {
    sendTestIntegrationWebhook.mockResolvedValue({ delivered: false, webhookUrl: '' });

    const res = await request(app()).post('/api/tenants/settings/test-webhook').send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_WEBHOOK_URL');
  });
});
