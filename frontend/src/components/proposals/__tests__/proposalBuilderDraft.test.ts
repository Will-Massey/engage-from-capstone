import { describe, it, expect } from 'vitest';
import { isValidDecimalDraft, parseDecimalInput, proposalDraftKey } from '../proposalBuilderDraft';

describe('proposalBuilderDraft helpers', () => {
  it('proposalDraftKey scopes new vs edit drafts', () => {
    expect(proposalDraftKey(undefined, 'client-a')).toBe('engage_proposal_draft_client-a');
    expect(proposalDraftKey('prop-1', 'client-a')).toBe('engage_proposal_edit_draft_prop-1');
  });

  it('isValidDecimalDraft allows empty and up to 2dp', () => {
    expect(isValidDecimalDraft('')).toBe(true);
    expect(isValidDecimalDraft('12.3')).toBe(true);
    expect(isValidDecimalDraft('12.34')).toBe(true);
    expect(isValidDecimalDraft('12.345')).toBe(false);
    expect(isValidDecimalDraft('abc')).toBe(false);
  });

  it('parseDecimalInput keeps fallback while typing', () => {
    expect(parseDecimalInput('', 42)).toBe(42);
    expect(parseDecimalInput('.', 10)).toBe(10);
    expect(parseDecimalInput('85.5', 0)).toBe(85.5);
    expect(parseDecimalInput('-1', 7)).toBe(7);
  });
});
