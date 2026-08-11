import {
  encryptTenantEmailSettingsForSave,
  type TenantEmailSettings,
} from '../tenantEmailSettings';
import { encrypt, decryptObject } from '../../utils/encryption';

/**
 * A connected Microsoft 365 mailbox used to die whenever anything else on the
 * email settings route was saved. The route reads the stored (encrypted)
 * settings, passes them in as `existing`, and the merge then re-encrypted the
 * whole provider block, turning refreshToken into E(E(token)). Reading it back
 * decrypts once and yields the inner ciphertext, so every token refresh failed
 * while getMailboxConnection() still reported the practice as connected,
 * because it only tests the field for truthiness.
 *
 * The SMTP panel triggered it without sending a single OAuth field, which is
 * why these assert the round trip rather than the shape of the stored value.
 */
describe('encryptTenantEmailSettingsForSave and OAuth secrets', () => {
  const storedOutlook = (): TenantEmailSettings => ({
    provider: 'outlook',
    useCustomEmail: true,
    outlook: {
      clientId: 'client-id',
      clientSecret: encrypt('the-client-secret'),
      refreshToken: encrypt('the-refresh-token'),
      user: 'practice@example.co.uk',
    },
  });

  it('leaves a stored refresh token decryptable when the save sends no OAuth fields', () => {
    const existing = storedOutlook();

    // Exactly what the SMTP "advanced" panel sends: no outlook block at all.
    const saved = encryptTenantEmailSettingsForSave(
      {
        provider: 'smtp',
        fromName: 'Example Practice',
        fromEmail: 'hello@example.co.uk',
        useCustomEmail: true,
      },
      existing
    );

    const decrypted = decryptObject(saved.outlook as unknown as Record<string, string>);
    expect(decrypted.refreshToken).toBe('the-refresh-token');
    expect(decrypted.clientSecret).toBe('the-client-secret');
  });

  it('survives repeated saves rather than degrading one encryption layer at a time', () => {
    let settings = storedOutlook();

    for (let i = 0; i < 3; i++) {
      settings = encryptTenantEmailSettingsForSave(
        { provider: 'outlook', fromName: `Save ${i}`, useCustomEmail: true },
        settings
      );
    }

    const decrypted = decryptObject(settings.outlook as unknown as Record<string, string>);
    expect(decrypted.refreshToken).toBe('the-refresh-token');
  });

  it('encrypts a newly supplied refresh token', () => {
    const saved = encryptTenantEmailSettingsForSave(
      {
        provider: 'gmail',
        useCustomEmail: true,
        gmail: {
          clientId: 'gmail-client',
          clientSecret: 'fresh-secret',
          refreshToken: 'fresh-token',
          user: 'practice@example.co.uk',
        },
      },
      {}
    );

    expect(saved.gmail?.refreshToken).not.toBe('fresh-token');
    const decrypted = decryptObject(saved.gmail as unknown as Record<string, string>);
    expect(decrypted.refreshToken).toBe('fresh-token');
    // Non-secret fields stay readable.
    expect(saved.gmail?.user).toBe('practice@example.co.uk');
  });

  it('replaces a stored token when the practice reconnects with a new one', () => {
    const saved = encryptTenantEmailSettingsForSave(
      {
        provider: 'outlook',
        useCustomEmail: true,
        outlook: {
          clientId: 'client-id',
          clientSecret: 'rotated-secret',
          refreshToken: 'rotated-token',
          user: 'practice@example.co.uk',
        },
      },
      storedOutlook()
    );

    const decrypted = decryptObject(saved.outlook as unknown as Record<string, string>);
    expect(decrypted.refreshToken).toBe('rotated-token');
    expect(decrypted.clientSecret).toBe('rotated-secret');
  });
});
