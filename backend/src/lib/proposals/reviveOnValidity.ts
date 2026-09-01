const TERMINAL_STATUSES = new Set(['ACCEPTED', 'DECLINED', 'LOST', 'WITHDRAWN', 'ARCHIVED']);

export interface ValidityReviveInput {
  currentStatus: string;
  viewedAt?: Date | null;
  nextValidUntil: Date;
  shareToken?: string | null;
  shareTokenExpiry?: Date | null;
  publicAccessEnabled?: boolean;
  now?: Date;
}

export interface ValidityRevivePatch {
  status?: 'SENT' | 'VIEWED';
  expiredAt: null;
  shareTokenExpiry?: Date;
}

/** When validity is extended into the future, reopen the proposal and keep the client link alive. */
export function buildValidityRevivePatch(input: ValidityReviveInput): ValidityRevivePatch | null {
  const now = input.now ?? new Date();
  if (input.nextValidUntil.getTime() <= now.getTime()) return null;
  if (TERMINAL_STATUSES.has(input.currentStatus)) return null;

  const patch: ValidityRevivePatch = { expiredAt: null };

  if (input.currentStatus === 'EXPIRED') {
    patch.status = input.viewedAt ? 'VIEWED' : 'SENT';
  }

  if (input.publicAccessEnabled && input.shareToken) {
    const minExpiry = input.nextValidUntil;
    if (!input.shareTokenExpiry || input.shareTokenExpiry.getTime() < minExpiry.getTime()) {
      patch.shareTokenExpiry = minExpiry;
    }
  }

  return patch;
}
