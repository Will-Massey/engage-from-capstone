import { describe, it, expect } from 'vitest';
import {
  hasUnseenNotifications,
  notificationTarget,
  notificationTitle,
  type NotificationItem,
} from '../notifications';

const item = (overrides: Partial<NotificationItem> = {}): NotificationItem => ({
  id: 'a1',
  action: 'PROPOSAL_SIGNED',
  description: 'Signed by Sarah',
  entityType: 'PROPOSAL',
  entityId: 'p1',
  proposalId: 'p1',
  createdAt: '2026-07-19T20:00:00.000Z',
  ...overrides,
});

describe('hasUnseenNotifications', () => {
  it('is false with no items', () => {
    expect(hasUnseenNotifications([], null)).toBe(false);
  });

  it('is true when there is no lastSeen yet', () => {
    expect(hasUnseenNotifications([item()], null)).toBe(true);
  });

  it('is true only when something is newer than lastSeen', () => {
    expect(hasUnseenNotifications([item()], '2026-07-19T19:00:00.000Z')).toBe(true);
    expect(hasUnseenNotifications([item()], '2026-07-19T21:00:00.000Z')).toBe(false);
  });

  it('treats a corrupt lastSeen as unseen', () => {
    expect(hasUnseenNotifications([item()], 'not-a-date')).toBe(true);
  });
});

describe('notificationTarget', () => {
  it('routes proposal events to the proposal', () => {
    expect(notificationTarget(item())).toBe('/proposals/p1');
  });

  it('routes client events to the client', () => {
    expect(
      notificationTarget(
        item({
          action: 'CLIENT_AML_SUBMITTED',
          entityType: 'CLIENT',
          entityId: 'c1',
          proposalId: null,
        })
      )
    ).toBe('/clients/c1');
  });

  it('returns null when there is no destination', () => {
    expect(
      notificationTarget(item({ entityType: 'TENANT', entityId: null, proposalId: null }))
    ).toBeNull();
  });
});

describe('notificationTitle', () => {
  it('maps known actions to friendly titles', () => {
    expect(notificationTitle('PROPOSAL_SIGNED')).toBe('Proposal signed');
    expect(notificationTitle('CLIENT_AML_SUBMITTED')).toBe('AML details submitted');
  });

  it('falls back for unknown actions', () => {
    expect(notificationTitle('SOMETHING_ELSE')).toBe('Activity');
  });
});
