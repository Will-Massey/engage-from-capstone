/**
 * The stored mailbox identity must be the MAILBOX, never the operator's login.
 *
 * Found 2026-08-11 after the first real Microsoft 365 connect: the auth URL does
 * not request `openid`, so Microsoft returns no id_token, so the address came
 * back undefined and `saveOAuthTokens` substituted the logged-in Engage user
 * (`admin@demo.practice`). That value is not cosmetic — `isCustomEmailConfigured`
 * requires clientId + refreshToken + user, so a fabricated address flips tenant
 * email onto smtp.office365.com authenticating as an address that does not exist
 * in the M365 tenant. With no SENDGRID_API_KEY there is no fallback, so every
 * proposal, document request and chase for that tenant would fail to send.
 *
 * Storing nothing is the safe failure: isCustomEmailConfigured stays false,
 * tenant email keeps using the working platform path, and the Graph/Gmail sync
 * does not need `user` at all.
 */
const prismaMock = {
  tenant: { findUnique: jest.fn(), update: jest.fn() },
};
jest.mock('../../config/database.js', () => ({ prisma: prismaMock }));

jest.mock('../../utils/encryption.js', () => ({
  encrypt: (v: string) => `enc(${v})`,
}));

import { saveOAuthTokens } from '../oauthCallback.js';

function storedEmailSettings(): Record<string, any> {
  const arg = prismaMock.tenant.update.mock.calls[0][0];
  return JSON.parse(arg.data.settings).email;
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.tenant.findUnique.mockResolvedValue({ settings: '{}' });
  prismaMock.tenant.update.mockResolvedValue({});
});

describe('saveOAuthTokens — mailbox identity', () => {
  it('stores the address the provider reported for the mailbox', async () => {
    await saveOAuthTokens(
      't1',
      'microsoft365',
      { refreshToken: 'r1', accessToken: 'a1', user: 'practice@firm.co.uk' },
      'operator@engage-login.test'
    );

    expect(storedEmailSettings().outlook.user).toBe('practice@firm.co.uk');
  });

  it('stores NO address when the provider did not report one, rather than the operator login', async () => {
    await saveOAuthTokens(
      't1',
      'microsoft365',
      { refreshToken: 'r1', accessToken: 'a1' }, // no user resolved
      'operator@engage-login.test'
    );

    const outlook = storedEmailSettings().outlook;
    // The operator's Engage login is NOT the mailbox and must never stand in for it.
    expect(outlook.user).not.toBe('operator@engage-login.test');
    expect(outlook.user ?? null).toBeNull();
  });

  it('applies the same rule to gmail', async () => {
    await saveOAuthTokens(
      't1',
      'gmail',
      { refreshToken: 'r1', accessToken: 'a1' },
      'operator@engage-login.test'
    );

    expect(storedEmailSettings().gmail.user ?? null).toBeNull();
  });
});
