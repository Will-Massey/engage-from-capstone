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

/** Roles that see operational/analytical sidebar items — hidden from JUNIOR to keep their nav focused on delivery. */
export const STAFF_NAV_ROLES = ['ADMIN', 'PARTNER', 'MD', 'MANAGER', 'SENIOR'];

/** Whether `role` can see a nav item. No `allowedRoles` list means visible to everyone. */
export function canViewNavItem(role: string | null | undefined, allowedRoles?: string[]): boolean {
  if (!allowedRoles) return true;
  return !!role && allowedRoles.includes(role);
}
