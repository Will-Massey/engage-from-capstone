/**
 * R4.1 — real QuickBooks OAuth: token exchange / refresh / revoke request
 * construction (mocked fetch), API base sandbox switch, consent URL.
 */

const getTenantQuickBooksSettings = jest.fn();
const saveTenantQuickBooksSettings = jest.fn(async (..._args: unknown[]) => undefined);
const isQuickBooksOAuthConfigured = jest.fn(() => true);

jest.mock('../../services/tenantQuickbooksSettings.js', () => ({
  getTenantQuickBooksSettings: (...args: unknown[]) => getTenantQuickBooksSettings(...args),
  saveTenantQuickBooksSettings: (...args: unknown[]) => saveTenantQuickBooksSettings(...args),
  isQuickBooksOAuthConfigured: () => isQuickBooksOAuthConfigured(),
}));
jest.mock('../../utils/logger.js', () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import {
  buildQuickBooksConsentUrl,
  completeQuickBooksOAuth,
  getAuthenticatedQuickBooksSession,
  getQuickBooksApiBase,
  revokeQuickBooksConnection,
} from '../quickbooksService.js';

const fetchMock = jest.fn();
const expectedBasic = `Basic ${Buffer.from('qb-client-id:qb-client-secret').toString('base64')}`;

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.QUICKBOOKS_CLIENT_ID = 'qb-client-id';
  process.env.QUICKBOOKS_CLIENT_SECRET = 'qb-client-secret';
  process.env.QUICKBOOKS_REDIRECT_URI = 'https://app.example/api/oauth/callback/quickbooks';
  delete process.env.QUICKBOOKS_SANDBOX;
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('getQuickBooksApiBase', () => {
  it('defaults to sandbox and switches to production on QUICKBOOKS_SANDBOX=false', () => {
    expect(getQuickBooksApiBase()).toBe('https://sandbox-quickbooks.api.intuit.com');
    process.env.QUICKBOOKS_SANDBOX = 'true';
    expect(getQuickBooksApiBase()).toBe('https://sandbox-quickbooks.api.intuit.com');
    process.env.QUICKBOOKS_SANDBOX = 'false';
    expect(getQuickBooksApiBase()).toBe('https://quickbooks.api.intuit.com');
  });
});

describe('buildQuickBooksConsentUrl', () => {
  it('builds the appcenter authorize URL (same host for sandbox and production)', () => {
    const url = new URL(buildQuickBooksConsentUrl('state-1'));
    expect(url.origin + url.pathname).toBe('https://appcenter.intuit.com/connect/oauth2');
    expect(url.searchParams.get('client_id')).toBe('qb-client-id');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://app.example/api/oauth/callback/quickbooks'
    );
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('com.intuit.quickbooks.accounting');
    expect(url.searchParams.get('state')).toBe('state-1');
  });
});

describe('completeQuickBooksOAuth', () => {
  it('exchanges the code with Basic auth + form body and persists real tokens', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600 })
      )
      .mockResolvedValueOnce(jsonResponse({ CompanyInfo: { CompanyName: 'Acme Books Ltd' } }));

    const settings = await completeQuickBooksOAuth({
      tenantId: 't1',
      userId: 'u1',
      code: 'auth-code-9',
      realmId: 'realm-9',
    });

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer');
    expect(tokenInit.method).toBe('POST');
    expect(tokenInit.headers.Authorization).toBe(expectedBasic);
    expect(tokenInit.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const body = new URLSearchParams(tokenInit.body);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('auth-code-9');
    expect(body.get('redirect_uri')).toBe('https://app.example/api/oauth/callback/quickbooks');

    // Company info fetched from the sandbox API base with the new access token
    const [companyUrl, companyInit] = fetchMock.mock.calls[1];
    expect(companyUrl).toBe(
      'https://sandbox-quickbooks.api.intuit.com/v3/company/realm-9/companyinfo/realm-9?minorversion=75'
    );
    expect(companyInit.headers.Authorization).toBe('Bearer at-1');

    expect(settings.connected).toBe(true);
    expect(settings.realmId).toBe('realm-9');
    expect(settings.companyName).toBe('Acme Books Ltd');
    expect(settings.refreshToken).toBe('rt-1');
    expect(settings.accessToken).toBe('at-1');
    expect(saveTenantQuickBooksSettings).toHaveBeenCalledWith('t1', settings);
  });

  it('rejects when the callback has no realmId', async () => {
    await expect(
      completeQuickBooksOAuth({ tenantId: 't1', userId: 'u1', code: 'c' })
    ).rejects.toThrow('realmId');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces token endpoint failures', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'invalid_grant' }, false, 400));
    await expect(
      completeQuickBooksOAuth({ tenantId: 't1', userId: 'u1', code: 'bad', realmId: 'r' })
    ).rejects.toThrow('Intuit token request failed (400)');
  });
});

describe('getAuthenticatedQuickBooksSession', () => {
  const baseSettings = {
    connected: true,
    realmId: 'realm-1',
    refreshToken: 'rt-old',
    accessToken: 'at-old',
    connectedAt: new Date().toISOString(),
  };

  it('returns the stored token when not near expiry', async () => {
    getTenantQuickBooksSettings.mockResolvedValue({
      ...baseSettings,
      tokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });

    const session = await getAuthenticatedQuickBooksSession('t1');
    expect(session.accessToken).toBe('at-old');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes with grant_type=refresh_token when within the 60s skew', async () => {
    getTenantQuickBooksSettings.mockResolvedValue({
      ...baseSettings,
      tokenExpiresAt: new Date(Date.now() + 30_000).toISOString(), // < 60s left
    });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ access_token: 'at-new', refresh_token: 'rt-new', expires_in: 3600 })
    );

    const session = await getAuthenticatedQuickBooksSession('t1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer');
    expect(init.headers.Authorization).toBe(expectedBasic);
    const body = new URLSearchParams(init.body);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('rt-old');

    expect(session.accessToken).toBe('at-new');
    expect(saveTenantQuickBooksSettings).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ accessToken: 'at-new', refreshToken: 'rt-new' })
    );
  });

  it('throws when the tenant is not connected', async () => {
    getTenantQuickBooksSettings.mockResolvedValue(null);
    await expect(getAuthenticatedQuickBooksSession('t1')).rejects.toThrow('not connected');
  });
});

describe('revokeQuickBooksConnection', () => {
  it('POSTs the refresh token to the Intuit revoke endpoint with Basic auth', async () => {
    getTenantQuickBooksSettings.mockResolvedValue({
      connected: true,
      realmId: 'r',
      refreshToken: 'rt-1',
      connectedAt: new Date().toISOString(),
    });
    fetchMock.mockResolvedValueOnce(jsonResponse({}));

    await revokeQuickBooksConnection('t1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://developer.api.intuit.com/v2/oauth2/tokens/revoke');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(expectedBasic);
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ token: 'rt-1' });
  });

  it('is a no-op without a stored connection and swallows network errors', async () => {
    getTenantQuickBooksSettings.mockResolvedValue(null);
    await revokeQuickBooksConnection('t1');
    expect(fetchMock).not.toHaveBeenCalled();

    getTenantQuickBooksSettings.mockResolvedValue({
      connected: true,
      refreshToken: 'rt-1',
      connectedAt: new Date().toISOString(),
    });
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(revokeQuickBooksConnection('t1')).resolves.toBeUndefined();
  });
});
