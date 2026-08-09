import { describe, it, expect } from 'vitest';
import {
  draftForConversation,
  conversationIdsWithDrafts,
  editIsForSelectedConversation,
  type AiReplyDraft,
} from '../aiReplyHelpers';

const draft = (over: Partial<AiReplyDraft> = {}): AiReplyDraft => ({
  id: 'd1',
  conversationId: 'c1',
  inboundMessageId: 'm1',
  subject: 'Re: VAT question',
  bodyText: 'Thanks Ada.',
  status: 'pending',
  createdAt: '2026-08-09T09:05:00Z',
  ...over,
});

describe('draftForConversation', () => {
  it('returns the pending draft for the conversation', () => {
    expect(draftForConversation([draft()], 'c1')?.id).toBe('d1');
  });

  it('returns null for another conversation, a null id, or a decided draft', () => {
    expect(draftForConversation([draft()], 'c2')).toBeNull();
    expect(draftForConversation([draft()], null)).toBeNull();
    expect(draftForConversation([draft({ status: 'sent' })], 'c1')).toBeNull();
  });

  it('prefers the newest pending draft when several exist', () => {
    const older = draft({ id: 'old', createdAt: '2026-08-09T08:00:00Z' });
    const newer = draft({ id: 'new', createdAt: '2026-08-09T10:00:00Z' });
    expect(draftForConversation([older, newer], 'c1')?.id).toBe('new');
  });
});

describe('conversationIdsWithDrafts', () => {
  it('collects only pending conversation ids', () => {
    const set = conversationIdsWithDrafts([
      draft(),
      draft({ id: 'd2', conversationId: 'c2', status: 'dismissed' }),
    ]);
    expect(set.has('c1')).toBe(true);
    expect(set.has('c2')).toBe(false);
  });
});

describe('editIsForSelectedConversation', () => {
  it('is true only when the editing draft belongs to the selected conversation', () => {
    expect(editIsForSelectedConversation('d1', [draft()], 'c1')).toBe(true);
  });

  it('is false when nothing is being edited', () => {
    expect(editIsForSelectedConversation(null, [draft()], 'c1')).toBe(false);
  });

  it('is false when no conversation is selected', () => {
    expect(editIsForSelectedConversation('d1', [draft()], null)).toBe(false);
  });

  it('is false once the user switches to a different conversation', () => {
    expect(editIsForSelectedConversation('d1', [draft()], 'c2')).toBe(false);
  });

  it('is false if the editing draft id no longer exists in the drafts list', () => {
    expect(editIsForSelectedConversation('gone', [draft()], 'c1')).toBe(false);
  });
});
