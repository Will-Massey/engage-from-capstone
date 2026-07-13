import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../auth.js';
import { prisma } from '../../config/database.js';

jest.mock('../../config/database.js', () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
    },
  },
}));

async function callAuthenticate(req: Partial<Request>) {
  const res = {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    body: undefined as unknown,
  } as Response & { statusCode: number; body: unknown };

  const next = jest.fn() as jest.MockedFunction<NextFunction>;
  await authenticate(req as Request, res, next);

  return {
    status: res.statusCode,
    body: res.body,
    nextCalled: next.mock.calls.length > 0,
    tenantId: (req as Request).tenantId,
    user: (req as Request).user,
  };
}

describe('authenticate middleware', () => {
  const secret = process.env.JWT_SECRET!;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when no token is provided', async () => {
    const result = await callAuthenticate({ headers: {}, cookies: {} });
    expect(result.status).toBe(401);
    expect(result.body).toMatchObject({
      success: false,
      error: { code: 'UNAUTHORIZED' },
    });
    expect(result.nextCalled).toBe(false);
  });

  it('rejects a 2FA-pending token as an access token (2FA bypass regression)', async () => {
    // The pending token is signed with the SAME secret but carries a `purpose`
    // and no tenantId — it must never establish a session.
    const pending = jwt.sign({ userId: 'user-1', purpose: '2fa_pending' }, secret, {
      expiresIn: '5m',
    });
    const result = await callAuthenticate({
      headers: { authorization: `Bearer ${pending}` },
      cookies: {},
    });
    expect(result.status).toBe(401);
    expect(result.nextCalled).toBe(false);
    expect(result.user).toBeUndefined();
    // The user lookup must not even run for a non-access token.
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a token with no tenantId claim', async () => {
    const noTenant = jwt.sign({ userId: 'user-1', role: 'ADMIN' }, secret, { expiresIn: '5m' });
    const result = await callAuthenticate({
      headers: { authorization: `Bearer ${noTenant}` },
      cookies: {},
    });
    expect(result.status).toBe(401);
    expect(result.nextCalled).toBe(false);
  });

  it('returns TOKEN_EXPIRED for expired tokens', async () => {
    const token = jwt.sign(
      {
        userId: 'user-1',
        email: 'a@b.com',
        firstName: 'A',
        lastName: 'B',
        role: 'ADMIN',
        tenantId: 'tenant-1',
      },
      secret,
      { expiresIn: -1 }
    );

    const result = await callAuthenticate({
      headers: { authorization: `Bearer ${token}` },
    });

    expect(result.status).toBe(401);
    expect(result.body).toMatchObject({
      error: { code: 'TOKEN_EXPIRED' },
    });
  });

  it('returns INVALID_TOKEN for tampered tokens', async () => {
    const token = jwt.sign(
      {
        userId: 'user-1',
        email: 'a@b.com',
        firstName: 'A',
        lastName: 'B',
        role: 'ADMIN',
        tenantId: 'tenant-1',
      },
      secret,
      { expiresIn: '1h' }
    );
    const tampered = `${token.slice(0, -4)}xxxx`;

    const result = await callAuthenticate({
      headers: { authorization: `Bearer ${tampered}` },
    });

    expect(result.status).toBe(401);
    expect(result.body).toMatchObject({
      error: { code: 'INVALID_TOKEN' },
    });
  });

  it('rejects cross-tenant X-Tenant-Id header injection', async () => {
    const token = jwt.sign(
      {
        userId: 'user-1',
        email: 'admin@demo.practice',
        firstName: 'Sarah',
        lastName: 'Johnson',
        role: 'ADMIN',
        tenantId: 'tenant-a',
      },
      secret,
      { expiresIn: '1h' }
    );

    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'admin@demo.practice',
      firstName: 'Sarah',
      lastName: 'Johnson',
      role: 'ADMIN',
      tenantId: 'tenant-a',
      isActive: true,
    });

    const result = await callAuthenticate({
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': 'tenant-b',
      },
    });

    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({
      error: { code: 'TENANT_MISMATCH' },
    });
    expect(result.nextCalled).toBe(false);
  });

  it('attaches user and tenant on valid token', async () => {
    const token = jwt.sign(
      {
        userId: 'user-1',
        email: 'admin@demo.practice',
        firstName: 'Sarah',
        lastName: 'Johnson',
        role: 'ADMIN',
        tenantId: 'tenant-a',
      },
      secret,
      { expiresIn: '1h' }
    );

    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'admin@demo.practice',
      firstName: 'Sarah',
      lastName: 'Johnson',
      role: 'ADMIN',
      tenantId: 'tenant-a',
      isActive: true,
    });

    const req: Partial<Request> = {
      headers: { authorization: `Bearer ${token}` },
    };
    const result = await callAuthenticate(req);

    expect(result.nextCalled).toBe(true);
    expect(result.tenantId).toBe('tenant-a');
    expect(result.user?.email).toBe('admin@demo.practice');
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'user-1', tenantId: 'tenant-a', isActive: true },
    });
  });
});
