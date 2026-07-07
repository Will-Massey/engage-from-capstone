/**
 * AML routes must not forward internal/provider error messages to clients
 * (2026-07-07 audit L3). Real errors are logged; responses stay generic.
 */
import express from 'express';
import request from 'supertest';

jest.mock('../src/middleware/auth.js', () => {
  const actual = jest.requireActual('../src/middleware/auth.js');
  return {
    ...actual,
    authenticate: (req: any, _res: any, next: any) => {
      req.user = { id: 'user-1', email: 'admin@test.dev', role: 'ADMIN' };
      req.tenantId = 'tenant-1';
      next();
    },
  };
});

jest.mock('../src/services/amlService.js', () => ({
  getAmlPartnerConfig: jest.fn(),
  getAmlStatusForClient: jest.fn(),
  initiateAmlCheck: jest.fn(),
  processAmlWebhook: jest.fn(),
}));

import amlRouter from '../src/routes/aml.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import {
  getAmlStatusForClient,
  initiateAmlCheck,
  processAmlWebhook,
} from '../src/services/amlService.js';

const app = express();
app.use(express.json());
app.use('/', amlRouter);
app.use(errorHandler);

const CLIENT_ID = '4f9adf49-56f8-4a4e-9a67-1b1a1c2d3e4f';
const INTERNAL = 'SmartSearch API key sk-internal-9999 rejected (401 from provider)';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AML error responses stay generic (L3)', () => {
  it('POST /check returns generic message on provider failure', async () => {
    (initiateAmlCheck as jest.Mock).mockRejectedValue(new Error(INTERNAL));

    const res = await request(app).post('/check').send({ clientId: CLIENT_ID });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('AML_CHECK_FAILED');
    expect(res.body.error.message).toBe('AML check failed');
    expect(JSON.stringify(res.body)).not.toContain('sk-internal-9999');
  });

  it('POST /check still maps missing clients to 404', async () => {
    (initiateAmlCheck as jest.Mock).mockRejectedValue(new Error('client not found'));

    const res = await request(app).post('/check').send({ clientId: CLIENT_ID });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CLIENT_NOT_FOUND');
  });

  it('GET /status/:clientId returns generic message on failure', async () => {
    (getAmlStatusForClient as jest.Mock).mockRejectedValue(new Error(INTERNAL));

    const res = await request(app).get(`/status/${CLIENT_ID}`);

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('AML_STATUS_FAILED');
    expect(res.body.error.message).toBe('Failed to load AML status');
    expect(JSON.stringify(res.body)).not.toContain('sk-internal-9999');
  });

  it('POST /webhook returns generic message on processing failure', async () => {
    (processAmlWebhook as jest.Mock).mockRejectedValue(
      new Error('pg connection to postgres://internal-host:5432 refused')
    );

    const res = await request(app).post('/webhook').send({ providerRef: 'ref-1', status: 'clear' });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('AML_WEBHOOK_FAILED');
    expect(res.body.error.message).toBe('Webhook processing failed');
    expect(JSON.stringify(res.body)).not.toContain('internal-host');
  });
});
