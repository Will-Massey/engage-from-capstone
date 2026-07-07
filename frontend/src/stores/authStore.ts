import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { clearAllProposalDrafts } from '../components/proposals/proposalBuilderDraft';
import type { AuthTenant, AuthUser } from '../types/auth';

export type User = AuthUser & { createdAt?: string };
export type Tenant = AuthTenant;

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

      clearAuth: () => {
        clearAllProposalDrafts();
        set({
          user: null,
          tenant: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        });
      },

      logout: () => {
        clearAllProposalDrafts();
        set({
          user: null,
          tenant: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        });
      },

      setLoading: (loading) => set({ isLoading: loading }),

      updateUser: (userData) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...userData } : null,
        })),
    }),
    {
      name: 'auth-storage',
      partialize: () => ({}),
    }
  )
);

export default useAuthStore;
