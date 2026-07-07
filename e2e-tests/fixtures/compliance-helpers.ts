import { type APIRequestContext } from '@playwright/test';
import { API_BASE, apiDelete, apiGet, apiPost } from './build-helpers';

/** 1×1 PNG — valid for AML document upload validation */
export const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export function amlDocumentStub(fileName: string) {
  return {
    fileName,
    mimeType: 'image/png' as const,
    data: TINY_PNG_DATA_URL,
  };
}

export type DisposableTenant = {
  email: string;
  password: string;
  subdomain: string;
  tenantId: string;
  userId: string;
};

/** Public tenant signup — returns session cookies on the request context. */
export async function signupDisposableTenant(
  request: APIRequestContext,
  stamp = Date.now()
): Promise<DisposableTenant> {
  const subdomain = `e2e${stamp}`.slice(0, 30);
  const email = `e2e-signup-${stamp}@example.com`;
  const password = 'DemoPass123!';

  const res = await request.post(`${API_BASE}/tenants`, {
    data: {
      subdomain,
      name: `E2E Practice ${stamp}`,
      adminEmail: email,
      adminFirstName: 'E2E',
      adminLastName: 'Signup',
      adminPassword: password,
    },
    headers: {
      'X-Test-Mode': 'e2e-build',
      'Content-Type': 'application/json',
    },
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok()) {
    throw new Error(
      `Tenant signup failed (${res.status()}): ${JSON.stringify(body).slice(0, 300)}`
    );
  }

  return {
    email,
    password,
    subdomain,
    tenantId: body.data.tenant.id as string,
    userId: body.data.user.id as string,
  };
}

export async function closeDisposableAccount(
  request: APIRequestContext,
  password: string
): Promise<void> {
  const result = await apiDelete(request, '/auth/me', {
    password,
    confirmDelete: true,
  });
  if (result.status >= 400 || !result.body?.success) {
    throw new Error(`Account close failed (${result.status}): ${JSON.stringify(result.body)}`);
  }
}

export function portalTokenFromUrl(portalUrl: string): string {
  return portalUrl.split('/').pop()!;
}

export async function mintPortalToken(
  request: APIRequestContext,
  clientId: string
): Promise<string> {
  const portal = await apiPost(request, `/proposals/portal/${clientId}`, { expiryDays: 90 });
  if (portal.status >= 400 || !portal.body?.success) {
    throw new Error(`Portal link failed: ${JSON.stringify(portal.body)}`);
  }
  return portalTokenFromUrl(portal.body.data.portalUrl as string);
}

export async function submitAmlOnboarding(
  request: APIRequestContext,
  portalToken: string
): Promise<void> {
  const res = await request.post(`${API_BASE}/onboarding/aml/${portalToken}`, {
    data: {
      idDocumentType: 'PASSPORT',
      fullLegalName: 'Jane Compliance',
      dateOfBirth: '1985-06-15',
      registeredAddress: '1 Test Street, London, SW1A 1AA',
      nationality: 'British',
      sourceOfFunds: 'Salary and business income',
      isPep: false,
      photoIdDocument: amlDocumentStub('passport.png'),
      proofOfAddressDocument: amlDocumentStub('utility-bill.png'),
      confirmAccurate: true,
    },
    headers: { 'X-Test-Mode': 'e2e-build', 'Content-Type': 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok()) {
    throw new Error(`AML onboarding submit failed (${res.status()}): ${JSON.stringify(body)}`);
  }
}
