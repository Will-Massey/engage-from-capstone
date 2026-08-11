import { describe, it, expect } from 'vitest';
import { NAV_SECTIONS } from '../navigation';
import { STAFF_NAV_ROLES } from '../../constants/roles';

const findItem = (name: string) =>
  NAV_SECTIONS.flatMap((s) => s.items).find((item) => item.name === name);

describe('sidebar role gating', () => {
  it('hides Automations, Integrations, Analytics, and Fee calculator from JUNIOR', () => {
    for (const name of ['Automations', 'Integrations', 'Analytics', 'Fee calculator']) {
      const item = findItem(name);
      expect(item, `expected a nav item named "${name}"`).toBeTruthy();
      expect(item!.roles).toEqual(STAFF_NAV_ROLES);
    }
  });

  it('never gates the daily-use items', () => {
    for (const name of ['Home', 'Jobs', 'Inbox', 'Clients', 'Documents', 'Proposals']) {
      const item = findItem(name);
      expect(item, `expected a nav item named "${name}"`).toBeTruthy();
      expect(item!.roles).toBeUndefined();
    }
  });
});

describe('sidebar structure', () => {
  it('no longer shows the partner-demo pre-sales section', () => {
    expect(NAV_SECTIONS.find((s) => s.id === 'gtm')).toBeUndefined();
    expect(findItem('Switch from Engager')).toBeUndefined();
    expect(findItem('Trust pack')).toBeUndefined();
  });

  it('has no single-item sections', () => {
    for (const section of NAV_SECTIONS) {
      expect(section.items.length, `section "${section.label}" has too few items`).toBeGreaterThan(
        1
      );
    }
  });

  it('surfaces billing in the Account section', () => {
    const account = NAV_SECTIONS.find((s) => s.id === 'account');
    expect(account?.items.some((item) => item.href === '/subscription')).toBe(true);
  });
});
