/**
 * A connected mailbox must never be able to take a tenant's email offline.
 *
 * tenantMailerSend already falls back to the platform transport when the custom
 * send *returns* failure. It did not when the custom send *threw* — and throwing
 * is the realistic failure: the Microsoft transport builds its token inside
 * EmailService.createReady(), so an expired grant, a revoked consent or a
 * refused scope raises before a single byte is sent. That throw escaped
 * tenantMailerSend entirely, so the fallback below it never ran and the
 * EmailLog row stayed QUEUED for ever.
 */
const prismaMock = {
  emailLog: { create: jest.fn(), update: jest.fn() },
  emailSuppression: { findFirst: jest.fn() },
};

jest.mock('../../config/database.js', () => ({ prisma: prismaMock }));

const loadTenantEmailContextMock = jest.fn();
const isCustomEmailConfiguredMock = jest.fn();
const tenantEmailToConfigMock = jest.fn();
jest.mock('../tenantEmailSettings.js', () => ({
  loadTenantEmailContext: (...args: unknown[]) => loadTenantEmailContextMock(...args),
  isCustomEmailConfigured: (...args: unknown[]) => isCustomEmailConfiguredMock(...args),
  tenantEmailToConfig: (...args: unknown[]) => tenantEmailToConfigMock(...args),
  resolveReplyToEmail: jest.fn().mockResolvedValue('reply@practice.test'),
}));

const isSendGridConfiguredMock = jest.fn();
const sendViaSendGridMock = jest.fn();
jest.mock('../sendgridTransport.js', () => ({
  isSendGridConfigured: (...args: unknown[]) => isSendGridConfiguredMock(...args),
  sendViaSendGrid: (...args: unknown[]) => sendViaSendGridMock(...args),
  getPlatformFromAddress: () => ({ email: 'proposals@capstonesoftware.co.uk', name: 'Capstone' }),
}));

const createReadyMock = jest.fn();
jest.mock('../emailService.js', () => ({
  EmailService: { createReady: (...args: unknown[]) => createReadyMock(...args) },
}));

import { tenantMailerSend } from '../tenantMailer.js';

describe('tenantMailerSend — custom transport failure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.emailSuppression.findFirst.mockResolvedValue(null);
    prismaMock.emailLog.create.mockResolvedValue({ id: 'log-1' });
    prismaMock.emailLog.update.mockResolvedValue({});
    loadTenantEmailContextMock.mockResolvedValue({
      tenantId: 't1',
      tenantName: 'Fortis Accountancy',
      email: { provider: 'microsoft365', outlook: { user: 'caroline@fortisaccounts.com' } },
    });
    isCustomEmailConfiguredMock.mockReturnValue(true);
    tenantEmailToConfigMock.mockReturnValue({
      provider: 'microsoft365',
      fromEmail: 'caroline@fortisaccounts.com',
      fromName: 'Fortis Accountancy',
    });
    isSendGridConfiguredMock.mockReturnValue(true);
    sendViaSendGridMock.mockResolvedValue({ success: true, messageId: 'platform-1' });
  });

  const send = () =>
    tenantMailerSend({
      tenantId: 't1',
      messageType: 'PROPOSAL',
      message: { to: 'client@example.com', subject: 'Your proposal', html: '<p>hi</p>' },
    });

  it('falls back to the platform transport when the custom transport throws', async () => {
    createReadyMock.mockRejectedValue(new Error('Outlook token refresh failed: 400 Bad Request'));

    const result = await send();

    expect(sendViaSendGridMock).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.provider).toBe('CLOUDFLARE');
  });

  it('records the failure instead of leaving the log QUEUED when there is no fallback', async () => {
    createReadyMock.mockRejectedValue(new Error('Outlook token refresh failed: 400 Bad Request'));
    isSendGridConfiguredMock.mockReturnValue(false);

    const result = await send();

    expect(result.success).toBe(false);
    expect(prismaMock.emailLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'log-1' },
        data: expect.objectContaining({ status: 'FAILED' }),
      })
    );
  });

  it('surfaces the underlying transport error so the cause is diagnosable', async () => {
    createReadyMock.mockRejectedValue(new Error('Outlook token refresh failed: 400 Bad Request'));
    isSendGridConfiguredMock.mockReturnValue(false);

    const result = await send();

    expect(result.error).toContain('Outlook token refresh failed');
  });

  // The transport is memoised so every send does not re-mint a token. Memoising
  // the *promise* meant a rejected one was cached too: one transient failure
  // pinned the tenant to the platform fallback until the next deploy, however
  // long the real cause lasted.
  it('retries the custom transport after a failure rather than caching the rejection', async () => {
    createReadyMock.mockRejectedValueOnce(new Error('Outlook token refresh failed: 503'));
    await send();

    createReadyMock.mockResolvedValueOnce({
      sendEmail: jest.fn().mockResolvedValue({ success: true, messageId: 'graph-1' }),
    });
    const result = await send();

    expect(createReadyMock).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
    expect(result.provider).toBe('MICROSOFT365');
  });
});
