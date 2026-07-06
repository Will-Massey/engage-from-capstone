/**
 * Revolut webhook signature verification.
 * @see https://developer.revolut.com/docs/guides/accept-payments/tutorials/work-with-webhooks/verify-the-payload-signature
 */
import crypto from 'crypto';
import type { Request } from 'express';

const TOLERANCE_MS = 300_000;

function calculateHmac(payloadToSign: string, signingSecret: string): string {
  return crypto.createHmac('sha256', signingSecret).update(payloadToSign).digest('hex');
}

function validateSignature({
  signatureVersion,
  originalSignature,
  payloadToSign,
  signingSecret,
}: {
  signatureVersion: string;
  originalSignature: string;
  payloadToSign: string;
  signingSecret: string;
}): boolean {
  if (!originalSignature || !signingSecret) return false;
  const expected = `${signatureVersion}=` + calculateHmac(payloadToSign, signingSecret);
  if (originalSignature.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(originalSignature), Buffer.from(expected));
}

function validateTimestamp(requestTimestamp: string): boolean {
  const ts = Number(requestTimestamp);
  if (!Number.isFinite(ts)) return false;
  const diff = Date.now() - ts;
  return diff >= 0 && diff <= TOLERANCE_MS;
}

export type RevolutWebhookRequest = Request & { rawBody?: Buffer };

export function verifyRevolutWebhook(req: RevolutWebhookRequest): {
  ok: boolean;
  event?: Record<string, unknown>;
  error?: string;
} {
  const secret = process.env.REVOLUT_WEBHOOK_SECRET;
  if (!secret) return { ok: false, error: 'REVOLUT_WEBHOOK_SECRET not configured' };

  const signature = req.headers['revolut-signature'] as string | undefined;
  const timestamp = req.headers['revolut-request-timestamp'] as string | undefined;
  const rawBody = req.rawBody;

  if (!signature || !timestamp || !rawBody) {
    return { ok: false, error: 'Missing webhook headers or raw body' };
  }

  if (!validateTimestamp(timestamp)) {
    return { ok: false, error: 'Timestamp outside tolerance zone' };
  }

  const version = signature.substring(0, signature.indexOf('='));
  const payloadToSign = `${version}.${timestamp}.${rawBody}`;

  const valid = validateSignature({
    signatureVersion: version,
    originalSignature: signature,
    payloadToSign,
    signingSecret: secret,
  });

  if (!valid) return { ok: false, error: 'Invalid signature' };
  return { ok: true, event: req.body as Record<string, unknown> };
}
