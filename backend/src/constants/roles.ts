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

/**
 * Privilege ranking for user-management authorization. Higher = more powerful.
 * ADMIN and MD share the top rank (both are full-access).
 */
export const ROLE_RANK: Record<UserRole, number> = {
  JUNIOR: 1,
  SENIOR: 2,
  MANAGER: 3,
  PARTNER: 4,
  MD: 5,
  ADMIN: 5,
};

/**
 * May `actorRole` assign `targetRole` to a user? Prevents vertical privilege
 * escalation: only full-access actors (ADMIN/MD) can grant a full-access role,
 * and no one can grant a role above their own rank.
 */
export function canAssignRole(actorRole: UserRole, targetRole: UserRole): boolean {
  if (hasFullAccess(actorRole)) return true;
  if (hasFullAccess(targetRole)) return false;
  return ROLE_RANK[targetRole] <= ROLE_RANK[actorRole];
}

/**
 * May `actorRole` modify/deactivate a user who currently holds `targetRole`?
 * Non-full-access actors can never manage a full-access user, nor one ranked
 * above themselves.
 */
export function canManageUser(actorRole: UserRole, targetRole: UserRole): boolean {
  if (hasFullAccess(actorRole)) return true;
  if (hasFullAccess(targetRole)) return false;
  return ROLE_RANK[targetRole] <= ROLE_RANK[actorRole];
}
