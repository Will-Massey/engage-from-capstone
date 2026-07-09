import express from 'express';
import request from 'supertest';

const constructEvent = jest.fn();
const findUnique = jest.fn();
const update = jest.fn(async () => ({}));
const activityCreate = jest.fn(async () => ({}));
const syncTransfersStatus = jest.fn(async () => undefined);

jest.mock('../../../config/stripe.js', () => ({
  stripe: { webhooks: { constructEvent } },
}));

jest.mock('../../../config/database.js', () => ({
  prisma: {
    proposal: { findUnique, update },
    activityLog: { create: activityCreate },
  },
}));

jest.mock('../../../services/stripeConnectService.js', () => ({
  syncTransfersStatus,
}));

jest.mock('../../../config/sentry.js', () => ({
  captureException: jest.fn(),
  initSentry: jest.fn(),
  Sentry: {},
}));

import stripeConnectRouter from '../stripeConnect.js';
import { errorHandler } from '../../../middleware/errorHandler.js';

function app() {
  const a = express();
  a.use('/api/webhooks/stripe-connect', stripeConnectRouter);
  a.use(errorHandler);
  return a;
}

describe('stripe-connect webhook', () => {
  beforeEach(() => {
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_test';
    delete process.env.STRIPE_CONNECT_ACCOUNT_WEBHOOK_SECRET;
    jest.clearAllMocks();
  });

  it('marks the proposal PAID once', async () => {
    constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_1',
          metadata: { proposalId: 'p1', tenantId: 't1' },
          application_fee_amount: 300,
        },
      },
    });
    findUnique.mockResolvedValue({ id: 'p1', paymentStatus: 'PENDING', tenantId: 't1' });

    const res = await request(app())
      .post('/api/webhooks/stripe-connect')
      .set('stripe-signature', 'sig_test')
      .set('Content-Type', 'application/json')
      .send(Buffer.from('{}'));

    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: expect.objectContaining({ paymentStatus: 'PAID' }),
      })
    );
    expect(activityCreate).toHaveBeenCalled();
  });

  it('is a no-op when already PAID', async () => {
    constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', metadata: { proposalId: 'p1', tenantId: 't1' } } },
    });
    findUnique.mockResolvedValue({ id: 'p1', paymentStatus: 'PAID', tenantId: 't1' });

    await request(app())
      .post('/api/webhooks/stripe-connect')
      .set('stripe-signature', 'sig_test')
      .set('Content-Type', 'application/json')
      .send(Buffer.from('{}'));

    expect(update).not.toHaveBeenCalled();
  });

  it('syncs transfers status on account.updated', async () => {
    constructEvent.mockReturnValue({
      type: 'account.updated',
      data: { object: { id: 'acct_1' } },
    });

    const res = await request(app())
      .post('/api/webhooks/stripe-connect')
      .set('stripe-signature', 'sig_test')
      .set('Content-Type', 'application/json')
      .send(Buffer.from('{}'));

    expect(res.status).toBe(200);
    expect(syncTransfersStatus).toHaveBeenCalledWith('acct_1');
  });

  it('rejects invalid signature', async () => {
    constructEvent.mockImplementation(() => {
      throw new Error('bad sig');
    });

    const res = await request(app())
      .post('/api/webhooks/stripe-connect')
      .set('stripe-signature', 'bad')
      .set('Content-Type', 'application/json')
      .send(Buffer.from('{}'));

    expect(res.status).toBe(400);
  });

  it('verifies against the second (connected-accounts) secret when the first fails', async () => {
    process.env.STRIPE_CONNECT_ACCOUNT_WEBHOOK_SECRET = 'whsec_account';
    // First secret (platform) fails to verify; second secret (connected accounts) succeeds.
    constructEvent
      .mockImplementationOnce(() => {
        throw new Error('no match for platform secret');
      })
      .mockReturnValueOnce({ type: 'account.updated', data: { object: { id: 'acct_2' } } });

    const res = await request(app())
      .post('/api/webhooks/stripe-connect')
      .set('stripe-signature', 'sig_from_connect_endpoint')
      .set('Content-Type', 'application/json')
      .send(Buffer.from('{}'));

    expect(res.status).toBe(200);
    expect(constructEvent).toHaveBeenCalledTimes(2);
    expect(syncTransfersStatus).toHaveBeenCalledWith('acct_2');
  });
});
