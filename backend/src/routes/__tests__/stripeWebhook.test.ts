import express from 'express';
import request from 'supertest';
import { prisma } from '../../config/database.js';
import { stripe } from '../../config/stripe.js';

jest.mock('../../config/stripe.js', () => ({
  stripe: {
    webhooks: {
      constructEvent: jest.fn(),
    },
  },
}));

jest.mock('../../config/database.js', () => ({
  prisma: {
    tenant: {
      updateMany: jest.fn(),
    },
  },
}));

import stripeWebhookRoutes from '../stripeWebhook.js';
import { errorHandler } from '../../middleware/errorHandler.js';

function buildApp() {
  const app = express();
  app.use('/api/payments/webhook', stripeWebhookRoutes);
  app.use(errorHandler);
  return app;
}

describe('Stripe platform webhook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
  });

  it('rejects requests with an invalid signature', async () => {
    (stripe!.webhooks.constructEvent as jest.Mock).mockImplementation(() => {
      throw new Error('bad sig');
    });

    const res = await request(buildApp())
      .post('/api/payments/webhook')
      .set('stripe-signature', 'sig_test')
      .set('Content-Type', 'application/json')
      .send(Buffer.from('{}'));

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('INVALID_SIGNATURE');
  });

  it('marks tenant past_due on invoice.payment_failed', async () => {
    (stripe!.webhooks.constructEvent as jest.Mock).mockReturnValue({
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_123' } },
    });

    const res = await request(buildApp())
      .post('/api/payments/webhook')
      .set('stripe-signature', 'sig_test')
      .set('Content-Type', 'application/json')
      .send(Buffer.from('{}'));

    expect(res.status).toBe(200);
    expect(prisma.tenant.updateMany).toHaveBeenCalledWith({
      where: { stripeCustomerId: 'cus_123' },
      data: {
        lastPaymentStatus: 'failed',
        subscriptionStatus: 'past_due',
      },
    });
  });

  it('cancels tenant subscription on customer.subscription.deleted', async () => {
    (stripe!.webhooks.constructEvent as jest.Mock).mockReturnValue({
      type: 'customer.subscription.deleted',
      data: { object: { customer: 'cus_456' } },
    });

    const res = await request(buildApp())
      .post('/api/payments/webhook')
      .set('stripe-signature', 'sig_test')
      .set('Content-Type', 'application/json')
      .send(Buffer.from('{}'));

    expect(res.status).toBe(200);
    expect(prisma.tenant.updateMany).toHaveBeenCalledWith({
      where: { stripeCustomerId: 'cus_456' },
      data: {
        subscriptionStatus: 'cancelled',
        subscriptionTier: null,
        stripeSubscriptionId: null,
      },
    });
  });
});
