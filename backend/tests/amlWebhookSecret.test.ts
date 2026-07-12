/**
 * AML webhook secret enforcement — timing-safe header comparison, and a hard
 * 503 in production when AML_WEBHOOK_SECRET is unset (never an open webhook).
 */
import express from 'express';
import request from 'supertest';

let mockIsProduction = false;

jest.mock('../src/utils/securityFlags.js', () => {
  const actual = jest.requireActual('../src/utils/securityFlags.js');
  return {
    ...actual,
    get isProduction() {
      return mockIsProduction;
    },
  };
});

jest.mock('../src/services/amlService.js', () => ({
  getAmlPartnerConfig: jest.fn(),
  getAmlStatusForClient: jest.fn(),
  initiateAmlCheck: jest.fn(),
  processAmlWebhook: jest.fn(),
}));

jest.mock('../src/services/aml/amlUsageService.js', () => ({
  getAmlUsage: jest.fn(),
}));

import amlRouter from '../src/routes/aml.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { processAmlWebhook } from '../src/services/amlService.js';

const app = express();
app.use(express.json());
app.use('/', amlRouter);
app.use(errorHandler);

const SECRET = 'test-aml-webhook-secret';
const payload = { providerRef: 'ref-1', status: 'clear' };

beforeEach(() => {
  jest.clearAllMocks();
  mockIsProduction = false;
  delete process.env.AML_WEBHOOK_SECRET;
  (processAmlWebhook as jest.Mock).mockResolvedValue({
    updated: true,
    clientId: 'client-1',
    amlStatus: 'CLEAR',
  });
});

afterAll(() => {
  delete process.env.AML_WEBHOOK_SECRET;
});

describe('POST /webhook secret enforcement', () => {
  it('rejects a wrong secret with 403', async () => {
    process.env.AML_WEBHOOK_SECRET = SECRET;

    const res = await request(app)
      .post('/webhook')
      .set('x-aml-webhook-secret', 'wrong')
      .send(payload);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(processAmlWebhook).not.toHaveBeenCalled();
  });

  it('rejects a missing secret header with 403 when a secret is configured', async () => {
    process.env.AML_WEBHOOK_SECRET = SECRET;

    const res = await request(app).post('/webhook').send(payload);

    expect(res.status).toBe(403);
    expect(processAmlWebhook).not.toHaveBeenCalled();
  });

  it('accepts the correct secret', async () => {
    process.env.AML_WEBHOOK_SECRET = SECRET;

    const res = await request(app)
      .post('/webhook')
      .set('x-aml-webhook-secret', SECRET)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(processAmlWebhook).toHaveBeenCalledWith(expect.objectContaining(payload));
  });

  it('returns 503 in production when no secret is configured', async () => {
    mockIsProduction = true;

    const res = await request(app).post('/webhook').send(payload);

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('WEBHOOK_NOT_CONFIGURED');
    expect(processAmlWebhook).not.toHaveBeenCalled();
  });

  it('processes without a secret outside production (dev/demo convenience)', async () => {
    const res = await request(app).post('/webhook').send(payload);

    expect(res.status).toBe(200);
    expect(processAmlWebhook).toHaveBeenCalled();
  });

  it('returns 404 UNKNOWN_REF when no client matches', async () => {
    (processAmlWebhook as jest.Mock).mockResolvedValue({ updated: false });

    const res = await request(app).post('/webhook').send(payload);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('UNKNOWN_REF');
  });
});
