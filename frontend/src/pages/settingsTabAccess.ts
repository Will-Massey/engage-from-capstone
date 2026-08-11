/**
 * Which Settings tabs a role can actually do something on. Without this, every
 * tab renders for every role and a role the backend will reject can fill in a
 * whole tab of fields before finding out — via a generic error — that Save
 * was never going to work.
 *
 * Role sets below are copied from the backend authorize() calls they mirror;
 * keep in sync if those change.
 */

/**
 * PUT /tenants/settings (backend/src/routes/tenants/settings.ts) is the only
 * route that persists these tabs. It reads `authorize('ADMIN','PARTNER','MANAGER')`,
 * but authorize() short-circuits on hasFullAccess() first
 * (backend/src/middleware/auth.ts) and FULL_ACCESS_ROLES is ['ADMIN','MD']
 * (backend/src/constants/roles.ts) — so MD is admitted too and must see these
 * tabs. Settings.tsx also grants MD the AI mailbox auto-reply control, which
 * lives on the Communications tab. Only SENIOR and JUNIOR are rejected.
 */
const SETTINGS_SAVE_TAB_IDS = new Set([
  'practice',
  'branding',
  'communications',
  'templates',
  'billing',
]);
const SETTINGS_SAVE_ROLES = new Set(['ADMIN', 'PARTNER', 'MD', 'MANAGER']);

/**
 * GET and POST /auth/users (backend/src/routes/auth.ts) — the Team tab's list
 * and Add User — both authorize ADMIN, PARTNER, MD, MANAGER. SENIOR and
 * JUNIOR cannot even read the team list.
 */
const TEAM_TAB_ID = 'team';
const TEAM_ROLES = new Set(['ADMIN', 'PARTNER', 'MD', 'MANAGER']);

/**
 * Creating a firm group is ADMIN/PARTNER only — createFirmGroup() in
 * backend/src/services/firmGroupService.ts rejects every other role, and the
 * `canAdmin` flag the API returns is false until a group exists, so it cannot
 * be used to decide whether the tab should appear.
 */
const FIRM_GROUP_CREATE_ROLES = new Set(['ADMIN', 'PARTNER']);

/**
 * Firm group is a multi-firm feature most single practices never use, so the
 * tab stays out of the way — but it must still be reachable by whoever can
 * create the group, otherwise multi-firm onboarding is URL-only.
 */
export function isFirmGroupTabVisible(assigned: boolean, role: string | undefined | null): boolean {
  if (assigned) return true;
  if (!role) return false;
  return FIRM_GROUP_CREATE_ROLES.has(role);
}

/** True if `role` has at least one thing it can save/read on `tabId`. */
export function isSettingsTabVisibleForRole(
  tabId: string,
  role: string | undefined | null
): boolean {
  if (!role) return true; // role not loaded yet — don't hide tabs based on nothing
  if (SETTINGS_SAVE_TAB_IDS.has(tabId)) return SETTINGS_SAVE_ROLES.has(role);
  if (tabId === TEAM_TAB_ID) return TEAM_ROLES.has(role);
  return true;
}

/** Filters a list of tab ids down to the ones visible for `role`. */
export function visibleSettingsTabIds(
  allTabIds: string[],
  role: string | undefined | null
): string[] {
  return allTabIds.filter((id) => isSettingsTabVisibleForRole(id, role));
}
