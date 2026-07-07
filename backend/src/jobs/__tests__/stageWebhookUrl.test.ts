import { resolveStageWebhookUrl } from '../../jobs/touchpointEngine.js';

jest.mock('../../config/database.js', () => ({
  prisma: {},
}));

describe('resolveStageWebhookUrl', () => {
  it('prefers the TOUCHPOINT_WEBHOOK_URL env var over tenant settings', () => {
    const settings = JSON.stringify({ touchpointWebhookUrl: 'https://tenant.example/hook' });
    expect(resolveStageWebhookUrl('https://env.example/hook', settings)).toBe(
      'https://env.example/hook'
    );
  });

  it('falls back to the tenant settings URL when no env var is set', () => {
    const settings = JSON.stringify({ touchpointWebhookUrl: 'https://tenant.example/hook' });
    expect(resolveStageWebhookUrl(undefined, settings)).toBe('https://tenant.example/hook');
  });

  it('treats an empty env var as unset', () => {
    const settings = JSON.stringify({ touchpointWebhookUrl: 'https://tenant.example/hook' });
    expect(resolveStageWebhookUrl('', settings)).toBe('https://tenant.example/hook');
  });

  it('returns null when neither is configured', () => {
    expect(resolveStageWebhookUrl(undefined, JSON.stringify({}))).toBeNull();
    expect(resolveStageWebhookUrl(undefined, null)).toBeNull();
    expect(resolveStageWebhookUrl(undefined, undefined)).toBeNull();
  });

  it('returns null for malformed tenant settings JSON', () => {
    expect(resolveStageWebhookUrl(undefined, 'not-json{')).toBeNull();
  });
});
