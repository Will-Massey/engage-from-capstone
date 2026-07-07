import crypto from 'crypto';
import { verifyRevolutWebhook, type RevolutWebhookRequest } from '../webhook.js';

const SECRET = 'test-revolut-webhook-secret-32chars';

function buildSignedRequest({
  body,
  secret = SECRET,
  timestamp = String(Date.now()),
  version = 'v1',
  mutateSignature,
}: {
  body: Record<string, unknown>;
  secret?: string;
  timestamp?: string;
  version?: string;
  mutateSignature?: (sig: string) => string;
}): RevolutWebhookRequest {
  const rawBody = Buffer.from(JSON.stringify(body));
  const payloadToSign = `${version}.${timestamp}.${rawBody}`;
  const hmac = crypto.createHmac('sha256', secret).update(payloadToSign).digest('hex');
  let signature = `${version}=${hmac}`;
  if (mutateSignature) signature = mutateSignature(signature);

  return {
    headers: {
      'revolut-signature': signature,
      'revolut-request-timestamp': timestamp,
    },
    rawBody,
    body,
  } as unknown as RevolutWebhookRequest;
}

describe('verifyRevolutWebhook', () => {
  const originalSecret = process.env.REVOLUT_WEBHOOK_SECRET;

  beforeAll(() => {
    process.env.REVOLUT_WEBHOOK_SECRET = SECRET;
  });

  afterAll(() => {
    process.env.REVOLUT_WEBHOOK_SECRET = originalSecret;
  });

  it('rejects when webhook secret is not configured', () => {
    delete process.env.REVOLUT_WEBHOOK_SECRET;
    const result = verifyRevolutWebhook(buildSignedRequest({ body: { event: 'ORDER_COMPLETED' } }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not configured/);
    process.env.REVOLUT_WEBHOOK_SECRET = SECRET;
  });

  it('rejects missing signature headers or raw body', () => {
    const result = verifyRevolutWebhook({ headers: {}, body: {} } as RevolutWebhookRequest);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Missing/);
  });

  it('rejects timestamps outside the tolerance window', () => {
    const stale = String(Date.now() - 400_000);
    const result = verifyRevolutWebhook(
      buildSignedRequest({ body: { event: 'ORDER_COMPLETED' }, timestamp: stale })
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Timestamp/);
  });

  it('rejects an invalid signature', () => {
    const result = verifyRevolutWebhook(
      buildSignedRequest({
        body: { event: 'ORDER_COMPLETED' },
        mutateSignature: (sig) => sig.replace(/.$/, sig.endsWith('a') ? 'b' : 'a'),
      })
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Invalid signature/);
  });

  it('accepts a valid signed payload', () => {
    const body = { event: 'ORDER_COMPLETED', order: { id: 'ord_123' } };
    const result = verifyRevolutWebhook(buildSignedRequest({ body }));
    expect(result.ok).toBe(true);
    expect(result.event).toEqual(body);
  });
});
