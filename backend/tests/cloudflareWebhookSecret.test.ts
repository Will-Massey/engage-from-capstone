/**
 * Cloudflare email webhook secret verification (2026-07-07 audit L2):
 * timing-safe comparison via secureCompare; wrong secrets rejected.
 */
import express from 'express';
import request from 'supertest';
import type { Request } from 'express';

jest.mock('../src/services/emailDeliveryService.js', () => ({
  processEmailDeliveryEvent: jest.fn().mockResolvedValue(undefined),
}));

import cloudflareEmailRouter, {
  verifyCloudflareWebhookSecret,
} from '../src/routes/webhooks/cloudflare-email.js';

const SECRET = 'test-cloudflare-webhook-secret';

function mockReq(headers: Record<string, string>): Request {
  return { get: (name: string) => headers[name] } as unknown as Request;
}

describe('verifyCloudflareWebhookSecret', () => {
  beforeEach(() => {
    process.env.CLOUDFLARE_EMAIL_WEBHOOK_SECRET = SECRET;
  });

  afterAll(() => {
    delete process.env.CLOUDFLARE_EMAIL_WEBHOOK_SECRET;
  });

  it('rejects a wrong bearer secret', () => {
    expect(verifyCloudflareWebhookSecret(mockReq({ Authorization: 'Bearer wrong' }))).toBe(false);
  });

  it('rejects a wrong X-Webhook-Secret header', () => {
    expect(verifyCloudflareWebhookSecret(mockReq({ 'X-Webhook-Secret': 'wrong' }))).toBe(false);
  });

  it('rejects when no secret is provided', () => {
    expect(verifyCloudflareWebhookSecret(mockReq({}))).toBe(false);
  });

  it('accepts the correct bearer secret', () => {
    expect(verifyCloudflareWebhookSecret(mockReq({ Authorization: `Bearer ${SECRET}` }))).toBe(
      true
    );
  });

  it('accepts the correct X-Webhook-Secret header', () => {
    expect(verifyCloudflareWebhookSecret(mockReq({ 'X-Webhook-Secret': SECRET }))).toBe(true);
  });
});

describe('POST cloudflare email webhook', () => {
  const app = express();
  app.use(express.json());
  app.use('/', cloudflareEmailRouter);

  beforeEach(() => {
    process.env.CLOUDFLARE_EMAIL_WEBHOOK_SECRET = SECRET;
  });

  afterAll(() => {
    delete process.env.CLOUDFLARE_EMAIL_WEBHOOK_SECRET;
  });

  it('returns 401 for a wrong secret', async () => {
    const res = await request(app)
      .post('/')
      .set('Authorization', 'Bearer wrong')
      .send({ event: 'delivered' });
    expect(res.status).toBe(401);
  });

  it('returns 200 for the correct secret', async () => {
    const res = await request(app)
      .post('/')
      .set('Authorization', `Bearer ${SECRET}`)
      .send({ event: 'delivered' });
    expect(res.status).toBe(200);
  });
});
