/**
 * Two 10 MB ID / AML documents sent base64 in JSON exceed the global 10 MB
 * body limit, so the client upload route has its own larger parser. Other
 * routes keep the 10 MB cap.
 */
import express from 'express';
import request from 'supertest';

jest.mock('../../routes/stripeWebhook.js', () => jest.requireActual('express').Router());
jest.mock('../../routes/webhooks/stripeConnect.js', () => jest.requireActual('express').Router());
jest.mock('../../routes/webhooks/sendgrid.js', () => jest.requireActual('express').Router());
jest.mock('../../routes/webhooks/email-events.js', () => jest.requireActual('express').Router());
jest.mock('../../routes/webhooks/cloudflare-email.js', () =>
  jest.requireActual('express').Router()
);
jest.mock('../../routes/webhooks/graph-mail.js', () => jest.requireActual('express').Router());
jest.mock('../../utils/logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  AML_ONBOARDING_JSON_LIMIT,
  AML_ONBOARDING_PATH,
  applyParsersAndWebhooks,
} from '../parsersAndWebhooks.js';

function app() {
  const a = express();
  applyParsersAndWebhooks(a);
  a.post('*', (req, res) => res.json({ size: JSON.stringify(req.body).length }));
  a.use((err: { status?: number }, _req: express.Request, res: express.Response, _n: unknown) => {
    void _n;
    res.status(err.status || 500).json({ error: true });
  });
  return a;
}

// ~15 MB of JSON: bigger than the global cap, within the AML route cap.
const big = { data: 'a'.repeat(15 * 1024 * 1024) };

describe('AML onboarding body limit', () => {
  it('exposes a 30mb limit on the client upload path', () => {
    expect(AML_ONBOARDING_PATH).toBe('/api/onboarding/aml');
    expect(AML_ONBOARDING_JSON_LIMIT).toBe('30mb');
  });

  it('accepts a ~15 MB JSON body on /api/onboarding/aml/:token', async () => {
    const res = await request(app()).post('/api/onboarding/aml/tok').send(big);
    expect(res.status).toBe(200);
    expect(res.body.size).toBeGreaterThan(15 * 1024 * 1024);
  });

  it('keeps the 10 MB cap everywhere else', async () => {
    const res = await request(app()).post('/api/clients').send(big);
    expect(res.status).toBe(413);
  });
});
