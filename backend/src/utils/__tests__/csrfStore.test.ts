import { registerCsrfToken, isCsrfTokenRegistered, revokeCsrfToken } from '../csrfStore.js';

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
});
