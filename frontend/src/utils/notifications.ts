/** Pure helpers for the header notification bell. */

export interface NotificationItem {
  id: string;
  action: string;
  description: string | null;
  entityType: string | null;
  entityId: string | null;
  proposalId?: string | null;
  createdAt: string;
}

const ACTION_TITLES: Record<string, string> = {
  PROPOSAL_VIEWED: 'Proposal viewed',
  PROPOSAL_SIGNED: 'Proposal signed',
  PROPOSAL_ACCEPTED: 'Proposal accepted',
  PROPOSAL_DECLINED: 'Proposal declined',
  PROPOSAL_SENT: 'Proposal sent',
  PROPOSAL_SUBMITTED_FOR_APPROVAL: 'Approval requested',
  CLIENT_AML_SUBMITTED: 'AML details submitted',
  CLIENT_INFO_RECEIVED: 'Client info received',
  AML_CHECK_COMPLETED: 'AML check completed',
  PAYMENT_COMPLETED: 'Payment received',
  PROPOSAL_CHASE_SENT: 'Chase reminder sent',
  REGULATORY_SIGNAL_RAISED: 'Regulatory signal',
};

export function notificationTitle(action: string): string {
  return ACTION_TITLES[action] || 'Activity';
}

/** Route target for a notification, or null when there is nowhere to go. */
export function notificationTarget(item: NotificationItem): string | null {
  const proposalId = item.proposalId || (item.entityType === 'PROPOSAL' ? item.entityId : null);
  if (proposalId) return `/proposals/${proposalId}`;
  if (item.entityType === 'CLIENT' && item.entityId) return `/clients/${item.entityId}`;
  return null;
}

/**
 * The dot shows when the newest item is more recent than the last time the
 * user opened the bell. No lastSeen yet → any item counts as unseen.
 */
export function hasUnseenNotifications(
  items: NotificationItem[],
  lastSeenIso: string | null
): boolean {
  if (!items.length) return false;
  if (!lastSeenIso) return true;
  const lastSeen = new Date(lastSeenIso).getTime();
  if (Number.isNaN(lastSeen)) return true;
  return items.some((i) => new Date(i.createdAt).getTime() > lastSeen);
}
