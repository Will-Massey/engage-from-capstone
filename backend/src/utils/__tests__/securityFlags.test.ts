/**
 * isE2eTestRequest — production must ignore the plain X-Test-Mode header
 * unless X-Test-Mode-Secret matches E2E_BYPASS_SECRET (SECURITY_TODO P0 #6).
 */

const ORIGINAL_ENV = { ...process.env };

function loadFlags(overrides: Record<string, string | undefined>) {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV, ...overrides } as NodeJS.ProcessEnv;
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
  }
  // require() (not import) so jest.resetModules() re-evaluates env-dependent flags
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../securityFlags.js') as typeof import('../securityFlags.js');
}

afterAll(() => {
  process.env = ORIGINAL_ENV as NodeJS.ProcessEnv;
});

describe('isE2eTestRequest', () => {
  it('returns false without the X-Test-Mode header', () => {
    const flags = loadFlags({ NODE_ENV: 'development' });
    expect(flags.isE2eTestRequest({})).toBe(false);
    expect(flags.isE2eTestRequest({ 'x-test-mode': 'something-else' })).toBe(false);
  });

  it('allows e2e/e2e-build headers outside production', () => {
    const flags = loadFlags({ NODE_ENV: 'development' });
    expect(flags.isE2eTestRequest({ 'x-test-mode': 'e2e' })).toBe(true);
    expect(flags.isE2eTestRequest({ 'x-test-mode': 'e2e-build' })).toBe(true);
  });

  it('ignores the header in production when E2E_BYPASS_SECRET is unset', () => {
    const flags = loadFlags({ NODE_ENV: 'production', E2E_BYPASS_SECRET: undefined });
    expect(flags.isE2eTestRequest({ 'x-test-mode': 'e2e' })).toBe(false);
    expect(flags.isE2eTestRequest({ 'x-test-mode': 'e2e-build' })).toBe(false);
  });

  it('rejects missing or wrong secret in production', () => {
    const flags = loadFlags({ NODE_ENV: 'production', E2E_BYPASS_SECRET: 'top-secret-value' });
    expect(flags.isE2eTestRequest({ 'x-test-mode': 'e2e' })).toBe(false);
    expect(
      flags.isE2eTestRequest({ 'x-test-mode': 'e2e', 'x-test-mode-secret': 'wrong' })
    ).toBe(false);
  });

  it('allows bypass in production only with the matching secret', () => {
    const flags = loadFlags({ NODE_ENV: 'production', E2E_BYPASS_SECRET: 'top-secret-value' });
    expect(
      flags.isE2eTestRequest({ 'x-test-mode': 'e2e', 'x-test-mode-secret': 'top-secret-value' })
    ).toBe(true);
    expect(
      flags.isE2eTestRequest({
        'x-test-mode': 'e2e-build',
        'x-test-mode-secret': 'top-secret-value',
      })
    ).toBe(true);
  });
});
