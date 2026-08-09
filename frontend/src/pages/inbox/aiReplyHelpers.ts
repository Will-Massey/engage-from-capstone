export type AiReplyDraft = {
  id: string;
  conversationId: string;
  inboundMessageId: string;
  subject: string;
  bodyText: string;
  status: string;
  createdAt: string;
};

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
