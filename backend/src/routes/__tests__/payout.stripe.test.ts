import express from 'express';
import request from 'supertest';

const startOnboarding = jest.fn(async () => ({
  url: 'https://connect.stripe.com/setup/s/test',
}));
const getPayoutSettingsPublic = jest.fn(async () => ({
  enabled: false,
  stripeTransfersStatus: 'inactive',
  stripeConnectedAccountId: null,
  payoutMethod: 'STRIPE_CONNECT',
}));

jest.mock('../../services/stripeConnectService.js', () => ({
  startOnboarding,
}));

jest.mock('../../services/payoutSettingsService.js', () => ({
  getPayoutSettingsPublic,
  savePayoutSettings: jest.fn(),
}));

jest.mock('../../middleware/auth.js', () => ({
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
    (..._roles: string[]) =>
    (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
      next(),
}));

jest.mock('../../config/database.js', () => ({
  prisma: {
    paymentSplit: { findMany: jest.fn() },
    tenant: { findUnique: jest.fn(), update: jest.fn() },
  },
}));

jest.mock('../../config/sentry.js', () => ({
  captureException: jest.fn(),
  initSentry: jest.fn(),
  Sentry: {},
}));

import payoutRoutes from '../payout.js';
import { errorHandler } from '../../middleware/errorHandler.js';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/payout', payoutRoutes);
  a.use(errorHandler);
  return a;
}

describe('payout Stripe routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.APP_URL = 'https://app.example.com';
  });

  it('POST /stripe/onboard returns Account Link url', async () => {
    const res = await request(app()).post('/api/payout/stripe/onboard').send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.url).toContain('connect.stripe.com');
    expect(startOnboarding).toHaveBeenCalledWith(
      't1',
      'https://app.example.com/settings?tab=billing&onboarding=complete',
      'https://app.example.com/settings?tab=billing&onboarding=refresh'
    );
  });

  it('GET /settings returns Stripe payout public shape', async () => {
    const res = await request(app()).get('/api/payout/settings');

    expect(res.status).toBe(200);
    expect(res.body.data.stripeTransfersStatus).toBe('inactive');
    expect(res.body.data.payoutMethod).toBe('STRIPE_CONNECT');
    expect(res.body.data.allowRevolutPay).toBeUndefined();
  });
});
