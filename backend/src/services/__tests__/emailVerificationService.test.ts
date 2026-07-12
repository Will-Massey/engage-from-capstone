import crypto from 'crypto';

jest.mock('../../config/database.js', () => ({
  prisma: {
    emailVerification: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
    },
  },
}));

jest.mock('../tenantMailer.js', () => ({
  tenantMailerSend: jest.fn().mockResolvedValue({ success: true, messageId: 'msg-1' }),
}));

import { prisma } from '../../config/database.js';
import { tenantMailerSend } from '../tenantMailer.js';
import { emailVerificationService } from '../emailVerificationService.js';

const TEST_USER = {
  id: 'user-1',
  email: 'new@practice.co.uk',
  firstName: 'New',
  tenantId: 'tenant-1',
};

describe('EmailVerificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateToken', () => {
    it('generates a 32-byte hex token with a sha256 hash', () => {
      const { token, tokenHash } = emailVerificationService.generateToken();

      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect(tokenHash).toBe(crypto.createHash('sha256').update(token).digest('hex'));
    });

    it('expires in 24 hours', () => {
      const before = Date.now();
      const { expiresAt } = emailVerificationService.generateToken();
      const after = Date.now();

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(after + 24 * 60 * 60 * 1000);
    });

    it('generates unique tokens', () => {
      const a = emailVerificationService.generateToken();
      const b = emailVerificationService.generateToken();
      expect(a.token).not.toBe(b.token);
      expect(a.tokenHash).not.toBe(b.tokenHash);
    });
  });

  describe('hashToken', () => {
    it('is deterministic and matches generateToken output', () => {
      const { token, tokenHash } = emailVerificationService.generateToken();
      expect(emailVerificationService.hashToken(token)).toBe(tokenHash);
      expect(emailVerificationService.hashToken(token)).toBe(
        emailVerificationService.hashToken(token)
      );
    });
  });

  describe('sendVerificationEmail', () => {
    it('replaces any outstanding token (deleteMany before create)', async () => {
      await emailVerificationService.sendVerificationEmail(TEST_USER, 'Demo Practice');

      const deleteMock = prisma.emailVerification.deleteMany as jest.Mock;
      const createMock = prisma.emailVerification.create as jest.Mock;

      expect(deleteMock).toHaveBeenCalledWith({ where: { userId: TEST_USER.id } });
      expect(createMock).toHaveBeenCalledWith({
        data: {
          userId: TEST_USER.id,
          tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          expiresAt: expect.any(Date),
        },
      });
      expect(deleteMock.mock.invocationCallOrder[0]).toBeLessThan(
        createMock.mock.invocationCallOrder[0]
      );
    });

    it('sends the verification email via tenantMailerSend with the verify link', async () => {
      await emailVerificationService.sendVerificationEmail(TEST_USER, 'Demo Practice');

      expect(tenantMailerSend).toHaveBeenCalledTimes(1);
      const options = (tenantMailerSend as jest.Mock).mock.calls[0][0];
      expect(options.tenantId).toBe(TEST_USER.tenantId);
      expect(options.message.to).toBe(TEST_USER.email);
      expect(options.message.subject).toBe('Verify your email — Engage by Capstone');
      expect(options.message.html).toContain('/verify-email?token=');
      expect(options.message.text).toContain('/verify-email?token=');

      // The plaintext token is emailed; only its hash is stored
      const createArgs = (prisma.emailVerification.create as jest.Mock).mock.calls[0][0];
      expect(options.message.html).not.toContain(createArgs.data.tokenHash);
    });

    it('does not throw when the mailer reports failure', async () => {
      (tenantMailerSend as jest.Mock).mockResolvedValueOnce({
        success: false,
        error: 'no transport',
      });

      await expect(
        emailVerificationService.sendVerificationEmail(TEST_USER)
      ).resolves.toBeUndefined();
    });
  });
});
