/**
 * POST /api/auth/users role gate. A UX audit flagged that MD was missing from
 * this route's authorize() list while GET /api/auth/users (the Team list)
 * already includes MD, so an MD could see a working "Add User" button and
 * still get rejected.
 *
 * Note: the real `authorize()` middleware (backend/src/middleware/auth.ts)
 * already grants ADMIN and MD full access via `hasFullAccess()` regardless
 * of the explicit role list passed to a given route, so MD was never
 * actually rejected here at runtime — this test uses the REAL authorize
 * middleware (only `authenticate` is mocked) to prove that, and to lock in
 * that the explicit list now says what the middleware already does.
 */
import express from 'express';
import request from 'supertest';

let currentRole = 'MANAGER';

jest.mock('../../config/database.js', () => ({
  prisma: {
    user: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'new-user-1',
        email: 'new@demo.practice',
        firstName: 'New',
        lastName: 'User',
        phone: null,
        jobTitle: null,
        role: 'JUNIOR',
        isActive: true,
        createdAt: new Date(),
      }),
    },
  },
}));

jest.mock('../../middleware/tierLimits.js', () => ({
  enforceTierLimit: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../middleware/auth.js', () => {
  const actual = jest.requireActual('../../middleware/auth.js');
  return {
    ...actual,
    authenticate: (req: { user?: unknown; tenantId?: string }, _res: unknown, next: () => void) => {
      req.user = {
        id: 'actor-1',
        email: 'actor@demo.practice',
        firstName: 'Actor',
        lastName: 'One',
        role: currentRole,
        tenantId: 'tenant-1',
      };
      req.tenantId = 'tenant-1';
      next();
    },
  };
});

import authRoutes from '../auth.js';
import { errorHandler } from '../../middleware/errorHandler.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use(errorHandler);
  return app;
}

const newUserPayload = {
  email: 'new@demo.practice',
  firstName: 'New',
  lastName: 'User',
  role: 'JUNIOR',
  password: 'CorrectHorse1!',
};

beforeEach(() => {
  jest.clearAllMocks();
  currentRole = 'MANAGER';
});

describe('POST /api/auth/users', () => {
  it.each(['ADMIN', 'PARTNER', 'MD', 'MANAGER'])('allows %s to create a user', async (role) => {
    currentRole = role;
    const res = await request(buildApp()).post('/api/auth/users').send(newUserPayload);
    expect(res.status).toBe(201);
  });

  it.each(['SENIOR', 'JUNIOR'])('rejects %s with 403', async (role) => {
    currentRole = role;
    const res = await request(buildApp()).post('/api/auth/users').send(newUserPayload);
    expect(res.status).toBe(403);
  });
});
