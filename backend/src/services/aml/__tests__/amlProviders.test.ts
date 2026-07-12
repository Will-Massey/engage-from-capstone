/**
 * R2.1 provider refactor — resolution order and exact request construction
 * must match the pre-refactor amlService behaviour (payloads, URLs, headers,
 * error messages).
 */

import {
  creditsafeProvider,
  resolveAmlCheckProvider,
  smartsearchProvider,
  stubProvider,
  AmlPartnerApiError,
} from '../providers/index.js';

const ENV_KEYS = [
  'SMARTSEARCH_API_KEY',
  'SMARTSEARCH_API_URL',
  'SMARTSEARCH_SANDBOX',
  'CREDITSAFE_API_KEY',
  'CREDITSAFE_API_URL',
] as const;

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  jest.restoreAllMocks();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

function mockFetchResponse(status: number, body: unknown) {
  const response = {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
  const fetchMock = jest.fn(async () => response);
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const client = {
  id: 'client-1',
  name: 'Acme Ltd',
  contactName: 'Jane Doe',
  contactEmail: 'jane@acme.test',
  amlSubmissionData: JSON.stringify({
    fullLegalName: 'Jane Alexandra Doe',
    dateOfBirth: '1990-01-01',
    registeredAddress: '1 High Street, London',
    nationality: 'British',
  }),
};

const webhookUrl = 'https://api.example.test/api/aml/webhook';

describe('resolveAmlCheckProvider', () => {
  it('returns the requested provider when configured', () => {
    process.env.SMARTSEARCH_API_KEY = 'sk_ss';
    process.env.CREDITSAFE_API_KEY = 'sk_cs';
    expect(resolveAmlCheckProvider('creditsafe')).toBe(creditsafeProvider);
    expect(resolveAmlCheckProvider('smartsearch')).toBe(smartsearchProvider);
  });

  it('falls back to the first configured provider when the requested one is not configured', () => {
    process.env.SMARTSEARCH_API_KEY = 'sk_ss';
    expect(resolveAmlCheckProvider('creditsafe')).toBe(smartsearchProvider);
  });

  it('returns the stub when nothing is configured', () => {
    expect(resolveAmlCheckProvider()).toBe(stubProvider);
    expect(resolveAmlCheckProvider('smartsearch')).toBe(stubProvider);
  });

  it('honours an explicit stub request even when partners are configured', () => {
    process.env.SMARTSEARCH_API_KEY = 'sk_ss';
    expect(resolveAmlCheckProvider('stub')).toBe(stubProvider);
  });
});

describe('smartsearchProvider.submitCheck', () => {
  it('posts the identity-verification payload with auth headers', async () => {
    process.env.SMARTSEARCH_API_KEY = 'sk_ss';
    process.env.SMARTSEARCH_API_URL = 'https://ss.example.test';
    const fetchMock = mockFetchResponse(200, { id: 'ss_check_1' });

    const result = await smartsearchProvider.submitCheck({
      ref: 'smartsearch_abc123',
      client,
      webhookUrl,
    });

    expect(result.providerRef).toBe('ss_check_1');
    expect(result.message).toBe('AML check submitted to SmartSearch. Await webhook confirmation.');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://ss.example.test/v2/identity-verifications');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({
      Authorization: 'Bearer sk_ss',
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Request-Id': 'smartsearch_abc123',
    });
    expect(JSON.parse(String(options.body))).toEqual({
      reference: 'smartsearch_abc123',
      callback_url: webhookUrl,
      individual: {
        forename: 'Jane',
        surname: 'Alexandra Doe',
        date_of_birth: '1990-01-01',
        address: '1 High Street, London',
        nationality: 'British',
        email: 'jane@acme.test',
      },
      metadata: {
        client_id: 'client-1',
        client_name: 'Acme Ltd',
      },
    });
  });

  it('defaults to the sandbox URL and throws AmlPartnerApiError on failure', async () => {
    process.env.SMARTSEARCH_API_KEY = 'sk_ss';
    const fetchMock = mockFetchResponse(402, { message: 'Insufficient credit' });

    await expect(
      smartsearchProvider.submitCheck({ ref: 'smartsearch_x', client, webhookUrl })
    ).rejects.toMatchObject({
      name: 'AmlPartnerApiError',
      message: 'Insufficient credit',
      provider: 'smartsearch',
      statusCode: 402,
    });

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe('https://sandbox-api.smartsearch.com/v2/identity-verifications');
  });
});

describe('creditsafeProvider.submitCheck', () => {
  it('posts the compliance payload with auth headers', async () => {
    process.env.CREDITSAFE_API_KEY = 'sk_cs';
    process.env.CREDITSAFE_API_URL = 'https://cs.example.test/v1';
    const fetchMock = mockFetchResponse(201, { checkId: 'cs_check_9' });

    const result = await creditsafeProvider.submitCheck({
      ref: 'creditsafe_def456',
      client,
      webhookUrl,
    });

    expect(result.providerRef).toBe('cs_check_9');
    expect(result.message).toBe('AML check submitted to Creditsafe. Await webhook confirmation.');

    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://cs.example.test/v1/compliance/aml-checks');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({
      Authorization: 'Bearer sk_cs',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
    expect(JSON.parse(String(options.body))).toEqual({
      reference: 'creditsafe_def456',
      webhookUrl,
      person: {
        firstName: 'Jane',
        lastName: 'Alexandra Doe',
        dateOfBirth: '1990-01-01',
        address: '1 High Street, London',
        nationality: 'British',
        email: 'jane@acme.test',
      },
      externalReference: 'client-1',
    });
  });

  it('throws AmlPartnerApiError with the API status message on failure', async () => {
    process.env.CREDITSAFE_API_KEY = 'sk_cs';
    mockFetchResponse(500, {});

    await expect(
      creditsafeProvider.submitCheck({ ref: 'creditsafe_x', client, webhookUrl })
    ).rejects.toMatchObject({
      message: 'Creditsafe API returned 500',
      provider: 'creditsafe',
      statusCode: 500,
    });
  });

  it('falls back to name splitting when there is no submission data', async () => {
    process.env.CREDITSAFE_API_KEY = 'sk_cs';
    const fetchMock = mockFetchResponse(200, { checkId: 'cs_1' });

    await creditsafeProvider.submitCheck({
      ref: 'creditsafe_y',
      client: { ...client, amlSubmissionData: null, contactName: 'Bob' },
      webhookUrl,
    });

    const [, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(options.body));
    expect(body.person.firstName).toBe('Bob');
    expect(body.person.lastName).toBe('Bob');
  });
});

describe('stubProvider', () => {
  it('is always configured and echoes the local reference', async () => {
    expect(stubProvider.isConfigured()).toBe(true);
    const result = await stubProvider.submitCheck({ ref: 'stub_123', client, webhookUrl });
    expect(result.providerRef).toBe('stub_123');
    expect(result.message).toContain('demo mode');
  });
});

describe('AmlPartnerApiError', () => {
  it('exposes provider and status code', () => {
    const err = new AmlPartnerApiError('boom', 'smartsearch', 418);
    expect(err.provider).toBe('smartsearch');
    expect(err.statusCode).toBe(418);
  });
});
