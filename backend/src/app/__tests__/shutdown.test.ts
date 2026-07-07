import { drainServer } from '../shutdown.js';

jest.mock('../../config/database.js', () => ({
  prisma: { $disconnect: jest.fn() },
}));

jest.mock('../../utils/cache.js', () => ({
  cache: { disconnect: jest.fn() },
}));

describe('drainServer', () => {
  it('resolves once the server has closed', async () => {
    const close = jest.fn((cb?: (err?: Error) => void) => {
      cb?.();
      return undefined as any;
    });

    await expect(drainServer({ close } as any, 5000)).resolves.toBeUndefined();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('resolves after the timeout when in-flight requests never finish', async () => {
    // close() never invokes its callback — simulates a stuck connection
    const close = jest.fn(() => undefined as any);

    const start = Date.now();
    await expect(drainServer({ close } as any, 30)).resolves.toBeUndefined();
    expect(Date.now() - start).toBeGreaterThanOrEqual(25);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('does not resolve twice if close completes after the timeout', async () => {
    let closeCb: ((err?: Error) => void) | undefined;
    const close = jest.fn((cb?: (err?: Error) => void) => {
      closeCb = cb;
      return undefined as any;
    });

    await drainServer({ close } as any, 20);
    // Late close callback must not throw or double-settle
    expect(() => closeCb?.()).not.toThrow();
  });
});
