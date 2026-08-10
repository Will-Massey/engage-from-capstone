export type AiReplyDraft = {
  id: string;
  conversationId: string;
  inboundMessageId: string;
  subject: string;
  bodyText: string;
  status: string;
  createdAt: string;
  /** Which auto-send guard held this draft back, when one did. */
  heldBy?: string | null;
};

/**
 * Plain-language reason a draft is waiting for a person, for the cases where
 * automatic sending was on and the system deliberately stopped. Without this
 * a held draft looks identical to an ordinary one, so a practice cannot tell
 * that the system asked for a human on purpose. Unknown reasons fall back to
 * a truthful generic line rather than being hidden.
 */
export function heldReasonLabel(heldBy: string | null | undefined): string | null {
  if (!heldBy) return null;
  switch (heldBy) {
    case 'money-figure':
      return 'Held for you: this reply mentions an amount, so it is never sent automatically.';
    case 'conversation-cooldown':
      return 'Held for you: an AI reply already went to this conversation recently.';
    case 'tenant-daily-cap':
      return 'Held for you: the practice has reached its daily limit for automatic replies.';
    case 'business-hours':
      return 'Held for you: it is outside your sending hours.';
    default:
      return 'Held for you: automatic sending was stopped for this reply.';
  }
}

/** Newest pending draft for a conversation, or null. */
export function draftForConversation(
  drafts: AiReplyDraft[],
  conversationId: string | null
): AiReplyDraft | null {
  if (!conversationId) return null;
  const pending = drafts
    .filter((d) => d.status === 'pending' && d.conversationId === conversationId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return pending[0] ?? null;
}

export function conversationIdsWithDrafts(drafts: AiReplyDraft[]): Set<string> {
  return new Set(drafts.filter((d) => d.status === 'pending').map((d) => d.conversationId));
}

/**
 * An "Edit then send" click must only ever attach to the draft/conversation
 * it was raised for. If the user switches to a different conversation (or
 * the mail they were editing for no longer matches the one selected) before
 * hitting send, the edit is abandoned rather than silently marking a
 * different thread's draft as decided.
 */
export function editIsForSelectedConversation(
  editingDraftId: string | null,
  drafts: AiReplyDraft[],
  selectedConversationId: string | null
): boolean {
  if (!editingDraftId || !selectedConversationId) return false;
  const draft = drafts.find((d) => d.id === editingDraftId);
  return draft?.conversationId === selectedConversationId;
}

/**
 * True only while the draft being edited is still pending — i.e. still safe
 * to approve-with-edits. False once it's missing from the list or has moved
 * to any decided status (approved/dismissed/sent/failed elsewhere, e.g. a
 * colleague in a shared mailbox). Used after a failed approve attempt to
 * decide whether the edit can still be retried or must be abandoned, rather
 * than silently falling through to the plain send path with stale text.
 */
export function editingDraftStillPending(
  editingDraftId: string | null,
  drafts: AiReplyDraft[]
): boolean {
  if (!editingDraftId) return false;
  const draft = drafts.find((d) => d.id === editingDraftId);
  return draft?.status === 'pending';
}
