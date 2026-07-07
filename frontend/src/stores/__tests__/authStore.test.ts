import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../components/proposals/proposalBuilderDraft', () => ({
  clearAllProposalDrafts: vi.fn(),
}));

vi.mock('zustand/middleware', async () => {
  const actual = await vi.importActual<typeof import('zustand/middleware')>('zustand/middleware');
  return {
    ...actual,
    persist: (initializer: unknown) => initializer,
  };
});

import type { User, Tenant } from '../authStore';

const { useAuthStore } = await import('../authStore');

const sampleUser: User = {
  id: 'user-1',
  email: 'partner@test.dev',
  firstName: 'Test',
  lastName: 'Partner',
  role: 'PARTNER',
  tenant: {
    id: 'tenant-1',
    name: 'Test Practice',
    subdomain: 'testpractice',
    primaryColor: '#0ea5e9',
    settings: { defaultCurrency: 'GBP' },
  },
};

const sampleTenant: Tenant = {
  id: 'tenant-1',
  name: 'Test Practice',
  subdomain: 'testpractice',
  primaryColor: '#0ea5e9',
  settings: { defaultCurrency: 'GBP' },
};

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      tenant: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,
    });
  });

  it('setSession marks user authenticated without persisting token', () => {
    useAuthStore.getState().setSession(sampleUser, sampleTenant);
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.email).toBe('partner@test.dev');
    expect(state.tenant?.subdomain).toBe('testpractice');
    expect(state.token).toBeNull();
    expect(state.isLoading).toBe(false);
  });

  it('setAuth stores optional bearer token for legacy flows', () => {
    useAuthStore.getState().setAuth(sampleUser, sampleTenant, 'legacy-jwt');
    const state = useAuthStore.getState();
    expect(state.token).toBe('legacy-jwt');
    expect(state.isAuthenticated).toBe(true);
  });

  it('updateUser merges partial profile fields', () => {
    useAuthStore.getState().setSession(sampleUser, sampleTenant);
    useAuthStore.getState().updateUser({ firstName: 'Updated', jobTitle: 'Partner' });
    expect(useAuthStore.getState().user?.firstName).toBe('Updated');
    expect(useAuthStore.getState().user?.jobTitle).toBe('Partner');
    expect(useAuthStore.getState().user?.lastName).toBe('Partner');
  });

  it('clearAuth and logout reset session state', () => {
    useAuthStore.getState().setAuth(sampleUser, sampleTenant, 'jwt');
    useAuthStore.getState().clearAuth();
    let state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();

    useAuthStore.getState().setSession(sampleUser, sampleTenant);
    useAuthStore.getState().logout();
    state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
  });
});
