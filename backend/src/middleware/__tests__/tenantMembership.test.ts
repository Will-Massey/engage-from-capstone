import { validateTenantMembership } from '../tenant.js';

describe('validateTenantMembership', () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const next = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects when user tenant does not match request tenant', () => {
    const req = {
      user: { tenantId: 'tenant-a' },
      tenantId: 'tenant-b',
    } as any;

    validateTenantMembership(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows when tenant matches', () => {
    const req = {
      user: { tenantId: 'tenant-a' },
      tenantId: 'tenant-a',
    } as any;

    validateTenantMembership(req, res as any, next);

    expect(next).toHaveBeenCalled();
  });
});
