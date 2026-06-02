import {
  parseSubdomainFromHost,
  resolveTenantForRequest,
} from '../src/middleware/tenant.js';
import type { Request } from 'express';

describe('parseSubdomainFromHost', () => {
  it('returns null for localhost and platform hosts', () => {
    expect(parseSubdomainFromHost('localhost:3001')).toBeNull();
    expect(parseSubdomainFromHost('127.0.0.1')).toBeNull();
    expect(parseSubdomainFromHost('engage-backend-e1ue.onrender.com')).toBeNull();
    expect(parseSubdomainFromHost('app.up.railway.app')).toBeNull();
  });

  it('extracts subdomain from custom domains', () => {
    expect(parseSubdomainFromHost('smith.engage.capstonesoftware.co.uk')).toBe(
      'smith'
    );
    expect(parseSubdomainFromHost('demo.engage.capstonesoftware.co.uk')).toBe(
      'demo'
    );
  });

  it('ignores reserved first labels', () => {
    expect(parseSubdomainFromHost('www.engage.capstonesoftware.co.uk')).toBeNull();
    expect(parseSubdomainFromHost('api.engage.capstonesoftware.co.uk')).toBeNull();
  });
});

describe('resolveTenantForRequest', () => {
  it('prefers X-Tenant-Id header over subdomain', async () => {
    const { prisma } = await import('../src/config/database.js');
    const findSpy = jest
      .spyOn(prisma.tenant, 'findFirst')
      .mockResolvedValueOnce({
        id: 'tenant-uuid',
        subdomain: 'acme',
        name: 'Acme',
        isActive: true,
      } as any);

    const req = {
      headers: {
        'x-tenant-id': 'tenant-uuid',
        host: 'other.engage.capstonesoftware.co.uk',
      },
      query: {},
    } as unknown as Request;

    const tenant = await resolveTenantForRequest(req);
    expect(tenant?.id).toBe('tenant-uuid');
    expect(findSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tenant-uuid', isActive: true },
      })
    );

    findSpy.mockRestore();
  });
});
