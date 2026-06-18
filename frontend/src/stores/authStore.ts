import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'PARTNER' | 'MANAGER' | 'SENIOR' | 'JUNIOR' | 'CLIENT';
  createdAt?: string;
  twoFactorEnabled?: boolean;
}

export interface Tenant {
  id: string;
  name: string;
  subdomain: string;
  primaryColor: string;
  logo?: string;
  settings: {
    defaultCurrency: string;
    professionalBody?: string;
    [key: string]: any;
  };
}

interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  /** In-memory only — never persisted (httpOnly cookies are primary auth) */
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setAuth: (user: User, tenant: Tenant, token?: string | null) => void;
  setSession: (user: User, tenant: Tenant) => void;
  clearAuth: () => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  updateUser: (user: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tenant: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,

      setAuth: (user, tenant, token = null) =>
        set({
          user,
          tenant,
          token,
          isAuthenticated: true,
          isLoading: false,
        }),

      setSession: (user, tenant) =>
        set({
          user,
          tenant,
          token: null,
          isAuthenticated: true,
          isLoading: false,
        }),

      clearAuth: () =>
        set({
          user: null,
          tenant: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        }),

      logout: () =>
        set({
          user: null,
          tenant: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        }),

      setLoading: (loading) => set({ isLoading: loading }),

      updateUser: (userData) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...userData } : null,
        })),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        tenant: state.tenant,
      }),
    }
  )
);

export default useAuthStore;
