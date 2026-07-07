/** Auth/session types — shared by authStore and apiClient auth methods. */

export type UserRole = 'ADMIN' | 'PARTNER' | 'MD' | 'MANAGER' | 'SENIOR' | 'JUNIOR' | 'CLIENT';

export interface TenantSettings {
  defaultCurrency: string;
  professionalBody?: string;
  vatRegistered?: boolean;
  defaultPaymentTerms?: number;
  claraOnboarding?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AuthTenant {
  id: string;
  name: string;
  subdomain: string;
  primaryColor: string;
  logo?: string;
  settings: TenantSettings;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  jobTitle?: string | null;
  role: UserRole;
  isActive?: boolean;
  lastLoginAt?: string | null;
  twoFactorEnabled?: boolean;
  tenant: AuthTenant;
}

export interface AuthMePayload {
  csrfToken?: string;
  user: AuthUser;
}

export interface LoginPayload {
  user: AuthUser;
  token?: string;
  csrfToken?: string;
}

export interface RegisterPayload {
  user: AuthUser;
  tenant: AuthTenant;
}

export interface AuthUserListItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
}
