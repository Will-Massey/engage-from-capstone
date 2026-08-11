import { describe, it, expect } from 'vitest';
import { STAFF_NAV_ROLES, canViewNavItem } from '../roles';

describe('canViewNavItem', () => {
  it('is visible to everyone when no roles list is set', () => {
    expect(canViewNavItem('JUNIOR', undefined)).toBe(true);
    expect(canViewNavItem(null, undefined)).toBe(true);
    expect(canViewNavItem(undefined, undefined)).toBe(true);
  });

  it('hides restricted items from JUNIOR', () => {
    expect(canViewNavItem('JUNIOR', STAFF_NAV_ROLES)).toBe(false);
  });

  it('shows restricted items to every non-JUNIOR staff role', () => {
    for (const role of STAFF_NAV_ROLES) {
      expect(canViewNavItem(role, STAFF_NAV_ROLES)).toBe(true);
    }
  });

  it('hides restricted items when the role is missing', () => {
    expect(canViewNavItem(null, STAFF_NAV_ROLES)).toBe(false);
    expect(canViewNavItem(undefined, STAFF_NAV_ROLES)).toBe(false);
  });
});
