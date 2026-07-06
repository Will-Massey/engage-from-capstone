import {
  LOGIN_LOCKOUT_MAX,
  recordFailedLogin,
  isLoginLocked,
  clearLoginAttempts,
} from '../loginLockout.js';

describe('loginLockout (memory)', () => {
  const email = 'lockout-test@example.com';
  const tenantId = 'tenant-memory-test';

  beforeEach(async () => {
    await clearLoginAttempts(email, tenantId);
  });

  it('locks after max failed attempts using memory store', async () => {
    for (let i = 0; i < LOGIN_LOCKOUT_MAX; i++) {
      await recordFailedLogin(email, tenantId);
    }
    await expect(isLoginLocked(email, tenantId)).resolves.toBe(true);
  });
});
