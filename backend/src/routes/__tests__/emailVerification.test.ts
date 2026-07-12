/**
 * Email verification enforcement — login gate, verify/resend endpoints,
 * registration without a session, and the e2e-only token backdoor.
 */

import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

jest.mock('../../config/database.js', () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    emailVerification: {
      findFirst: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn(async (ops: unknown) => ops),
  },
}));

jest.mock('../../services/tenantMailer.js', () => ({
  tenantMailerSend: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../../utils/loginLockout.js', () => ({
  isLoginLocked: jest.fn().mockResolvedValue(false),
  recordFailedLogin: jest.fn().mockResolvedValue(1),
  clearLoginAttempts: jest.fn().mockResolvedValue(undefined),
  LOGIN_LOCKOUT_MAX: 5,
}));

jest.mock('../../utils/authCookies.js', () => ({
  setAuthCookies: jest.fn().mockReturnValue({ csrfToken: 'test-csrf-token' }),
  clearAuthCookies: jest.fn(),
  issueCsrfToken: jest.fn().mockReturnValue('test-csrf-token'),
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
        id: 'admin-1',
        email: 'partner@demo.practice',
        firstName: 'Pat',
        lastName: 'Partner',
        role: 'PARTNER',
        tenantId: 'tenant-1',
      };
      req.tenantId = 'tenant-1';
      next();
    },
  };
});

import { prisma } from '../../config/database.js';
import { tenantMailerSend } from '../../services/tenantMailer.js';
import { setAuthCookies } from '../../utils/authCookies.js';
import authRoutes from '../auth.js';
import { errorHandler } from '../../middleware/errorHandler.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use(errorHandler);
  return app;
}

const PASSWORD = 'CorrectHorse1!';
let passwordHash: string;

const baseUser = () => ({
  id: 'user-1',
  email: 'user@demo.practice',
  passwordHash,
  firstName: 'Demo',
  lastName: 'User',
  phone: null,
  jobTitle: null,
  role: 'PARTNER',
  tenantId: 'tenant-1',
  isActive: true,
  twoFactorEnabled: false,
  twoFactorSecret: null,
  emailVerified: new Date('2026-01-01T00:00:00Z'),
  tenant: {
    id: 'tenant-1',
    name: 'Demo Practice',
    subdomain: 'demo',
    primaryColor: '#0ea5e9',
    settings: null,
  },
});

beforeAll(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, 4);
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/auth/login — email verification gate', () => {
  it('returns requiresVerification without a session for unverified users', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
      ...baseUser(),
      emailVerified: null,
    });

    const res = await request(buildApp())
      .post('/api/auth/login')
      .send({ email: 'user@demo.practice', password: PASSWORD, tenantId: 'tenant-1' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      requiresVerification: true,
      email: 'user@demo.practice',
    });
    // No session cookie, no lastLoginAt update
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(setAuthCookies).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('issues a normal session for verified users', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(baseUser());
    (prisma.user.update as jest.Mock).mockResolvedValue(baseUser());

    const res = await request(buildApp())
      .post('/api/auth/login')
      .send({ email: 'user@demo.practice', password: PASSWORD, tenantId: 'tenant-1' });

    expect(res.status).toBe(200);
    expect(res.body.data.requiresVerification).toBeUndefined();
    expect(res.body.data.user.email).toBe('user@demo.practice');
    expect(setAuthCookies).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { lastLoginAt: expect.any(Date) },
    });
  });

  it('still routes verified 2FA users to the requires2FA step (regression)', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
      ...baseUser(),
      twoFactorEnabled: true,
      twoFactorSecret: 'encrypted-secret',
    });

    const res = await request(buildApp())
      .post('/api/auth/login')
      .send({ email: 'user@demo.practice', password: PASSWORD, tenantId: 'tenant-1' });

    expect(res.status).toBe(200);
    expect(res.body.data.requires2FA).toBe(true);
    expect(res.body.data.pendingToken).toBeDefined();
    expect(setAuthCookies).not.toHaveBeenCalled();
  });

  it('verification gate runs before 2FA — unverified 2FA user gets requiresVerification', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
      ...baseUser(),
      emailVerified: null,
      twoFactorEnabled: true,
      twoFactorSecret: 'encrypted-secret',
    });

    const res = await request(buildApp())
      .post('/api/auth/login')
      .send({ email: 'user@demo.practice', password: PASSWORD, tenantId: 'tenant-1' });

    expect(res.status).toBe(200);
    expect(res.body.data.requiresVerification).toBe(true);
    expect(res.body.data.requires2FA).toBeUndefined();
  });

  it('falls back to email-only lookup when the ambient tenant does not contain the user', async () => {
    // First call: scoped to the ambient (default/demo) tenant — no match.
    // Second call: email-only fallback finds the user's own tenant.
    (prisma.user.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...baseUser(), tenantId: 'tenant-2' });
    (prisma.user.update as jest.Mock).mockResolvedValue(baseUser());

    const app = express();
    app.use(express.json());
    // Simulate extractTenant's dev/prod default-tenant fallback
    app.use((req, _res, next) => {
      req.tenantId = 'ambient-demo-tenant';
      next();
    });
    app.use('/api/auth', authRoutes);
    app.use(errorHandler);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@demo.practice', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('user@demo.practice');
    expect(setAuthCookies).toHaveBeenCalledTimes(1);

    // Second lookup must not be tenant-scoped
    const secondWhere = (prisma.user.findFirst as jest.Mock).mock.calls[1][0].where;
    expect(secondWhere).toEqual({ email: 'user@demo.practice', isActive: true });
  });
});

describe('POST /api/auth/register', () => {
  it('creates an unverified user, sends a verification email, and issues no session', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.user.create as jest.Mock).mockResolvedValue(baseUser());

    const res = await request(buildApp()).post('/api/auth/register').send({
      email: 'user@demo.practice',
      password: PASSWORD,
      firstName: 'Demo',
      lastName: 'User',
      tenantId: 'tenant-1',
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      requiresVerification: true,
      email: 'user@demo.practice',
    });

    // emailVerified must NOT be set — public registrations start unverified
    const createData = (prisma.user.create as jest.Mock).mock.calls[0][0].data;
    expect(createData).not.toHaveProperty('emailVerified');

    // Verification email with the verify link
    expect(tenantMailerSend).toHaveBeenCalledTimes(1);
    const mail = (tenantMailerSend as jest.Mock).mock.calls[0][0];
    expect(mail.message.subject).toBe('Verify your email — Engage by Capstone');
    expect(mail.message.html).toContain('/verify-email?token=');

    // Regression: register must not set auth cookies any more
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(setAuthCookies).not.toHaveBeenCalled();
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/verify-email', () => {
  it('verifies a valid token and consumes it in one transaction', async () => {
    (prisma.emailVerification.findFirst as jest.Mock).mockResolvedValue({
      id: 'verif-1',
      userId: 'user-1',
    });

    const token = 'a'.repeat(64);
    const res = await request(buildApp()).post('/api/auth/verify-email').send({ token });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ verified: true });

    // Looked up by sha256 hash, unexpired and unused only
    expect(prisma.emailVerification.findFirst).toHaveBeenCalledWith({
      where: {
        tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
        expiresAt: { gt: expect.any(Date) },
        usedAt: null,
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { emailVerified: expect.any(Date) },
    });
    expect(prisma.emailVerification.update).toHaveBeenCalledWith({
      where: { id: 'verif-1' },
      data: { usedAt: expect.any(Date) },
    });
  });

  it.each([
    ['garbage token', 'not-a-real-token'],
    ['expired token', 'b'.repeat(64)],
    ['already-used token', 'c'.repeat(64)],
  ])('rejects %s with a generic INVALID_TOKEN error', async (_label, token) => {
    // Expired and used tokens are excluded by the where clause, so all three
    // invalid cases surface identically as "no record found".
    (prisma.emailVerification.findFirst as jest.Mock).mockResolvedValue(null);

    const res = await request(buildApp()).post('/api/auth/verify-email').send({ token });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('INVALID_TOKEN');
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/resend-verification', () => {
  const NEUTRAL = 'If an account exists for that email, verification instructions have been sent.';

  it('answers neutrally and sends nothing for unknown emails', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

    const res = await request(buildApp())
      .post('/api/auth/resend-verification')
      .send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBe(NEUTRAL);
    expect(tenantMailerSend).not.toHaveBeenCalled();
    expect(prisma.emailVerification.create).not.toHaveBeenCalled();
  });

  it('answers neutrally and sends nothing for already-verified users', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(baseUser());

    const res = await request(buildApp())
      .post('/api/auth/resend-verification')
      .send({ email: 'user@demo.practice' });

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBe(NEUTRAL);
    expect(tenantMailerSend).not.toHaveBeenCalled();
    expect(prisma.emailVerification.create).not.toHaveBeenCalled();
  });

  it('re-issues a single outstanding token (deleteMany then create) for unverified users', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
      ...baseUser(),
      emailVerified: null,
    });

    const res = await request(buildApp())
      .post('/api/auth/resend-verification')
      .send({ email: 'user@demo.practice', subdomain: 'demo' });

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBe(NEUTRAL);

    // Subdomain narrows the lookup
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenant: { subdomain: 'demo' } }),
      })
    );

    const deleteMock = prisma.emailVerification.deleteMany as jest.Mock;
    const createMock = prisma.emailVerification.create as jest.Mock;
    expect(deleteMock).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(deleteMock.mock.invocationCallOrder[0]).toBeLessThan(
      createMock.mock.invocationCallOrder[0]
    );
    expect(tenantMailerSend).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/auth/e2e/verification-token — test-mode backdoor', () => {
  it('is forbidden without the X-Test-Mode header', async () => {
    const res = await request(buildApp())
      .post('/api/auth/e2e/verification-token')
      .send({ email: 'user@demo.practice' });

    expect(res.status).toBe(403);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('returns a fresh token when X-Test-Mode is set outside production', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
      ...baseUser(),
      emailVerified: null,
    });

    const res = await request(buildApp())
      .post('/api/auth/e2e/verification-token')
      .set('X-Test-Mode', 'e2e')
      .send({ email: 'user@demo.practice' });

    expect(res.status).toBe(200);
    expect(res.body.data.token).toMatch(/^[0-9a-f]{64}$/);
    expect(prisma.emailVerification.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prisma.emailVerification.create).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/auth/users — admin-created staff', () => {
  it('creates the user pre-verified (admin vouches for the address)', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.user.create as jest.Mock).mockResolvedValue({
      ...baseUser(),
      id: 'user-2',
      email: 'staff@demo.practice',
    });

    const res = await request(buildApp()).post('/api/auth/users').send({
      email: 'staff@demo.practice',
      firstName: 'Staff',
      lastName: 'Member',
      role: 'SENIOR',
      password: PASSWORD,
    });

    expect(res.status).toBe(201);
    const createData = (prisma.user.create as jest.Mock).mock.calls[0][0].data;
    expect(createData.emailVerified).toEqual(expect.any(Date));
    // No verification email round-trip for vouched users
    expect(tenantMailerSend).not.toHaveBeenCalled();
  });
});
