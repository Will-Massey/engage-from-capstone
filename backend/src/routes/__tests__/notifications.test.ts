/**
 * GET /api/notifications — tenant-scoped feed for the header bell, built from
 * the ActivityLog with a whitelist of client-driven events. Read-only.
 */
import express from 'express';
import request from 'supertest';

jest.mock('../../middleware/auth.js', () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const r = req as express.Request & { tenantId?: string; user?: unknown };
    r.tenantId = 't1';
    r.user = {
      id: 'u1',
      email: 'a@x.com',
      firstName: 'A',
      lastName: 'B',
      role: 'PARTNER',
      tenantId: 't1',
    };
    next();
  },
  authorize: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));

const activityFindMany = jest.fn();

jest.mock('../../config/database.js', () => ({
  prisma: {
    activityLog: { findMany: activityFindMany },
  },
}));

import notificationsRoutes, { NOTIFICATION_ACTIONS } from '../notifications.js';
import { errorHandler } from '../../middleware/errorHandler.js';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/notifications', notificationsRoutes);
  a.use(errorHandler);
  return a;
}

beforeEach(() => {
  activityFindMany.mockReset();
});

describe('GET /api/notifications', () => {
  it('returns recent whitelisted activity scoped to the tenant', async () => {
    activityFindMany.mockResolvedValue([
      {
        id: 'a1',
        action: 'PROPOSAL_SIGNED',
        description: 'Signed by Sarah',
        entityType: 'PROPOSAL',
        entityId: 'p1',
        proposalId: 'p1',
        createdAt: new Date('2026-07-19T20:00:00Z'),
      },
    ]);

    const res = await request(app()).get('/api/notifications');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      id: 'a1',
      action: 'PROPOSAL_SIGNED',
      description: 'Signed by Sarah',
      entityId: 'p1',
    });
    expect(activityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 't1',
          action: { in: expect.arrayContaining(['PROPOSAL_SIGNED', 'CLIENT_AML_SUBMITTED']) },
        }),
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
    );
  });

  it('whitelist covers the client-driven events and nothing internal', () => {
    expect(NOTIFICATION_ACTIONS).toEqual(
      expect.arrayContaining([
        'PROPOSAL_VIEWED',
        'PROPOSAL_SIGNED',
        'PROPOSAL_ACCEPTED',
        'PROPOSAL_DECLINED',
        'CLIENT_AML_SUBMITTED',
        'PAYMENT_COMPLETED',
      ])
    );
    expect(NOTIFICATION_ACTIONS).not.toContain('AI_FEATURE_USED');
  });
});
