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
 * route that persists these tabs, and it authorizes ADMIN, PARTNER, MANAGER
 * only. SENIOR, JUNIOR, and MD cannot save anything on them.
 */
const SETTINGS_SAVE_TAB_IDS = new Set([
  'practice',
  'branding',
  'communications',
  'templates',
  'billing',
]);
const SETTINGS_SAVE_ROLES = new Set(['ADMIN', 'PARTNER', 'MANAGER']);

/**
 * GET and POST /auth/users (backend/src/routes/auth.ts) — the Team tab's list
 * and Add User — both authorize ADMIN, PARTNER, MD, MANAGER. SENIOR and
 * JUNIOR cannot even read the team list.
 */
const TEAM_TAB_ID = 'team';
const TEAM_ROLES = new Set(['ADMIN', 'PARTNER', 'MD', 'MANAGER']);

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
