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

  it('leaves self-service tabs visible to every role', () => {
    for (const role of ['ADMIN', 'PARTNER', 'MD', 'MANAGER', 'SENIOR', 'JUNIOR']) {
      expect(isSettingsTabVisibleForRole('profile', role)).toBe(true);
      expect(isSettingsTabVisibleForRole('appearance', role)).toBe(true);
      expect(isSettingsTabVisibleForRole('security', role)).toBe(true);
    }
  });

  it('does not hide tabs when the role is not yet known', () => {
    expect(isSettingsTabVisibleForRole('billing', undefined)).toBe(true);
    expect(isSettingsTabVisibleForRole('billing', null)).toBe(true);
  });
});

describe('visibleSettingsTabIds', () => {
  it('filters the full tab list down for a JUNIOR user', () => {
    const all = [
      'profile',
      'practice',
      'branding',
      'appearance',
      'communications',
      'templates',
      'billing',
      'team',
      'security',
      'automation',
      'integrations',
      'firm-group',
    ];
    expect(visibleSettingsTabIds(all, 'JUNIOR')).toEqual([
      'profile',
      'appearance',
      'security',
      'automation',
      'integrations',
      'firm-group',
    ]);
  });
});
