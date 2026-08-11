import { describe, it, expect } from 'vitest';
import { isSettingsTabVisibleForRole, visibleSettingsTabIds } from '../settingsTabAccess';

const SETTINGS_SAVE_TABS = ['practice', 'branding', 'communications', 'templates', 'billing'];

describe('isSettingsTabVisibleForRole', () => {
  it('shows PUT /tenants/settings tabs to ADMIN, PARTNER, MANAGER', () => {
    for (const tab of SETTINGS_SAVE_TABS) {
      expect(isSettingsTabVisibleForRole(tab, 'ADMIN')).toBe(true);
      expect(isSettingsTabVisibleForRole(tab, 'PARTNER')).toBe(true);
      expect(isSettingsTabVisibleForRole(tab, 'MANAGER')).toBe(true);
    }
  });

  it('hides PUT /tenants/settings tabs from SENIOR, JUNIOR, and MD', () => {
    for (const tab of SETTINGS_SAVE_TABS) {
      expect(isSettingsTabVisibleForRole(tab, 'SENIOR')).toBe(false);
      expect(isSettingsTabVisibleForRole(tab, 'JUNIOR')).toBe(false);
      expect(isSettingsTabVisibleForRole(tab, 'MD')).toBe(false);
    }
  });

  it('shows the Team tab to ADMIN, PARTNER, MD, MANAGER (matches GET /auth/users)', () => {
    expect(isSettingsTabVisibleForRole('team', 'ADMIN')).toBe(true);
    expect(isSettingsTabVisibleForRole('team', 'PARTNER')).toBe(true);
    expect(isSettingsTabVisibleForRole('team', 'MD')).toBe(true);
    expect(isSettingsTabVisibleForRole('team', 'MANAGER')).toBe(true);
  });

  it('hides the Team tab from SENIOR and JUNIOR', () => {
    expect(isSettingsTabVisibleForRole('team', 'SENIOR')).toBe(false);
    expect(isSettingsTabVisibleForRole('team', 'JUNIOR')).toBe(false);
  });

  it('leaves the My account tab (profile + theme + password/2FA) visible to every role', () => {
    for (const role of ['ADMIN', 'PARTNER', 'MD', 'MANAGER', 'SENIOR', 'JUNIOR']) {
      expect(isSettingsTabVisibleForRole('profile', role)).toBe(true);
    }
  });

  it('leaves the Automation and Firm group tabs visible to every role', () => {
    for (const role of ['ADMIN', 'PARTNER', 'MD', 'MANAGER', 'SENIOR', 'JUNIOR']) {
      expect(isSettingsTabVisibleForRole('automation', role)).toBe(true);
      expect(isSettingsTabVisibleForRole('firm-group', role)).toBe(true);
    }
  });

  it('does not hide tabs when the role is not yet known', () => {
    expect(isSettingsTabVisibleForRole('billing', undefined)).toBe(true);
    expect(isSettingsTabVisibleForRole('billing', null)).toBe(true);
  });
});

describe('visibleSettingsTabIds', () => {
  // Post-consolidation tab set (task-11): profile absorbed appearance and
  // security, and the duplicated Integrations tab was deleted outright — see
  // frontend/src/pages/Settings.tsx and frontend/src/pages/integrations/IntegrationsHub.tsx.
  const CONSOLIDATED_TABS = [
    'profile',
    'practice',
    'branding',
    'communications',
    'billing',
    'templates',
    'team',
    'automation',
    'firm-group',
  ];

  it('filters the full tab list down for a JUNIOR user', () => {
    expect(visibleSettingsTabIds(CONSOLIDATED_TABS, 'JUNIOR')).toEqual([
      'profile',
      'automation',
      'firm-group',
    ]);
  });

  it('shows every tab to an ADMIN user', () => {
    expect(visibleSettingsTabIds(CONSOLIDATED_TABS, 'ADMIN')).toEqual(CONSOLIDATED_TABS);
  });
});
