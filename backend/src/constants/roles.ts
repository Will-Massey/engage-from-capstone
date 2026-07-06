import { UserRole } from '@prisma/client';

/** Managing Director — full tenant access (same as ADMIN for route guards). */
export const FULL_ACCESS_ROLES: UserRole[] = ['ADMIN', 'MD'];

/** Partner-level approvers (proposals, queue badges). */
export const APPROVER_ROLES: UserRole[] = ['ADMIN', 'PARTNER', 'MD', 'MANAGER'];

export function hasFullAccess(role: UserRole): boolean {
  return FULL_ACCESS_ROLES.includes(role);
}

export function isApprover(role: UserRole): boolean {
  return APPROVER_ROLES.includes(role);
}
