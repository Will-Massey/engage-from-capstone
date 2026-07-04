import type { CoverLetterTone } from '../../data/defaultCoverLetter';

export type BuildMode = 'unset' | 'manual' | 'clara' | 'template';

export interface ProposalTemplateSummary {
  id: string;
  name: string;
  description?: string | null;
  title: string;
  serviceCount: number;
}

/** Serializable snapshot stored per client in localStorage */
export interface ProposalDraft {
  selectedServices: unknown[];
  proposalTitle: string;
  coverLetter: string;
  coverLetterTone?: CoverLetterTone;
  currentStep: number;
  contractStartDate: string;
  validUntil: string;
  buildMode?: BuildMode;
  selectedTemplateId?: string | null;
}

export const LEGACY_NEW_DRAFT_KEY = 'engage_proposal_builder_draft';

/** Remove all locally cached proposal builder drafts (call on logout). */
export function clearAllProposalDrafts(): void {
  if (typeof localStorage === 'undefined') return;
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (
      key &&
      (key === LEGACY_NEW_DRAFT_KEY ||
        key.startsWith('engage_proposal_draft_') ||
        key.startsWith('engage_proposal_edit_draft_'))
    ) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

export function proposalDraftKey(proposalId: string | undefined, clientId: string): string {
  if (proposalId) return `engage_proposal_edit_draft_${proposalId}`;
  return `engage_proposal_draft_${clientId}`;
}

const DECIMAL_DRAFT_RE = /^\d*\.?\d{0,2}$/;

export function isValidDecimalDraft(value: string): boolean {
  return value === '' || DECIMAL_DRAFT_RE.test(value);
}

/** Parse a decimal price field; keeps last good value while the user is typing */
export function parseDecimalInput(value: string, fallback: number): number {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '.') return fallback;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}