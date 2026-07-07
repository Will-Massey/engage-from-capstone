import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type MockAdapterType from 'axios-mock-adapter';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';

const authMocks = vi.hoisted(() => ({
  clearAuth: vi.fn(),
  token: 'test-jwt' as string | null,
  tenant: {
    id: 'tenant-1',
    name: 'Test Firm',
    subdomain: 'test',
    primaryColor: '#000000',
    settings: { defaultCurrency: 'GBP' },
  } as {
    id: string;
    name: string;
    subdomain: string;
    primaryColor: string;
    settings: { defaultCurrency: string };
  } | null,
}));

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../../stores/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      token: authMocks.token,
      tenant: authMocks.tenant,
      clearAuth: authMocks.clearAuth,
    }),
  },
}));

type ApiModule = typeof import('../api');

function getHeader(config: AxiosRequestConfig, name: string): string | undefined {
  const headers = (config.headers ?? {}) as {
    get?: (key: string) => string | undefined;
    [key: string]: unknown;
  };
  if (typeof headers.get === 'function') {
    return headers.get(name);
  }
  const direct = headers[name] ?? headers[name.toLowerCase()];
  return typeof direct === 'string' ? direct : undefined;
}

describe('api axios interceptors', () => {
  let mock: MockAdapterType;
  let api: AxiosInstance;
  let apiClient: ApiModule['apiClient'];
  let clearCsrfCache: ApiModule['clearCsrfCache'];
  let rememberCsrfToken: ApiModule['rememberCsrfToken'];
  let locationHref: string;
  const originalAppBase = import.meta.env.VITE_APP_BASE;

  async function loadApiModule(appBase = '/engage'): Promise<void> {
    vi.stubEnv('VITE_APP_BASE', appBase);
    vi.resetModules();
    const MockAdapter = (await import('axios-mock-adapter')).default;
    const apiModule = await import('../api');
    api = apiModule.default;
    apiClient = apiModule.apiClient;
    clearCsrfCache = apiModule.clearCsrfCache;
    rememberCsrfToken = apiModule.rememberCsrfToken;
    mock = new MockAdapter(api, { onNoMatch: 'throwException' });
  }

  beforeEach(async () => {
    authMocks.clearAuth.mockClear();
    authMocks.token = 'test-jwt';
    authMocks.tenant = {
      id: 'tenant-1',
      name: 'Test Firm',
      subdomain: 'test',
      primaryColor: '#000000',
      settings: { defaultCurrency: 'GBP' },
    };
    sessionStorage.clear();

    locationHref = '';
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        pathname: '/engage/clients',
        href: '',
        assign: vi.fn(),
        replace: vi.fn(),
      },
    });
    Object.defineProperty(window.location, 'href', {
      configurable: true,
      get: () => locationHref,
      set: (value: string) => {
        locationHref = value;
      },
    });

    await loadApiModule('/engage');
    clearCsrfCache();
  });

  afterEach(() => {
    mock.restore();
    vi.resetModules();
    vi.stubEnv('VITE_APP_BASE', originalAppBase);
  });

  describe('401 refresh and replay', () => {
    it('retries the original request once after a successful token refresh', async () => {
      let clientsCalls = 0;
      let refreshCalls = 0;

      mock.onGet('/clients').reply(() => {
        clientsCalls += 1;
        if (clientsCalls === 1) {
          return [
            401,
            {
              success: false,
              error: { code: 'TOKEN_EXPIRED', message: 'Token expired' },
            },
          ];
        }
        return [200, { success: true, data: { clients: [{ id: 'c1' }] } }];
      });

      mock.onPost('/auth/refresh').reply(() => {
        refreshCalls += 1;
        return [200, { success: true, data: { csrfToken: 'refreshed-csrf' } }];
      });

      const result = await apiClient.get<{ clients: Array<{ id: string }> }>('/clients');

      expect(refreshCalls).toBe(1);
      expect(clientsCalls).toBe(2);
      expect(result).toEqual({ success: true, data: { clients: [{ id: 'c1' }] } });
      expect(authMocks.clearAuth).not.toHaveBeenCalled();
    });

    it('does not retry refresh when the replayed request is /auth/refresh itself', async () => {
      mock.onPost('/auth/refresh').reply(401, {
        success: false,
        error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token invalid' },
      });

      await expect(api.post('/auth/refresh', {})).rejects.toMatchObject({
        code: 'INVALID_REFRESH_TOKEN',
      });

      expect(authMocks.clearAuth).toHaveBeenCalledTimes(1);
    });

    it('logs out and redirects to login when refresh fails', async () => {
      mock.onGet('/proposals').reply(401, {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
      });
      mock.onPost('/auth/refresh').reply(401, {
        success: false,
        error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh failed' },
      });

      await expect(api.get('/proposals')).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });

      expect(authMocks.clearAuth).toHaveBeenCalled();
      expect(locationHref).toBe('/engage/login');
    });
  });

  describe('CSRF on mutations', () => {
    it('adds X-CSRF-Token on state-changing requests when a token is cached', async () => {
      rememberCsrfToken('cached-csrf-token');

      mock.onPost('/clients').reply((config) => {
        expect(getHeader(config, 'X-CSRF-Token')).toBe('cached-csrf-token');
        return [200, { success: true, data: { id: 'new-client' } }];
      });

      const result = await apiClient.post('/clients', { name: 'Acme Ltd' });

      expect(result).toEqual({ success: true, data: { id: 'new-client' } });
    });

    it('fetches CSRF from /auth/csrf-token when cache is empty', async () => {
      mock.onGet('/auth/me').reply(401, {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'No session' },
      });
      mock.onGet('/auth/csrf-token').reply(200, {
        success: true,
        data: { csrfToken: 'fetched-csrf-token' },
      });
      mock.onPut('/clients/c1').reply((config) => {
        expect(getHeader(config, 'X-CSRF-Token')).toBe('fetched-csrf-token');
        return [200, { success: true, data: { id: 'c1' } }];
      });

      await apiClient.put('/clients/c1', { name: 'Updated' });

      expect(mock.history.get.some((req) => req.url === '/auth/csrf-token')).toBe(true);
    });

    it('does not require CSRF on exempt auth routes', async () => {
      mock.onPost('/auth/login').reply((config) => {
        expect(getHeader(config, 'X-CSRF-Token')).toBeUndefined();
        return [200, { success: true, data: { user: { id: 'u1' }, csrfToken: 'login-csrf' } }];
      });

      await apiClient.login('user@example.com', 'password');
    });

    it('does not add CSRF on GET requests', async () => {
      rememberCsrfToken('should-not-attach-on-get');

      mock.onGet('/clients').reply((config) => {
        expect(getHeader(config, 'X-CSRF-Token')).toBeUndefined();
        return [200, { success: true, data: [] }];
      });

      await apiClient.get('/clients');
    });

    it('retries once after CSRF_INVALID with a refreshed token', async () => {
      let proposalCalls = 0;

      mock.onGet('/auth/me').reply(200, {
        success: true,
        data: { csrfToken: 'fresh-after-invalid' },
      });
      mock.onPost('/proposals').reply(() => {
        proposalCalls += 1;
        if (proposalCalls === 1) {
          return [
            403,
            {
              success: false,
              error: { code: 'CSRF_INVALID', message: 'Invalid CSRF token' },
            },
          ];
        }
        return [200, { success: true, data: { id: 'p1' } }];
      });

      const result = await apiClient.post('/proposals', { title: 'New proposal' });

      expect(proposalCalls).toBe(2);
      expect(result).toEqual({ success: true, data: { id: 'p1' } });
    });
  });

  describe('auth headers', () => {
    it('attaches Authorization and X-Tenant-Id from the auth store', async () => {
      rememberCsrfToken('csrf-for-headers-test');

      mock.onDelete('/clients/c1').reply((config) => {
        expect(getHeader(config, 'Authorization')).toBe('Bearer test-jwt');
        expect(getHeader(config, 'X-Tenant-Id')).toBe('tenant-1');
        expect(getHeader(config, 'X-CSRF-Token')).toBe('csrf-for-headers-test');
        return [200, { success: true, data: {} }];
      });

      await apiClient.delete('/clients/c1');
    });
  });
});
