import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('appRelativePath', () => {
  const originalBase = import.meta.env.VITE_APP_BASE;

  beforeEach(() => {
    vi.stubEnv('VITE_APP_BASE', '/engage');
  });

  afterEach(() => {
    vi.stubEnv('VITE_APP_BASE', originalBase);
  });

  it('strips /engage prefix from login path', async () => {
    const { appRelativePath } = await import('../appBase');
    expect(appRelativePath('/engage/login')).toBe('/login');
  });

  it('maps /engage root to /', async () => {
    const { appRelativePath } = await import('../appBase');
    expect(appRelativePath('/engage')).toBe('/');
    expect(appRelativePath('/engage/')).toBe('/');
  });
});