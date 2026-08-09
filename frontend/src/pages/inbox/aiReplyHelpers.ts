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
