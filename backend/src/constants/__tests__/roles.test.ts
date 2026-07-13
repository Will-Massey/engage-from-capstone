import { canAssignRole, canManageUser } from '../roles.js';

describe('role-hierarchy authorization (privilege-escalation regression)', () => {
  describe('canAssignRole', () => {
    it('lets full-access roles assign anything', () => {
      expect(canAssignRole('ADMIN', 'ADMIN')).toBe(true);
      expect(canAssignRole('ADMIN', 'MD')).toBe(true);
      expect(canAssignRole('MD', 'ADMIN')).toBe(true);
    });

    it('forbids a MANAGER from granting a full-access role (C2/H1)', () => {
      expect(canAssignRole('MANAGER', 'ADMIN')).toBe(false);
      expect(canAssignRole('MANAGER', 'MD')).toBe(false);
      expect(canAssignRole('MANAGER', 'PARTNER')).toBe(false); // above own rank
    });

    it('forbids a PARTNER from granting full access', () => {
      expect(canAssignRole('PARTNER', 'ADMIN')).toBe(false);
      expect(canAssignRole('PARTNER', 'MD')).toBe(false);
    });

    it('allows assigning roles at or below your own rank', () => {
      expect(canAssignRole('MANAGER', 'SENIOR')).toBe(true);
      expect(canAssignRole('MANAGER', 'MANAGER')).toBe(true);
      expect(canAssignRole('PARTNER', 'MANAGER')).toBe(true);
    });
  });

  describe('canManageUser', () => {
    it('forbids a MANAGER from managing an ADMIN/MD (H3)', () => {
      expect(canManageUser('MANAGER', 'ADMIN')).toBe(false);
      expect(canManageUser('MANAGER', 'MD')).toBe(false);
      expect(canManageUser('MANAGER', 'PARTNER')).toBe(false);
    });

    it('lets full-access manage anyone', () => {
      expect(canManageUser('ADMIN', 'ADMIN')).toBe(true);
      expect(canManageUser('MD', 'PARTNER')).toBe(true);
    });

    it('lets a manager manage lower-ranked users', () => {
      expect(canManageUser('MANAGER', 'SENIOR')).toBe(true);
      expect(canManageUser('MANAGER', 'JUNIOR')).toBe(true);
    });
  });
});
