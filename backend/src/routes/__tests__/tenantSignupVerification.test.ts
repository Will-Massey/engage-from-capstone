/**
 * Tenant signup — creates an unverified admin, emails a verification link,
 * and no longer issues a session (regression: setAuthCookies must not run).
 */

import express from 'express';
import request from 'supertest';

const txMock = {
  tenant: { create: jest.fn() },
  user: { create: jest.fn() },
  serviceTemplate: { create: jest.fn().mockResolvedValue({}) },
};

jest.mock('../../config/database.js', () => ({
  prisma: {
    tenant: { findUnique: jest.fn() },
    user: { findFirst: jest.fn() },
    emailVerification: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
  },
}));

jest.mock('../../services/tenantMailer.js', () => ({
  tenantMailerSend: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../../utils/authCookies.js', () => ({
  setAuthCookies: jest.fn().mockReturnValue({ csrfToken: 'test-csrf-token' }),
  clearAuthCookies: jest.fn(),
  issueCsrfToken: jest.fn().mockReturnValue('test-csrf-token'),
}));

jest.mock('../../lib/superadmin.js', () => ({
  getEngageSuperadmin: jest.fn().mockReturnValue(null),
}));

jest.mock('../../services/tenantLibraryProvisionService.js', () => ({
  scheduleTenantLibraryProvision: jest.fn(),
}));

import { prisma } from '../../config/database.js';
import { tenantMailerSend } from '../../services/tenantMailer.js';
import { setAuthCookies } from '../../utils/authCookies.js';
import { scheduleTenantLibraryProvision } from '../../services/tenantLibraryProvisionService.js';
import signupRoutes from '../tenants/signup.js';
import { errorHandler } from '../../middleware/errorHandler.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/tenants', signupRoutes);
  app.use(errorHandler);
  return app;
}

const SIGNUP_PAYLOAD = {
  subdomain: 'new-practice',
  name: 'New Practice Ltd',
  adminEmail: 'Founder@NewPractice.co.uk',
  adminFirstName: 'Fiona',
  adminLastName: 'Founder',
  adminPassword: 'SuperSecure1!x',
};

const CREATED_TENANT = {
  id: 'tenant-new',
  subdomain: 'new-practice',
  name: 'New Practice Ltd',
  primaryColor: '#0ea5e9',
  settings: null,
};

const CREATED_USER = {
  id: 'user-new',
  email: 'founder@newpractice.co.uk',
  firstName: 'Fiona',
  lastName: 'Founder',
  role: 'PARTNER',
  tenantId: 'tenant-new',
};

describe('POST /api/tenants — public tenant signup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
    txMock.tenant.create.mockResolvedValue(CREATED_TENANT);
    txMock.user.create.mockResolvedValue(CREATED_USER);
  });

  it('creates the admin unverified and returns requiresVerification with no session', async () => {
    const res = await request(buildApp()).post('/api/tenants').send(SIGNUP_PAYLOAD);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true,
      data: {
        requiresVerification: true,
        email: 'founder@newpractice.co.uk',
      },
    });

    // Admin user is created without emailVerified — the login gate holds
    const userData = txMock.user.create.mock.calls[0][0].data;
    expect(userData).not.toHaveProperty('emailVerified');
    expect(userData.email).toBe('founder@newpractice.co.uk');
    expect(userData.role).toBe('PARTNER');

    // Regression: signup must never issue a session any more
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(setAuthCookies).not.toHaveBeenCalled();
    expect(res.body.data.token).toBeUndefined();
    expect(res.body.data.csrfToken).toBeUndefined();

    // Library provisioning still scheduled
    expect(scheduleTenantLibraryProvision).toHaveBeenCalledWith('tenant-new', 'user-new');
  });

  it('sends the verification email via tenantMailerSend with the verify link', async () => {
    await request(buildApp()).post('/api/tenants').send(SIGNUP_PAYLOAD);

    expect(prisma.emailVerification.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-new',
        tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        expiresAt: expect.any(Date),
      },
    });

    expect(tenantMailerSend).toHaveBeenCalledTimes(1);
    const mail = (tenantMailerSend as jest.Mock).mock.calls[0][0];
    expect(mail.tenantId).toBe('tenant-new');
    expect(mail.message.to).toBe('founder@newpractice.co.uk');
    expect(mail.message.subject).toBe('Verify your email — Engage by Capstone');
    expect(mail.message.html).toContain('/verify-email?token=');
    expect(mail.message.html).toContain('New Practice Ltd');
  });

  it('still rejects taken subdomains before creating anything', async () => {
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ id: 'existing' });

    const res = await request(buildApp()).post('/api/tenants').send(SIGNUP_PAYLOAD);

    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('SUBDOMAIN_TAKEN');
    expect(tenantMailerSend).not.toHaveBeenCalled();
  });
});
