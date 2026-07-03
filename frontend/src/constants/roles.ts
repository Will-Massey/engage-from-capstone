/** Mirrors backend/src/constants/roles.ts — keep in sync. */
export const FULL_ACCESS_ROLES = new Set(['ADMIN', 'MD']);

export const APPROVER_ROLES = new Set(['ADMIN', 'PARTNER', 'MD', 'MANAGER']);

export const STAFF_WITH_AI = new Set(['ADMIN', 'PARTNER', 'MD', 'MANAGER', 'SENIOR']);

export function hasFullAccess(role?: string | null): boolean {
  return !!role && FULL_ACCESS_ROLES.has(role);
}

export function isApprover(role?: string | null): boolean {
  return !!role && APPROVER_ROLES.has(role);
}