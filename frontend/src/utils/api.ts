import axios, { AxiosInstance, AxiosError } from 'axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '../stores/authStore';

// API base URL
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

console.log('API URL:', API_URL); // Debug log

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    const tenant = useAuthStore.getState().tenant;

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Add tenant header if available
    if (tenant) {
      config.headers['X-Tenant-Id'] = tenant.id;
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
  (error: AxiosError) => {
    const response = error.response;
    
    if (response) {
      const data = response.data as any;
      const errorMessage = data?.error?.message || 'An error occurred';
      const errorCode = data?.error?.code;

      // Handle specific error codes
      switch (errorCode) {
        case 'UNAUTHORIZED':
        case 'TOKEN_EXPIRED':
        case 'INVALID_TOKEN':
          // Clear auth and redirect to login
          useAuthStore.getState().clearAuth();
          window.location.href = '/login';
          toast.error('Your session has expired. Please log in again.');
          break;

        case 'FORBIDDEN':
          toast.error('You do not have permission to perform this action');
          break;

        case 'VALIDATION_ERROR':
          // Don't show toast for validation errors - handled by forms
          break;

        case 'RATE_LIMIT_EXCEEDED':
          toast.error('Too many requests. Please try again later.');
          break;

        case 'DUPLICATE_ERROR':
          toast.error('This record already exists');
          break;

        default:
          toast.error(errorMessage);
      }

      return Promise.reject({
        code: errorCode,
        message: errorMessage,
        details: data?.error?.details,
        status: response.status,
      });
    }

    // Network error
    if (error.request) {
      toast.error('Network error. Please check your connection.');
      return Promise.reject({
        code: 'NETWORK_ERROR',
        message: 'Network error. Please check your connection.',
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

  refreshToken: (refreshToken: string) =>
    api.post('/auth/refresh', { refreshToken }),

  // Proposals
  getProposals: (params?: Record<string, any>) =>
    api.get('/proposals', { params }),

  getProposal: (id: string) => api.get(`/proposals/${id}`),

  createProposal: (data: any) => api.post('/proposals', data),

  updateProposal: (id: string, data: any) =>
    api.put(`/proposals/${id}`, data),

  deleteProposal: (id: string) => api.delete(`/proposals/${id}`),

  sendProposal: (id: string) => api.post(`/proposals/${id}/send`, {}),

  acceptProposal: (id: string, data?: any) =>
    api.post(`/proposals/${id}/accept`, data),

  downloadProposalPDF: (id: string) =>
    api.get(`/proposals/${id}/pdf`, { responseType: 'blob' }),

  // Clients
  getClients: (params?: Record<string, any>) =>
    api.get('/clients', { params }),

  getClient: (id: string) => api.get(`/clients/${id}`),

  createClient: (data: any) => api.post('/clients', data),

  updateClient: (id: string, data: any) =>
    api.put(`/clients/${id}`, data),

  deleteClient: (id: string) => api.delete(`/clients/${id}`),

  assessMTDITSA: (id: string, incomeSources?: any[]) =>
    api.post(`/clients/${id}/mtditsa-assessment`, { incomeSources }),

  // Services
  getServices: (params?: Record<string, any>) =>
    api.get('/services', { params }),

  getServiceCategories: () => api.get('/services/categories'),

  getService: (id: string) => api.get(`/services/${id}`),

  createService: (data: any) => api.post('/services', data),

  updateService: (id: string, data: any) =>
    api.put(`/services/${id}`, data),

  duplicateService: (id: string) =>
    api.post(`/services/${id}/duplicate`, {}),

  calculatePrice: (data: any) =>
    api.post('/services/calculate-price', data),

  deleteService: (id: string) => api.delete(`/services/${id}`),

  // Tenants
  createTenant: (data: any) => api.post('/tenants', data),

  checkSubdomain: (subdomain: string) =>
    api.get(`/tenants/check-subdomain/${subdomain}`),

  getOnboardingStatus: () => api.get('/tenants/onboarding-status'),
};

export default api;
