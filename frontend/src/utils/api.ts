import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '../stores/authStore';
import { appPath, appRelativePath } from './appBase';
import type { ApiResponse } from '@uk-proposal-platform/shared';
import type { AuthMePayload, AuthUserListItem, LoginPayload, RegisterPayload } from '../types/auth';
import type {
  AcceptProposalPayload,
  CreateProposalPayload,
  ProposalListParams,
  ProposalRecord,
  UpdateProposalPayload,
} from '../types/proposals';
import type {
  ClientListParams,
  ClientRecord,
  CreateClientPayload,
  MtdIncomeSource,
  MtdItsaAssessmentResult,
  UpdateClientPayload,
} from '../types/clients';
import type {
  CreateServicePayload,
  ServiceCategoryOption,
  ServiceListParams,
  ServiceRecord,
  UpdateServicePayload,
} from '../types/services';
import type {
  CreateTenantPayload,
  CreateTenantResponse,
  DefaultProposalTerms,
  OnboardingStatus,
  SubdomainAvailability,
  TenantSettingsRecord,
  TestIntegrationWebhookPayload,
  TestIntegrationWebhookResult,
  UpdateTenantSettingsPayload,
  UpdateTenantSettingsResult,
  WebhookFormat,
} from '../types/tenants';
import type {
  ContingentFeePayload,
  ContingentFeeResult,
  PricingAdvisorPayload,
  PricingAdvisorResult,
  PricingExplainPayload,
  PricingExplainResult,
  PricingMethodologyResult,
  PricingSuggestFeesPayload,
} from '../types/pricing';
import type {
  PayoutAgreements,
  PayoutLedgerEntry,
  PayoutSettings,
  UpdatePayoutSettingsPayload,
} from '../types/payment';
import type { AutomationSettings } from '../types/automation';
import type {
  ClientTouchpointRecord,
  ClientTouchpointSettingsPayload,
  ClientTouchpointSettingsResult,
  SeedTouchpointDefaultsPayload,
  TouchpointApprovalRecord,
  TouchpointEngineRunResult,
  TouchpointSeedResult,
  TouchpointTemplateRecord,
  UpsertTouchpointTemplatePayload,
} from '../types/touchpoints';

export type { ApiResponse };

// API base URL
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/** Client-facing pages — no install prompts, no auth redirects, quieter errors */
export function isPublicClientPage(): boolean {
  if (typeof window === 'undefined') return false;
  const path = appRelativePath();
  return (
    path.startsWith('/portal/') ||
    path.startsWith('/proposals/view/') ||
    path.startsWith('/onboarding/') ||
    path === '/status'
  );
}

/** Login/register pages — skip session refresh and suppress noisy auth errors */
export function isAuthPage(): boolean {
  if (typeof window === 'undefined') return false;
  const path = appRelativePath();
  return (
    path === '/login' ||
    path === '/register' ||
    path.startsWith('/forgot-password') ||
    path.startsWith('/reset-password')
  );
}

// API URL is configured from environment

/** Avoid stacking identical network/wakeup toasts when Render cold-starts or restarts. */
let lastTransientToastAt = 0;
const TRANSIENT_TOAST_COOLDOWN_MS = 20_000;

function toastTransientError(message: string): void {
  const now = Date.now();
  if (now - lastTransientToastAt < TRANSIENT_TOAST_COOLDOWN_MS) return;
  lastTransientToastAt = now;
  toast.error(message, { id: 'transient-network' });
}

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
  withCredentials: true, // Required for cookies (httpOnly auth + CSRF)
});

// Get CSRF token from cookie
const getCsrfToken = (): string | null => {
  const match = document.cookie.match(/csrfToken=([^;]+)/);
  return match ? match[1] : null;
};

const CSRF_STORAGE_KEY = 'engage_csrf_token';

// In-memory storage for CSRF token (cross-domain cookies don't work)
let csrfTokenInMemory: string | null = null;

function readCsrfFromSession(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const stored = sessionStorage.getItem(CSRF_STORAGE_KEY);
    return stored && stored !== 'undefined' ? stored : null;
  } catch {
    return null;
  }
}

function writeCsrfToSession(token: string | null): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (token) sessionStorage.setItem(CSRF_STORAGE_KEY, token);
    else sessionStorage.removeItem(CSRF_STORAGE_KEY);
  } catch {
    // ignore quota / private mode
  }
}

/** Reset cached CSRF token (e.g. on login page after rate-limit or logout) */
export function clearCsrfCache(): void {
  csrfTokenInMemory = null;
  csrfTokenPromise = null;
  writeCsrfToSession(null);
}

/** Store CSRF from auth responses (cross-domain — cookie not readable by JS). */
export function rememberCsrfToken(token: string | undefined | null): void {
  if (token && token !== 'undefined') {
    csrfTokenInMemory = token;
    writeCsrfToSession(token);
  }
}

/** Hydrate CSRF cache from sessionStorage on app load. */
export function hydrateCsrfCache(): void {
  const stored = readCsrfFromSession();
  if (stored) csrfTokenInMemory = stored;
}

function captureCsrfFromPayload(payload: unknown): void {
  if (!payload || typeof payload !== 'object') return;
  const data = (payload as { data?: { csrfToken?: string }; csrfToken?: string }).data;
  const token = data?.csrfToken ?? (payload as { csrfToken?: string }).csrfToken;
  rememberCsrfToken(token);
}

/** Paths exempt from CSRF on the backend — login/register must work without a prior token. */
function isCsrfExemptRequest(url?: string): boolean {
  if (!url) return false;
  const path = url.split('?')[0];
  const exemptPrefixes = [
    '/auth',
    '/payments/webhook',
    '/oauth/callback',
    '/proposals/view',
    '/proposals/portal',
    '/onboarding',
    '/webhooks/',
    '/aml/webhook',
    '/admin/seed-services',
    '/automation/migrate-service-pricing',
    '/setup',
  ];
  return exemptPrefixes.some((prefix) => path.startsWith(prefix));
}

// Fetch CSRF token from backend
let csrfTokenPromise: Promise<string> | null = null;

function resolveCachedCsrfToken(): string | null {
  if (csrfTokenInMemory) return csrfTokenInMemory;
  const stored = readCsrfFromSession();
  if (stored) {
    csrfTokenInMemory = stored;
    return stored;
  }
  const cookieToken = getCsrfToken();
  if (cookieToken) {
    csrfTokenInMemory = cookieToken;
    return cookieToken;
  }
  return null;
}

const fetchCsrfToken = async (forceRefresh = false): Promise<string> => {
  if (!forceRefresh) {
    const cached = resolveCachedCsrfToken();
    if (cached) return cached;
  } else {
    csrfTokenInMemory = null;
    writeCsrfToSession(null);
  }

  if (csrfTokenPromise) return csrfTokenPromise;

  csrfTokenPromise = (async () => {
    try {
      const meRes = (await api.get('/auth/me')) as { data?: { csrfToken?: string } };
      const meToken = meRes?.data?.csrfToken;
      if (meToken) {
        rememberCsrfToken(meToken);
        if (import.meta.env.DEV) console.log('[CSRF] Token fetched via /auth/me');
        return meToken;
      }
    } catch {
      // No session — use public csrf-token endpoint
    }

    try {
      const csrfRes = (await api.get('/auth/csrf-token')) as { data?: { csrfToken?: string } };
      const token = csrfRes?.data?.csrfToken;
      if (token) {
        rememberCsrfToken(token);
        if (import.meta.env.DEV) console.log('[CSRF] Token fetched via /auth/csrf-token');
        return token;
      }
      console.warn('[CSRF] No token in /auth/csrf-token response');
      return '';
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[CSRF] Failed to fetch token:', message);
      return '';
    } finally {
      csrfTokenPromise = null;
    }
  })();

  return csrfTokenPromise;
};

/** Ensure a CSRF token is available before state-changing requests (e.g. app bootstrap). */
export async function ensureCsrfReady(): Promise<void> {
  hydrateCsrfCache();
  const token = await fetchCsrfToken();
  if (!token) {
    await fetchCsrfToken(true);
  }
}

/** Headers for native fetch() calls that bypass the axios interceptor. */
export async function buildAuthedFetchHeaders(
  extra: Record<string, string> = {}
): Promise<Record<string, string>> {
  const token = useAuthStore.getState().token;
  const tenant = useAuthStore.getState().tenant;
  const csrfToken = await fetchCsrfToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(tenant ? { 'X-Tenant-Id': tenant.id } : {}),
    ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    ...extra,
  };
}

// Request interceptor
api.interceptors.request.use(
  async (config) => {
    const token = useAuthStore.getState().token;
    const tenant = useAuthStore.getState().tenant;

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Add tenant header if available
    if (tenant) {
      config.headers['X-Tenant-Id'] = tenant.id;
    }

    // Add CSRF token for state-changing requests (skip auth/public routes — backend exempts them)
    const method = config.method?.toUpperCase() || '';
    const needsCsrf =
      ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method) && !isCsrfExemptRequest(config.url);

    if (needsCsrf) {
      let csrfToken = await fetchCsrfToken();
      if (!csrfToken) {
        csrfToken = await fetchCsrfToken(true);
      }
      if (csrfToken && csrfToken !== 'undefined') {
        config.headers.set('X-CSRF-Token', csrfToken);
        if (import.meta.env.DEV) console.log('[CSRF] Token added to request');
      } else {
        console.error('[CSRF] No token available — blocking state-changing request');
        return Promise.reject({
          code: 'CSRF_UNAVAILABLE',
          message: 'Security token unavailable. Please refresh the page or log in again.',
        });
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    captureCsrfFromPayload(response.data);
    return response.data;
  },
  async (error: AxiosError) => {
    const response = error.response;

    if (response) {
      const data = response.data as any;
      const errorMessage = data?.error?.message || 'An error occurred';
      const errorCode = data?.error?.code;

      // Handle CSRF errors with automatic retry (once)
      if (errorCode === 'CSRF_MISSING' || errorCode === 'CSRF_INVALID') {
        const originalRequest = error.config as typeof error.config & { _csrfRetry?: boolean };
        if (originalRequest && !originalRequest._csrfRetry) {
          originalRequest._csrfRetry = true;
          clearCsrfCache();
          try {
            const newToken = await fetchCsrfToken(true);
            if (newToken) {
              originalRequest.headers.set('X-CSRF-Token', newToken);
              return api(originalRequest);
            }
          } catch (retryError) {
            console.error('[CSRF] Failed to retry request:', retryError);
          }
        }

        if (!isPublicClientPage() && !isAuthPage()) {
          toast.error('Security token expired. Please refresh the page or log in again.');
        }
        return Promise.reject({
          code: errorCode,
          message: 'Security token expired. Please refresh the page or log in again.',
          status: response.status,
        });
      }

      const publicPage = isPublicClientPage();
      const authPage = isAuthPage();

      // Handle auth errors — try cookie refresh before forcing re-login
      switch (errorCode) {
        case 'AUTH_RATE_LIMIT':
          if (!publicPage) {
            toast.error('Too many sign-in attempts. Please wait a few minutes and try again.');
          }
          break;

        case 'INVALID_CREDENTIALS':
        case 'NO_TENANT':
          if (authPage) {
            toast.error(errorMessage);
          } else if (!publicPage) {
            toast.error(errorMessage);
          }
          break;

        case 'ACCOUNT_LOCKED':
          if (authPage || !publicPage) {
            toast.error(errorMessage);
          }
          break;

        case 'INVALID_REFRESH_TOKEN':
          if (authPage || publicPage) {
            useAuthStore.getState().clearAuth();
            break;
          }
          useAuthStore.getState().clearAuth();
          if (!authPage) {
            window.location.href = appPath('/login');
            toast.error('Your session has expired. Please log in again.');
          }
          break;

        case 'UNAUTHORIZED':
        case 'TOKEN_EXPIRED':
        case 'INVALID_TOKEN': {
          if (publicPage || authPage) {
            useAuthStore.getState().clearAuth();
            break;
          }

          const originalRequest = error.config as typeof error.config & { _retry?: boolean };
          if (
            originalRequest &&
            !originalRequest._retry &&
            originalRequest.url !== '/auth/refresh'
          ) {
            originalRequest._retry = true;
            try {
              const refreshResponse = (await api.post('/auth/refresh', {})) as any;
              if (refreshResponse?.success) {
                return api(originalRequest);
              }
            } catch {
              // fall through to logout
            }
          }

          useAuthStore.getState().clearAuth();
          window.location.href = appPath('/login');
          toast.error('Your session has expired. Please log in again.');
          break;
        }

        case 'FORBIDDEN':
          if (!publicPage) toast.error('You do not have permission to perform this action');
          break;

        case 'VALIDATION_ERROR':
          break;

        case 'RATE_LIMIT_EXCEEDED':
          if (!publicPage) toast.error('Too many requests. Please try again later.');
          break;

        case 'DUPLICATE_ERROR':
          if (!publicPage) toast.error('This record already exists');
          break;

        case 'PORTAL_NOT_FOUND':
          break;

        case 'NOT_FOUND':
          // Optional resources (e.g. cover letter default) — caller handles fallback
          if (error.config?.url?.includes('/cover-letter-templates/default')) {
            break;
          }
          if (!publicPage && !authPage) toast.error(errorMessage);
          break;

        default:
          if (!publicPage && !authPage) toast.error(errorMessage);
      }

      return Promise.reject({
        code: errorCode,
        message: errorMessage,
        details: data?.error?.details,
        status: response.status,
      });
    }

    if (error.request) {
      const publicPage = isPublicClientPage();
      const isTimeout = error.code === 'ECONNABORTED';
      const message = isTimeout
        ? 'The server is waking up — please wait a moment and refresh the page.'
        : publicPage
          ? 'Unable to reach the server. Please check your connection and try again.'
          : 'Network error. Please check your connection.';
      if (!publicPage) toastTransientError(message);
      return Promise.reject({
        code: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
        message,
      });
    }

    return Promise.reject({
      code: 'UNKNOWN_ERROR',
      message: 'An unexpected error occurred',
    });
  }
);

// API helper functions
export const apiClient = {
  // Generic HTTP methods. The response interceptor unwraps to the body, which
  // for JSON endpoints is always the { success, data, error, meta } envelope —
  // pass T to type `data` (defaults to `any` until call sites are migrated).
  get: <T = any>(url: string, config?: AxiosRequestConfig) =>
    api.get(url, config) as Promise<ApiResponse<T>>,
  post: <T = any>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    api.post(url, data, config) as Promise<ApiResponse<T>>,
  put: <T = any>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    api.put(url, data, config) as Promise<ApiResponse<T>>,
  delete: <T = any>(url: string, config?: AxiosRequestConfig) =>
    api.delete(url, config) as Promise<ApiResponse<T>>,

  // Auth
  login: (email: string, password: string, options?: { tenantId?: string; rememberMe?: boolean }) =>
    api.post<LoginPayload>('/auth/login', {
      email,
      password,
      tenantId: options?.tenantId,
      rememberMe: options?.rememberMe,
    }),

  register: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    tenantId: string;
  }) => api.post<RegisterPayload>('/auth/register', data),

  logout: () => api.post<{ message?: string }>('/auth/logout', {}),

  getMe: () => api.get<AuthMePayload>('/auth/me'),

  refreshToken: (refreshToken: string) =>
    api.post<{ token: string; csrfToken?: string }>('/auth/refresh', { refreshToken }),

  // Proposals
  getProposals: (params?: ProposalListParams) =>
    api.get('/proposals', { params }) as Promise<ApiResponse<ProposalRecord[]>>,

  getRenewalCandidates: (params?: { expiringBefore?: string; clientIds?: string[] }) =>
    api.get('/proposals/renewal-candidates', { params }),

  bulkCreateRenewalDrafts: (data: {
    clientIds?: string[];
    proposalIds?: string[];
    expiringBefore?: string;
    templateId?: string;
    upliftPercent?: number;
    upliftRules?: {
      mode: 'percent' | 'cpi' | 'min_floor';
      percent?: number;
      cpiPercent?: number;
      minFeeGbp?: number;
      perServiceFloors?: Record<string, number>;
    };
    useAiCoverLetter?: boolean;
  }) => api.post('/proposals/bulk-renewal', data),

  getProposal: (id: string) => api.get(`/proposals/${id}`) as Promise<ApiResponse<ProposalRecord>>,

  createProposal: (data: CreateProposalPayload) =>
    api.post('/proposals', data) as Promise<ApiResponse<ProposalRecord>>,

  createLoeOnlyProposal: (data: {
    clientId: string;
    serviceIds: string[];
    title?: string;
    validUntil?: string;
    contractStartDate?: string | null;
    notes?: string;
  }) => api.post('/proposals/loe-only', data),
  previewProposalTerms: (serviceIds: string[]) =>
    api.post('/proposals/terms-preview', { serviceIds }),

  updateProposal: (id: string, data: UpdateProposalPayload) =>
    api.put(`/proposals/${id}`, data) as Promise<ApiResponse<ProposalRecord>>,

  deleteProposal: (id: string) => api.delete(`/proposals/${id}`),

  sendProposal: (id: string, email?: { subject: string; textBody: string; htmlBody?: string }) =>
    api.post(`/proposals/${id}/send`, {
      ...(email
        ? {
            aiSubject: email.subject,
            aiText: email.textBody,
            aiHtml: email.htmlBody,
          }
        : {}),
    }),

  getApprovalQueue: (params?: Record<string, unknown>) =>
    api.get('/proposals/approval-queue', { params }),

  submitProposalForApproval: (id: string) => api.post(`/proposals/${id}/submit-for-approval`, {}),

  approveProposal: (id: string, data?: { approvalNotes?: string }) =>
    api.post(`/proposals/${id}/approve`, data ?? {}),

  rejectProposal: (id: string, data: { rejectionReason: string; approvalNotes?: string }) =>
    api.post(`/proposals/${id}/reject`, data),

  acceptProposal: (id: string, data: AcceptProposalPayload) =>
    api.post(`/proposals/${id}/accept`, data) as Promise<ApiResponse<ProposalRecord>>,

  withdrawProposal: (id: string) => api.post(`/proposals/${id}/withdraw`, {}),

  markProposalLost: (id: string, data: { declineReason: string; reason?: string }) =>
    api.post(`/proposals/${id}/mark-lost`, data),

  // Response interceptor already returns `response.data`; for blobs that value IS the Blob.
  downloadProposalPDF: (id: string) =>
    api.get(`/proposals/${id}/pdf`, { responseType: 'blob' }) as Promise<Blob>,

  // Clients
  getClients: (params?: ClientListParams) =>
    api.get('/clients', { params }) as Promise<ApiResponse<ClientRecord[]>>,

  getClient: (id: string) => api.get(`/clients/${id}`) as Promise<ApiResponse<ClientRecord>>,

  createClient: (data: CreateClientPayload) =>
    api.post('/clients', data) as Promise<ApiResponse<ClientRecord>>,

  updateClient: (id: string, data: UpdateClientPayload) =>
    api.put(`/clients/${id}`, data) as Promise<ApiResponse<ClientRecord>>,

  enrichClientFromCompaniesHouse: (
    clientId: string,
    options?: { companyNumber?: string; searchByName?: boolean; fillMissingOnly?: boolean }
  ) => api.post(`/clients/${clientId}/enrich-companies-house`, options ?? {}),

  getClientCompaniesHouse: (clientId: string, companyNumber?: string) =>
    api.get(`/clients/${clientId}/companies-house`, {
      params: companyNumber ? { companyNumber } : undefined,
    }),

  deleteClient: (id: string) => api.delete(`/clients/${id}`),

  assessMTDITSA: (id: string, incomeSources?: MtdIncomeSource[]) =>
    api.post(`/clients/${id}/mtditsa-assessment`, { incomeSources }) as Promise<
      ApiResponse<MtdItsaAssessmentResult>
    >,

  verifyClientIdentity: (id: string) => api.post(`/clients/${id}/verify-identity`),

  initiateAmlCheck: (clientId: string, provider?: 'smartsearch' | 'creditsafe' | 'stub') =>
    api.post('/aml/check', { clientId, provider }),

  getAmlStatus: (clientId: string) => api.get(`/aml/status/${clientId}`),

  getRegulatoryCheck: (clientId: string) => api.get(`/regulatory/check/${clientId}`),

  // Services
  // Pricing methodology (W2.9 — rule engine)
  pricingSuggestFees: (data: PricingSuggestFeesPayload) =>
    api.post('/pricing/suggest-fees', data) as Promise<ApiResponse<PricingMethodologyResult>>,

  pricingExplain: (data: PricingExplainPayload) =>
    api.post('/pricing/explain', data) as Promise<ApiResponse<PricingExplainResult>>,

  pricingContingentFee: (data: ContingentFeePayload) =>
    api.post('/pricing/contingent-fee', data) as Promise<ApiResponse<ContingentFeeResult>>,

  getServices: (params?: ServiceListParams) =>
    api.get('/services', { params }) as Promise<ApiResponse<ServiceRecord[]>>,

  getServiceCategories: () =>
    api.get('/services/categories') as Promise<ApiResponse<ServiceCategoryOption[]>>,

  getService: (id: string) => api.get(`/services/${id}`) as Promise<ApiResponse<ServiceRecord>>,

  createService: (data: CreateServicePayload) =>
    api.post('/services', data) as Promise<ApiResponse<ServiceRecord>>,

  updateService: (id: string, data: UpdateServicePayload) =>
    api.put(`/services/${id}`, data) as Promise<ApiResponse<ServiceRecord>>,

  duplicateService: (id: string) =>
    api.post(`/services/${id}/duplicate`, {}) as Promise<ApiResponse<ServiceRecord>>,

  deleteService: (id: string) =>
    api.delete(`/services/${id}`) as Promise<ApiResponse<{ message?: string }>>,

  // Tenants
  createTenant: (data: CreateTenantPayload) =>
    api.post('/tenants', data) as Promise<ApiResponse<CreateTenantResponse>>,

  checkSubdomain: (subdomain: string) =>
    api.get(`/tenants/check-subdomain/${subdomain}`) as Promise<ApiResponse<SubdomainAvailability>>,

  getOnboardingStatus: () =>
    api.get('/tenants/onboarding-status') as Promise<ApiResponse<OnboardingStatus>>,

  getTenantSettings: () =>
    api.get('/tenants/settings') as Promise<ApiResponse<TenantSettingsRecord>>,

  getDefaultProposalTerms: () =>
    api.get('/tenants/settings/proposal-terms-default') as Promise<
      ApiResponse<DefaultProposalTerms>
    >,

  updateTenantSettings: (data: UpdateTenantSettingsPayload) =>
    api.put('/tenants/settings', data) as Promise<ApiResponse<UpdateTenantSettingsResult>>,

  getPayoutSettings: () => api.get('/payout/settings') as Promise<ApiResponse<PayoutSettings>>,

  updatePayoutSettings: (data: UpdatePayoutSettingsPayload) =>
    api.put('/payout/settings', data) as Promise<ApiResponse<PayoutSettings>>,

  getPayoutLedger: () => api.get('/payout/ledger') as Promise<ApiResponse<PayoutLedgerEntry[]>>,

  getPayoutAgreements: () =>
    api.get('/payout/agreements') as Promise<ApiResponse<PayoutAgreements>>,

  testIntegrationWebhook: (format?: WebhookFormat) =>
    api.post('/tenants/settings/test-webhook', {
      format,
    } satisfies TestIntegrationWebhookPayload) as Promise<
      ApiResponse<TestIntegrationWebhookResult>
    >,

  // Users
  updateMe: (
    data: Partial<{
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      jobTitle: string | null;
    }>
  ) => api.put<AuthMePayload['user']>('/auth/me', data),

  getUsers: () => api.get<AuthUserListItem[]>('/auth/users'),

  // Dashboard
  getDashboardStats: () => api.get('/analytics/dashboard'),

  createUser: (data: {
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    password: string;
  }) => api.post<AuthUserListItem>('/auth/users', data),

  updateUser: (
    id: string,
    data: Partial<{
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      jobTitle: string | null;
      role: string;
    }>
  ) => api.put<AuthUserListItem>(`/auth/users/${id}`, data),

  deleteUser: (id: string) => api.delete<{ message?: string }>(`/auth/users/${id}`),

  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.put<{ message?: string }>('/auth/change-password', data),

  // Proposal Activity
  recordProposalView: (id: string) => api.post(`/proposals/${id}/view`, {}),

  getProposalActivity: (id: string) => api.get(`/proposals/${id}/activity`),

  // Payments
  getStripeConfig: () => api.get('/payments/config'),

  getBillingConfig: () => api.get('/billing/config'),

  createBillingCheckout: (data: { tier: string }) => api.post('/billing/checkout', data),

  getBillingSubscription: () => api.get('/billing/subscription'),

  createSubscription: (data: { priceId: string; paymentMethodId: string }) =>
    api.post('/payments/create-subscription', data),

  getSubscription: () => api.get('/payments/subscription'),

  cancelSubscription: () => api.post('/payments/cancel-subscription', {}),

  reactivateSubscription: () => api.post('/payments/reactivate-subscription', {}),

  createSetupIntent: () => api.post('/payments/create-setup-intent', {}),

  // Client Touchpoints / Automated Lifecycle
  getTouchpointTemplates: () =>
    api.get('/touchpoints/templates') as Promise<ApiResponse<TouchpointTemplateRecord[]>>,

  seedTouchpointDefaults: (resetAll = false) =>
    api.post('/touchpoints/templates/seed-defaults', {
      resetAll,
    } satisfies SeedTouchpointDefaultsPayload) as Promise<ApiResponse<TouchpointSeedResult>>,

  restoreTouchpointDefault: (stage: string) =>
    api.post(`/touchpoints/templates/${stage}/restore-default`, {}) as Promise<
      ApiResponse<TouchpointTemplateRecord>
    >,

  upsertTouchpointTemplate: (stage: string, data: UpsertTouchpointTemplatePayload) =>
    api.put(`/touchpoints/templates/${stage}`, data) as Promise<
      ApiResponse<TouchpointTemplateRecord>
    >,

  getTouchpointApprovals: () =>
    api.get('/touchpoints/approvals') as Promise<ApiResponse<TouchpointApprovalRecord[]>>,

  approveTouchpoint: (id: string) =>
    api.post(`/touchpoints/${id}/approve`, {}) as Promise<ApiResponse<Record<string, never>>>,

  updateClientTouchpointSettings: (clientId: string, data: ClientTouchpointSettingsPayload) =>
    api.patch(`/touchpoints/clients/${clientId}`, data) as Promise<
      ApiResponse<ClientTouchpointSettingsResult>
    >,

  runTouchpointEngine: () =>
    api.post('/touchpoints/run', {}) as Promise<ApiResponse<TouchpointEngineRunResult>>,

  getAutomationSettings: () =>
    api.get('/automation/settings') as Promise<ApiResponse<AutomationSettings>>,

  // Xero integration (W1.1–W1.2)
  getXeroStatus: () => api.get('/xero/status'),
  connectXero: () => api.get('/xero/connect'),
  disconnectXero: () => api.post('/xero/disconnect', {}),
  importXeroClients: (dryRun = false) => api.post('/xero/import-clients', { dryRun }),
  pushAcceptedProposalToXero: (proposalId: string) =>
    api.post(`/xero/push-accepted/${proposalId}`, {}),

  // QuickBooks integration (W4.7 scaffold)
  getQuickBooksStatus: () => api.get('/quickbooks/status'),
  connectQuickBooks: () => api.get('/quickbooks/connect'),
  disconnectQuickBooks: () => api.post('/quickbooks/disconnect', {}),

  // W4.1 fee benchmarks
  getFeeBenchmarks: () => api.get('/analytics/fee-benchmarks'),

  getProposalFunnel: (params?: { startDate?: string; endDate?: string }) =>
    api.get('/analytics/proposal-funnel', { params }),

  // W4.3 firm group
  getFirmGroup: () => api.get('/tenants/firm-group'),
  createFirmGroup: (data: { name: string; slug?: string }) => api.post('/tenants/firm-group', data),
  updateFirmGroup: (data: { name: string }) => api.put('/tenants/firm-group', data),
  dissolveFirmGroup: () => api.delete('/tenants/firm-group'),
  addFirmGroupPractice: (subdomain: string) =>
    api.post('/tenants/firm-group/practices', { subdomain }),
  removeFirmGroupPractice: (practiceId: string) =>
    api.delete(`/tenants/firm-group/practices/${practiceId}`),
  leaveFirmGroup: () => api.post('/tenants/firm-group/leave', {}),

  // W4.4 voice of practice
  getVoiceOfPractice: () => api.get('/ai/voice-of-practice'),
  saveVoiceOfPractice: (sampleText: string) => api.post('/ai/voice-of-practice', { sampleText }),

  // Lifecycle actions (wired to touchpoint engine)
  markAmlComplete: (clientId: string) => api.post(`/clients/${clientId}/aml-complete`, {}),
  markEngagementLetterSigned: (clientId: string) =>
    api.post(`/clients/${clientId}/engagement-letter-signed`, {}),
  markInfoReceived: (clientId: string) => api.post(`/clients/${clientId}/info-received`, {}),
  scheduleDeadlineReminders: (clientId: string) =>
    api.post(`/clients/${clientId}/schedule-deadline-reminders`, {}),
  getClientActivity: (clientId: string) => api.get(`/clients/${clientId}/activity`),

  // Touchpoints per client (for Lifecycle panel upcoming + history)
  getClientTouchpoints: (clientId: string) =>
    api.get(`/touchpoints/client/${clientId}`) as Promise<ApiResponse<ClientTouchpointRecord[]>>,

  // Engagement clause library versioning
  getEngagementLibraryVersions: () => api.get('/engagement-library/versions'),
  getEngagementLibraryCurrent: () => api.get('/engagement-library/current'),
  getEngagementLibraryTemplatesNeedingUpdate: () =>
    api.get('/engagement-library/templates-needing-update'),
  publishEngagementLibraryVersion: (data: { versionLabel: string; changelog?: string }) =>
    api.post('/engagement-library/publish', data),
  getEngagementLibraryQuarterlySchedule: () => api.get('/engagement-library/quarterly-schedule'),
  publishQuarterlyEngagementLibrary: () => api.post('/engagement-library/publish-quarterly', {}),
  simulateQuarterlyEngagementLibrary: () => api.post('/engagement-library/simulate-quarterly', {}),

  // Cover Letter Templates (tones: PROFESSIONAL | FRIENDLY | MODERN)
  getCoverLetterTemplates: () => api.get('/cover-letter-templates'),
  getDefaultCoverLetterTemplate: () => api.get('/cover-letter-templates/default'),
  getCoverLetterMergeFields: () => api.get('/cover-letter-templates/merge-fields'),
  previewCoverLetter: (id: string, previewData: any) =>
    api.post(`/cover-letter-templates/${id}/preview`, previewData),
  previewCoverLetterRaw: (content: string, previewData: any) =>
    api.post('/cover-letter-templates/preview', { content, previewData }),

  // Proposal templates — save and reuse proposal configurations
  getProposalTemplates: () => api.get('/proposal-templates'),
  getProposalTemplate: (id: string) => api.get(`/proposal-templates/${id}`),
  createProposalTemplate: (data: {
    name: string;
    description?: string;
    title: string;
    coverLetter?: string;
    coverLetterTone?: string;
    serviceConfig: Array<{
      serviceId: string;
      name?: string;
      billingFrequency: string;
      displayPrice: number;
      quantity?: number;
      discountPercent?: number;
    }>;
    targetEntityType?: string;
  }) => api.post('/proposal-templates', data),
  updateProposalTemplate: (
    id: string,
    data: Partial<{
      name: string;
      description: string;
      title: string;
      coverLetter: string;
      coverLetterTone: string;
      serviceConfig: Array<{
        serviceId: string;
        name?: string;
        billingFrequency: string;
        displayPrice: number;
        quantity?: number;
        discountPercent?: number;
      }>;
      targetEntityType: string;
    }>
  ) => api.put(`/proposal-templates/${id}`, data),
  saveProposalTemplateFromProposal: (proposalId: string, name: string, description?: string) =>
    api.post('/proposal-templates/from-proposal', { proposalId, name, description }),
  recordProposalTemplateUse: (id: string) => api.post(`/proposal-templates/${id}/record-use`, {}),
  deleteProposalTemplate: (id: string) => api.delete(`/proposal-templates/${id}`),

  // Companies House
  getCompaniesHouseStatus: () => api.get('/companies-house/status'),
  searchCompaniesHouse: (query: string, limit = 5) =>
    api.get('/companies-house/search', { params: { q: query, limit } }),
  getCompaniesHouseCompany: (companyNumber: string) =>
    api.get(`/companies-house/company/${companyNumber}`),
  createCoverLetterTemplate: (data: any) => api.post('/cover-letter-templates', data),
  updateCoverLetterTemplate: (id: string, data: any) =>
    api.put(`/cover-letter-templates/${id}`, data),
  deleteCoverLetterTemplate: (id: string) => api.delete(`/cover-letter-templates/${id}`),

  // Proposal audit trail & compliance (views + signatures + key events)
  getProposalAuditTrail: (id: string) => api.get(`/proposals/${id}/audit-trail`),
  getProposalSignatures: (id: string) => api.get(`/proposals/${id}/signatures`),
  getSignatureAudit: (proposalId: string, signatureId: string) =>
    api.get(`/proposals/${proposalId}/signatures/${signatureId}/audit`),
  downloadSignatureCertificate: (proposalId: string, signatureId: string) =>
    api.get(`/proposals/${proposalId}/signatures/${signatureId}/certificate`, {
      responseType: 'blob',
    }) as Promise<Blob>,

  downloadProposalPdf: async (id: string, reference?: string) => {
    const base = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;
    const token = useAuthStore.getState().token;
    const tenant = useAuthStore.getState().tenant;
    const res = await fetch(`${base}/proposals/${id}/pdf`, {
      credentials: 'include',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(tenant ? { 'X-Tenant-Id': tenant.id } : {}),
      },
    });
    if (!res.ok) throw new Error('PDF download failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `proposal-${reference || id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },

  // Public AML onboarding (portal token — no auth)
  getAmlOnboarding: (token: string) => api.get(`/onboarding/aml/${token}`),
  submitAmlOnboarding: (token: string, data: Record<string, unknown>) =>
    api.post(`/onboarding/aml/${token}`, data),

  // Engage assistant (Clara) — configured on the server via environment variables
  getAiStatus: () => api.get('/ai/status'),
  aiStatus: () => api.get('/ai/status'),
  aiEmptySuggestion: (context: string) =>
    api.get(`/ai/empty-suggestion?context=${encodeURIComponent(context)}`),
  aiSuggestServices: (clientId: string) => api.post('/ai/suggest-services', { clientId }),
  aiDraftReview: (data: {
    clientId: string;
    title?: string;
    coverLetter?: string;
    validUntil?: string;
    terms?: string;
    services: Array<{ name: string; billingFrequency?: string; displayPrice?: number }>;
  }) => api.post('/ai/draft-review', data),
  aiSuggestTitle: (
    clientId: string,
    services: Array<{ name: string; billingFrequency?: string }>
  ) => api.post('/ai/suggest-title', { clientId, services }),
  aiCoverLetter: (data: {
    clientId: string;
    tone: string;
    practiceName: string;
    senderName?: string;
    services: Array<{ name: string; billingFrequency?: string; displayPrice?: number }>;
  }) => api.post('/ai/cover-letter', data),
  aiFollowUp: (proposalId: string, tone?: string) =>
    api.post('/ai/follow-up', { proposalId, tone: tone || 'professional' }),
  aiEngagementLetter: (proposalId: string, options?: { includeAiIntro?: boolean }) =>
    api.post('/ai/engagement-letter', {
      proposalId,
      includeAiIntro: options?.includeAiIntro ?? false,
    }),
  getProposalHealth: (proposalId: string) => api.get(`/ai/proposal-health/${proposalId}`),
  aiRenewalDraft: (proposalId: string, upliftPercent?: number) =>
    api.post('/ai/renewal-draft', { proposalId, upliftPercent: upliftPercent ?? 0 }),
  aiCommand: (query: string, context?: { proposalId?: string; clientId?: string }) =>
    api.post('/ai/command', { query, context }),
  aiQuick: (data: {
    mode: 'ask' | 'health' | 'follow_up' | 'suggest_services';
    query?: string;
    context?: { proposalId?: string; clientId?: string; page?: string };
  }) => api.post('/ai/quick', data),
  aiFeedback: (data: {
    feature: string;
    helpful: boolean;
    comment?: string;
    proposalId?: string;
  }) => api.post('/ai/feedback', data),

  aiProposalEmailDraft: (data: {
    proposalId?: string;
    clientId?: string;
    title?: string;
    reference?: string;
    coverLetter?: string;
    validUntil?: string;
    viewLink?: string;
    practiceName?: string;
    senderName?: string;
    senderEmail?: string;
    services?: Array<{ name: string; billingFrequency?: string; displayPrice?: number }>;
  }) => api.post('/ai/proposal-email-draft', data),

  aiEmailRevise: (currentBody: string, instruction: string, context?: any) =>
    api.post('/ai/email-revise', { currentBody, instruction, context }),

  aiCoverLetterRevise: (currentBody: string, instruction: string, context?: any) =>
    api.post('/ai/cover-letter-revise', { currentBody, instruction, context }),

  aiProposalExplanation: (data: {
    clientId: string;
    title: string;
    services: Array<{
      name: string;
      description?: string;
      billingFrequency?: string;
      billingCycle?: string;
    }>;
    monthlyTotal?: number;
    annualTotal?: number;
    contractTotal?: number;
  }) => api.post('/ai/proposal-explanation', data),

  aiSuggestEmailSubjects: (body: string, context?: any) =>
    api.post('/ai/suggest-email-subjects', { body, context }),

  aiSuggestEmailCtas: (body: string, context?: any) =>
    api.post('/ai/suggest-email-ctas', { body, context }),

  aiAnalyzeEmail: (body: string, context?: any) => api.post('/ai/analyze-email', { body, context }),

  aiStreamProposalEmailDraft: async (
    payload: any,
    onEvent: (event: {
      subject?: string;
      bodyChunk?: string;
      textBody?: string;
      done?: boolean;
      error?: string;
    }) => void
  ): Promise<void> => {
    const base = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;
    const body =
      payload && typeof payload === 'object' && 'proposalId' in payload && payload.proposalId
        ? { proposalId: payload.proposalId }
        : { draft: payload?.draft ?? payload };

    const res = await fetch(`${base}/ai/proposal-email-draft/stream`, {
      method: 'POST',
      headers: await buildAuthedFetchHeaders(),
      credentials: 'include',
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as {
        error?: { message?: string };
        message?: string;
      } | null;
      throw new Error(err?.error?.message || err?.message || 'Email draft stream failed');
    }
    if (!res.body) throw new Error('No stream body');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let streamEnded = false;

    const processBuffer = (flushAll = false) => {
      if (flushAll && buffer.trim() && !buffer.endsWith('\n\n')) {
        buffer += '\n\n';
      }
      const parts = buffer.split('\n\n');
      buffer = flushAll ? '' : parts.pop() || '';
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith('data:')) continue;
        const jsonStr = line.slice(5).trim();
        try {
          const event = JSON.parse(jsonStr);
          onEvent(event);
          if (event.done || event.error) {
            streamEnded = true;
          }
        } catch {
          // ignore malformed SSE chunks
        }
      }
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        processBuffer(false);
      }
      if (done) {
        buffer += decoder.decode();
        processBuffer(true);
        break;
      }
    }

    if (!streamEnded) {
      onEvent({ done: true });
    }
  },

  aiClientBrief: (clientId: string) => api.post(`/ai/client-brief/${clientId}`, {}),

  aiAutoFit: (clientId: string) => api.post('/ai/auto-fit', { clientId }),

  aiPricingAdvisor: (data: PricingAdvisorPayload) =>
    api.post('/ai/pricing-advisor', data) as Promise<ApiResponse<PricingAdvisorResult>>,

  getProposalRegulatoryFit: (proposalId: string) =>
    api.get(`/proposals/${proposalId}/regulatory-fit`),

  aiRegulatoryAlerts: () => api.get('/ai/regulatory-alerts'),

  aiAttentionQueue: () => api.get('/ai/attention-queue'),

  // Streaming (SSE) for live drafts — uses native fetch + token from auth store
  aiStreamCoverLetter: async (
    data: {
      clientId: string;
      tone: string;
      practiceName: string;
      senderName?: string;
      services: Array<{ name: string; billingFrequency?: string; displayPrice?: number }>;
    },
    onChunk: (text: string) => void
  ): Promise<void> => {
    const base = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;
    const res = await fetch(`${base}/ai/cover-letter/stream`, {
      method: 'POST',
      headers: await buildAuthedFetchHeaders(),
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (!res.body) throw new Error('No stream body');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith('data:')) continue;
        const jsonStr = line.slice(5).trim();
        let payload;
        try {
          payload = JSON.parse(jsonStr);
        } catch {
          continue; // ignore malformed SSE chunks
        }
        if (payload.chunk) onChunk(payload.chunk);
        if (payload.done) return;
        // A server-signalled error must surface to the caller, not be swallowed
        // alongside parse errors as it was before.
        if (payload.error) throw new Error(payload.error);
      }
    }
  },

  aiStreamEngagementLetter: async (
    proposalId: string,
    onChunk: (text: string) => void,
    options?: { includeAiIntro?: boolean }
  ): Promise<void> => {
    const base = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;
    const res = await fetch(`${base}/ai/engagement-letter/stream`, {
      method: 'POST',
      headers: await buildAuthedFetchHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        proposalId,
        includeAiIntro: options?.includeAiIntro ?? false,
      }),
    });
    if (!res.body) throw new Error('No stream body');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith('data:')) continue;
        const jsonStr = line.slice(5).trim();
        let payload;
        try {
          payload = JSON.parse(jsonStr);
        } catch {
          continue; // ignore malformed SSE chunks
        }
        if (payload.chunk) onChunk(payload.chunk);
        if (payload.done) return;
        // A server-signalled error must surface to the caller, not be swallowed
        // alongside parse errors as it was before.
        if (payload.error) throw new Error(payload.error);
      }
    }
  },

  aiVoiceProposal: (clientId: string, transcript: string) =>
    api.post('/ai/voice-proposal', { clientId, transcript }),
};

export default api;
