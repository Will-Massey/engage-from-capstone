import axios, { AxiosInstance, AxiosError } from 'axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '../stores/authStore';

// API base URL
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/** Client-facing pages — no install prompts, no auth redirects, quieter errors */
export function isPublicClientPage(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname;
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
  const path = window.location.pathname;
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

// In-memory storage for CSRF token (cross-domain cookies don't work)
let csrfTokenInMemory: string | null = null;

/** Reset cached CSRF token (e.g. on login page after rate-limit or logout) */
export function clearCsrfCache(): void {
  csrfTokenInMemory = null;
  csrfTokenPromise = null;
}

// Fetch CSRF token from backend
let csrfTokenPromise: Promise<string> | null = null;
const fetchCsrfToken = async (): Promise<string> => {
  // Check memory first (for cross-domain where cookies don't work)
  if (csrfTokenInMemory) return csrfTokenInMemory;

  // Then check cookie (for same-domain)
  const cookieToken = getCsrfToken();
  if (cookieToken) return cookieToken;

  // Deduplicate concurrent requests
  if (csrfTokenPromise) return csrfTokenPromise;

  csrfTokenPromise = axios
    .get(`${API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`}/auth/csrf-token`, {
      withCredentials: true,
    })
    .then((res: any) => {
      csrfTokenPromise = null;
      // Store in memory since cross-domain cookies don't work
      const token = res.data?.data?.csrfToken;
      if (token) {
        csrfTokenInMemory = token;
        if (import.meta.env.DEV) console.log('[CSRF] Token fetched and stored in memory');
        return token;
      }
      console.warn('[CSRF] No token in response');
      return '';
    })
    .catch((err) => {
      csrfTokenPromise = null;
      console.error('[CSRF] Failed to fetch token:', err.message);
      return '';
    });

  return csrfTokenPromise;
};

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

    // Add CSRF token for state-changing requests
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(config.method?.toUpperCase() || '')) {
      const csrfToken = await fetchCsrfToken();
      if (csrfToken && csrfToken !== 'undefined') {
        config.headers['X-CSRF-Token'] = csrfToken;
        if (import.meta.env.DEV) console.log('[CSRF] Token added to request');
      } else {
        console.warn('[CSRF] No token available for request');
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
    return response.data;
  },
  async (error: AxiosError) => {
    const response = error.response;

    if (response) {
      const data = response.data as any;
      const errorMessage = data?.error?.message || 'An error occurred';
      const errorCode = data?.error?.code;

      // Handle CSRF errors with automatic retry
      if (errorCode === 'CSRF_MISSING' || errorCode === 'CSRF_INVALID') {
        if (import.meta.env.DEV) console.log('[CSRF] Token invalid, fetching new token and retrying...');

        // Clear the cached token to force a refresh
        csrfTokenInMemory = null;

        // Get the original request config
        const originalRequest = error.config;
        if (originalRequest) {
          try {
            // Fetch a new CSRF token
            const newToken = await fetchCsrfToken();
            if (newToken) {
              // Update the request with the new token
              originalRequest.headers['X-CSRF-Token'] = newToken;
              if (import.meta.env.DEV) console.log('[CSRF] Retrying request with new token');
              // Retry the request
              return api(originalRequest);
            }
          } catch (retryError) {
            console.error('[CSRF] Failed to retry request:', retryError);
          }
        }

        toast.error('Security token expired. Please try again.');
        return Promise.reject({
          code: errorCode,
          message: 'Security token expired. Please try again.',
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

        case 'INVALID_REFRESH_TOKEN':
          if (authPage || publicPage) {
            useAuthStore.getState().clearAuth();
            break;
          }
          useAuthStore.getState().clearAuth();
          if (!authPage) {
            window.location.href = '/login';
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
          if (originalRequest && !originalRequest._retry && originalRequest.url !== '/auth/refresh') {
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
          window.location.href = '/login';
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
          else if (authPage && errorCode === 'ACCOUNT_LOCKED') {
            toast.error(errorMessage);
          }
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
  // Generic HTTP methods
  get: (url: string, config?: any) => api.get(url, config),
  post: (url: string, data?: any, config?: any) => api.post(url, data, config),
  put: (url: string, data?: any, config?: any) => api.put(url, data, config),
  delete: (url: string, config?: any) => api.delete(url, config),

  // Auth
  login: (email: string, password: string, tenantId?: string) =>
    api.post('/auth/login', { email, password, tenantId }),

  register: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    tenantId: string;
  }) => api.post('/auth/register', data),

  logout: () => api.post('/auth/logout', {}),

  getMe: () => api.get('/auth/me'),

  refreshToken: (refreshToken: string) => api.post('/auth/refresh', { refreshToken }),

  // Proposals
  getProposals: (params?: Record<string, any>) => api.get('/proposals', { params }),

  getRenewalCandidates: (params?: { expiringBefore?: string; clientIds?: string[] }) =>
    api.get('/proposals/renewal-candidates', { params }),

  bulkCreateRenewalDrafts: (data: {
    clientIds?: string[];
    proposalIds?: string[];
    expiringBefore?: string;
    templateId?: string;
    upliftPercent?: number;
    useAiCoverLetter?: boolean;
  }) => api.post('/proposals/bulk-renewal', data),

  getProposal: (id: string) => api.get(`/proposals/${id}`),

  createProposal: (data: any) => api.post('/proposals', data),
  previewProposalTerms: (serviceIds: string[]) =>
    api.post('/proposals/terms-preview', { serviceIds }),

  updateProposal: (id: string, data: any) => api.put(`/proposals/${id}`, data),

  deleteProposal: (id: string) => api.delete(`/proposals/${id}`),

  sendProposal: (
    id: string,
    email?: { subject: string; textBody: string; htmlBody?: string }
  ) =>
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

  submitProposalForApproval: (id: string) =>
    api.post(`/proposals/${id}/submit-for-approval`, {}),

  approveProposal: (id: string, data?: { approvalNotes?: string }) =>
    api.post(`/proposals/${id}/approve`, data ?? {}),

  rejectProposal: (id: string, data: { rejectionReason: string; approvalNotes?: string }) =>
    api.post(`/proposals/${id}/reject`, data),

  acceptProposal: (id: string, data?: any) => api.post(`/proposals/${id}/accept`, data),

  withdrawProposal: (id: string) => api.post(`/proposals/${id}/withdraw`, {}),

  markProposalLost: (
    id: string,
    data: { declineReason: string; reason?: string }
  ) => api.post(`/proposals/${id}/mark-lost`, data),

  // Response interceptor already returns `response.data`; for blobs that value IS the Blob.
  downloadProposalPDF: (id: string) =>
    api.get(`/proposals/${id}/pdf`, { responseType: 'blob' }) as Promise<Blob>,

  // Clients
  getClients: (params?: Record<string, any>) => api.get('/clients', { params }),

  getClient: (id: string) => api.get(`/clients/${id}`),

  createClient: (data: any) => api.post('/clients', data),

  updateClient: (id: string, data: any) => api.put(`/clients/${id}`, data),

  enrichClientFromCompaniesHouse: (
    clientId: string,
    options?: { companyNumber?: string; searchByName?: boolean; fillMissingOnly?: boolean }
  ) => api.post(`/clients/${clientId}/enrich-companies-house`, options ?? {}),

  getClientCompaniesHouse: (clientId: string, companyNumber?: string) =>
    api.get(`/clients/${clientId}/companies-house`, {
      params: companyNumber ? { companyNumber } : undefined,
    }),

  deleteClient: (id: string) => api.delete(`/clients/${id}`),

  assessMTDITSA: (id: string, incomeSources?: any[]) =>
    api.post(`/clients/${id}/mtditsa-assessment`, { incomeSources }),

  verifyClientIdentity: (id: string) => api.post(`/clients/${id}/verify-identity`),

  initiateAmlCheck: (clientId: string, provider?: 'smartsearch' | 'creditsafe' | 'stub') =>
    api.post('/aml/check', { clientId, provider }),

  getRegulatoryCheck: (clientId: string) => api.get(`/regulatory/check/${clientId}`),

  // Services
  // Pricing methodology (W2.9 — rule engine)
  pricingSuggestFees: (data: {
    turnoverBand: string;
    entityType: string;
    employeeCount: number;
    vatRegistered: boolean;
    mtdStatus: string;
    complexity: { hasPayroll: boolean; hasRd: boolean; multiSite: boolean };
  }) => api.post('/pricing/suggest-fees', data),

  pricingExplain: (data: { suggestion: { inputs: any; services: any[]; totals: any } }) =>
    api.post('/pricing/explain', data),

  getServices: (params?: Record<string, any>) => api.get('/services', { params }),

  getServiceCategories: () => api.get('/services/categories'),

  getService: (id: string) => api.get(`/services/${id}`),

  createService: (data: any) => api.post('/services', data),

  updateService: (id: string, data: any) => api.put(`/services/${id}`, data),

  duplicateService: (id: string) => api.post(`/services/${id}/duplicate`, {}),

  calculatePrice: (data: any) => api.post('/services/calculate-price', data),

  deleteService: (id: string) => api.delete(`/services/${id}`),

  // Tenants
  createTenant: (data: any) => api.post('/tenants', data),

  checkSubdomain: (subdomain: string) => api.get(`/tenants/check-subdomain/${subdomain}`),

  getOnboardingStatus: () => api.get('/tenants/onboarding-status'),

  getTenantSettings: () => api.get('/tenants/settings'),

  getDefaultProposalTerms: () => api.get('/tenants/settings/proposal-terms-default'),

  updateTenantSettings: (data: any) => api.put('/tenants/settings', data),

  testIntegrationWebhook: (format?: 'default' | 'hubspot') =>
    api.post('/tenants/settings/test-webhook', { format }),

  // Users
  updateMe: (data: any) => api.put('/auth/me', data),

  getUsers: () => api.get('/auth/users'),

  // Dashboard
  getDashboardStats: () => api.get('/proposals/stats/dashboard'),

  createUser: (data: any) => api.post('/auth/users', data),

  updateUser: (id: string, data: any) => api.put(`/auth/users/${id}`, data),

  deleteUser: (id: string) => api.delete(`/auth/users/${id}`),

  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.put('/auth/change-password', data),

  // Proposal Activity
  recordProposalView: (id: string) => api.post(`/proposals/${id}/view`, {}),

  getProposalActivity: (id: string) => api.get(`/proposals/${id}/activity`),

  // Payments
  getStripeConfig: () => api.get('/payments/config'),

  createSubscription: (data: { priceId: string; paymentMethodId: string }) =>
    api.post('/payments/create-subscription', data),

  getSubscription: () => api.get('/payments/subscription'),

  cancelSubscription: () => api.post('/payments/cancel-subscription', {}),

  reactivateSubscription: () => api.post('/payments/reactivate-subscription', {}),

  createSetupIntent: () => api.post('/payments/create-setup-intent', {}),

  // Client Touchpoints / Automated Lifecycle
  getTouchpointTemplates: () => api.get('/touchpoints/templates'),
  upsertTouchpointTemplate: (stage: string, data: any) =>
    api.put(`/touchpoints/templates/${stage}`, data),
  getTouchpointApprovals: () => api.get('/touchpoints/approvals'),
  approveTouchpoint: (id: string) => api.post(`/touchpoints/${id}/approve`, {}),
  updateClientTouchpointSettings: (clientId: string, data: any) =>
    api.patch(`/touchpoints/clients/${clientId}`, data),
  runTouchpointEngine: () => api.post('/touchpoints/run', {}),

  getAutomationSettings: () => api.get('/automation/settings'),

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

  // W4.3 firm group
  getFirmGroup: () => api.get('/tenants/firm-group'),
  createFirmGroup: (data: { name: string; slug?: string }) =>
    api.post('/tenants/firm-group', data),
  updateFirmGroup: (data: { name: string }) => api.put('/tenants/firm-group', data),
  dissolveFirmGroup: () => api.delete('/tenants/firm-group'),
  addFirmGroupPractice: (subdomain: string) =>
    api.post('/tenants/firm-group/practices', { subdomain }),
  removeFirmGroupPractice: (practiceId: string) =>
    api.delete(`/tenants/firm-group/practices/${practiceId}`),
  leaveFirmGroup: () => api.post('/tenants/firm-group/leave', {}),

  // W4.4 voice of practice
  getVoiceOfPractice: () => api.get('/ai/voice-of-practice'),
  saveVoiceOfPractice: (sampleText: string) =>
    api.post('/ai/voice-of-practice', { sampleText }),

  // Lifecycle actions (wired to touchpoint engine)
  markAmlComplete: (clientId: string) => api.post(`/clients/${clientId}/aml-complete`, {}),
  markEngagementLetterSigned: (clientId: string) =>
    api.post(`/clients/${clientId}/engagement-letter-signed`, {}),
  markInfoReceived: (clientId: string) => api.post(`/clients/${clientId}/info-received`, {}),
  scheduleDeadlineReminders: (clientId: string) => api.post(`/clients/${clientId}/schedule-deadline-reminders`, {}),
  getClientActivity: (clientId: string) => api.get(`/clients/${clientId}/activity`),

  // Touchpoints per client (for Lifecycle panel upcoming + history)
  getClientTouchpoints: (clientId: string) => api.get(`/touchpoints/client/${clientId}`),

  // Engagement clause library versioning
  getEngagementLibraryVersions: () => api.get('/engagement-library/versions'),
  getEngagementLibraryCurrent: () => api.get('/engagement-library/current'),
  getEngagementLibraryTemplatesNeedingUpdate: () =>
    api.get('/engagement-library/templates-needing-update'),
  publishEngagementLibraryVersion: (data: { versionLabel: string; changelog?: string }) =>
    api.post('/engagement-library/publish', data),

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
  updateCoverLetterTemplate: (id: string, data: any) => api.put(`/cover-letter-templates/${id}`, data),
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
  aiEmptySuggestion: (context: string) => api.get(`/ai/empty-suggestion?context=${encodeURIComponent(context)}`),
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
    api.post('/ai/engagement-letter', { proposalId, includeAiIntro: options?.includeAiIntro ?? false }),
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
  aiFeedback: (data: { feature: string; helpful: boolean; comment?: string; proposalId?: string }) =>
    api.post('/ai/feedback', data),

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
    services: Array<{ name: string; description?: string; billingFrequency?: string; billingCycle?: string }>;
    monthlyTotal?: number;
    annualTotal?: number;
    contractTotal?: number;
  }) => api.post('/ai/proposal-explanation', data),

  aiSuggestEmailSubjects: (body: string, context?: any) =>
    api.post('/ai/suggest-email-subjects', { body, context }),

  aiSuggestEmailCtas: (body: string, context?: any) =>
    api.post('/ai/suggest-email-ctas', { body, context }),

  aiAnalyzeEmail: (body: string, context?: any) =>
    api.post('/ai/analyze-email', { body, context }),

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
    const { token } = useAuthStore.getState();
    const base = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;
    const body =
      payload && typeof payload === 'object' && 'proposalId' in payload && payload.proposalId
        ? { proposalId: payload.proposalId }
        : { draft: payload?.draft ?? payload };

    const res = await fetch(`${base}/ai/proposal-email-draft/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
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

    while (true) {
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
    const { token } = useAuthStore.getState();
    const base = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;
    const res = await fetch(`${base}/ai/cover-letter/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
    });
    if (!res.body) throw new Error('No stream body');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith('data:')) continue;
        const jsonStr = line.slice(5).trim();
        try {
          const payload = JSON.parse(jsonStr);
          if (payload.chunk) onChunk(payload.chunk);
          if (payload.done) return;
          if (payload.error) throw new Error(payload.error);
        } catch {}
      }
    }
  },

  aiStreamEngagementLetter: async (
    proposalId: string,
    onChunk: (text: string) => void,
    options?: { includeAiIntro?: boolean }
  ): Promise<void> => {
    const { token } = useAuthStore.getState();
    const base = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;
    const res = await fetch(`${base}/ai/engagement-letter/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        proposalId,
        includeAiIntro: options?.includeAiIntro ?? false,
      }),
    });
    if (!res.body) throw new Error('No stream body');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith('data:')) continue;
        const jsonStr = line.slice(5).trim();
        try {
          const payload = JSON.parse(jsonStr);
          if (payload.chunk) onChunk(payload.chunk);
          if (payload.done) return;
          if (payload.error) throw new Error(payload.error);
        } catch {}
      }
    }
  },

  aiVoiceProposal: (clientId: string, transcript: string) =>
    api.post('/ai/voice-proposal', { clientId, transcript }),
};

export default api;
