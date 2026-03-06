import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'PARTNER' | 'MANAGER' | 'SENIOR' | 'JUNIOR' | 'CLIENT';
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
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // Actions
  setAuth: (user: User, tenant: Tenant, token: string) => void;
  clearAuth: () => void;
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
      isLoading: false,

      setAuth: (user, tenant, token) =>
        set({
          user,
          tenant,
          token, // Token kept in memory only, not persisted
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

      setLoading: (loading) => set({ isLoading: loading }),

      updateUser: (userData) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...userData } : null,
        })),
    }),
    {
      name: 'auth-storage',
      // SECURITY FIX: Token is NOT persisted to localStorage
      // Only user and tenant data is persisted
      // Token is stored in memory only and httpOnly cookie is used for auth
      partialize: (state) => ({
        user: state.user,
        tenant: state.tenant,
        // token: intentionally NOT persisted - security fix
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

export default useAuthStore;
