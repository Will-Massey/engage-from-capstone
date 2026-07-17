/**
 * The encryption module validates ENCRYPTION_KEY at import time, so each case
 * loads it in isolation with a controlled environment.
 */
describe('encryption key guard', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  const loadModule = () =>
    jest.isolateModulesAsync(async () => {
      await import('../encryption.js');
    });

  it('throws in production when ENCRYPTION_KEY is shorter than 32 chars', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ENCRYPTION_KEY = 'too-short';
    await expect(loadModule()).rejects.toThrow(/at least 32 characters/i);
  });

  it('throws in production when ENCRYPTION_KEY is missing', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ENCRYPTION_KEY;
    await expect(loadModule()).rejects.toThrow(/required in production/i);
  });

  it('accepts a sufficiently long key in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ENCRYPTION_KEY = 'a'.repeat(32);
    await expect(loadModule()).resolves.toBeUndefined();
  });

  it('allows a short/absent key outside production (ephemeral dev key)', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.ENCRYPTION_KEY;
    await expect(loadModule()).resolves.toBeUndefined();
  });
});
