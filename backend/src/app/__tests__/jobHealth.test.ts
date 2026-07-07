import { trackJobRun, getJobHealth, resetJobHealth } from '../jobHealth.js';

describe('job health registry', () => {
  beforeEach(() => {
    resetJobHealth();
  });

  it('starts empty', () => {
    expect(getJobHealth()).toEqual({});
  });

  it('records lastRunAt and lastSuccessAt on success', async () => {
    await trackJobRun('renewalReminders', async () => 'ok');

    const health = getJobHealth();
    expect(health.renewalReminders.lastRunAt).toEqual(expect.any(String));
    expect(health.renewalReminders.lastSuccessAt).toEqual(expect.any(String));
    expect(health.renewalReminders.lastError).toBeNull();
  });

  it('records lastError and re-throws on failure, preserving lastSuccessAt', async () => {
    await trackJobRun('touchpointEngine', async () => 'ok');
    const successAt = getJobHealth().touchpointEngine.lastSuccessAt;

    await expect(
      trackJobRun('touchpointEngine', async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    const health = getJobHealth();
    expect(health.touchpointEngine.lastError).toBe('boom');
    expect(health.touchpointEngine.lastSuccessAt).toBe(successAt);
    expect(health.touchpointEngine.lastRunAt).toEqual(expect.any(String));
  });

  it('clears lastError after a subsequent success', async () => {
    await expect(
      trackJobRun('emailAutomation', async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    await trackJobRun('emailAutomation', async () => 'ok');

    expect(getJobHealth().emailAutomation.lastError).toBeNull();
  });

  it('stringifies non-Error failures', async () => {
    await expect(
      trackJobRun('proposalChase', async () => {
        return Promise.reject('string failure');
      })
    ).rejects.toBe('string failure');

    expect(getJobHealth().proposalChase.lastError).toBe('string failure');
  });

  it('returns snapshots, not live registry references', async () => {
    await trackJobRun('renewalReminders', async () => 'ok');
    const snapshot = getJobHealth();
    snapshot.renewalReminders.lastError = 'mutated';

    expect(getJobHealth().renewalReminders.lastError).toBeNull();
  });
});
