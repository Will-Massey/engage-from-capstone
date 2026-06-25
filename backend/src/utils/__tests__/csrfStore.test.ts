import {
  registerCsrfToken,
  isCsrfTokenRegistered,
  revokeCsrfToken,
  isCsrfTokenRegisteredAsync,
} from '../csrfStore.js';

describe('csrfStore', () => {
  it('registers and validates tokens', () => {
    const token = 'test-csrf-token-' + Date.now();
    registerCsrfToken(token);
    expect(isCsrfTokenRegistered(token)).toBe(true);
  });

  it('revokes tokens', () => {
    const token = 'revoke-me-' + Date.now();
    registerCsrfToken(token);
    revokeCsrfToken(token);
    expect(isCsrfTokenRegistered(token)).toBe(false);
  });

  it('rejects unknown tokens', () => {
    expect(isCsrfTokenRegistered('never-registered')).toBe(false);
  });

  it('async check falls back to memory when redis unavailable', async () => {
    const token = 'async-token-' + Date.now();
    registerCsrfToken(token);
    await expect(isCsrfTokenRegisteredAsync(token)).resolves.toBe(true);
  });
});
