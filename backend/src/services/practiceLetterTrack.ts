import crypto from 'crypto';

export const HMRC_64_8_STAGES = [
  'PACK_DRAFT',
  'SENT_TO_CLIENT',
  'CLIENT_AUTHORISED',
  'SUBMITTED_HMRC',
  'LIVE',
] as const;

export type Hmrc648Stage = (typeof HMRC_64_8_STAGES)[number];

export type LetterSignState = {
  tokenHash: string;
  createdAt: string;
  signedAt?: string;
  signedBy?: string;
  signerEmail?: string;
  signatureData?: string;
  consentText?: string;
  deviceInfo?: string;
};

export type Hmrc648HistoryItem = {
  stage: Hmrc648Stage;
  at: string;
  note?: string;
};

export type Hmrc648Track = {
  stage: Hmrc648Stage;
  updatedAt: string;
  notes?: string;
  history: Hmrc648HistoryItem[];
};

export function hashLetterToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 24);
}

export function createLetterSignToken(letterId: string): { token: string; tokenHash: string } {
  const secret = crypto.randomBytes(16).toString('hex');
  const token = `${letterId}.${secret}`;
  return { token, tokenHash: hashLetterToken(token) };
}

export function letterIdFromSignToken(token: string): string | null {
  const dot = token.indexOf('.');
  if (dot !== 36) return null;
  const letterId = token.slice(0, dot);
  const secret = token.slice(dot + 1);
  if (!/^[0-9a-f-]{36}$/i.test(letterId) || secret.length < 16) return null;
  return letterId;
}

export function parseLetterMeta(metaJson?: string | null): Record<string, unknown> {
  try {
    const parsed = JSON.parse(metaJson || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function getLetterSign(meta: Record<string, unknown>): LetterSignState | null {
  const sign = meta.sign;
  if (!sign || typeof sign !== 'object' || Array.isArray(sign)) return null;
  const rec = sign as Partial<LetterSignState>;
  if (typeof rec.tokenHash !== 'string' || typeof rec.createdAt !== 'string') return null;
  return rec as LetterSignState;
}

export function applySignLink(
  meta: Record<string, unknown>,
  tokenHash: string
): Record<string, unknown> {
  return {
    ...meta,
    sign: {
      tokenHash,
      createdAt: new Date().toISOString(),
    } satisfies LetterSignState,
  };
}

export function applyLetterSignature(
  meta: Record<string, unknown>,
  input: {
    signedBy: string;
    signerEmail: string;
    signatureData: string;
    consentText: string;
    deviceInfo?: string;
  }
): Record<string, unknown> {
  const existing = getLetterSign(meta);
  return {
    ...meta,
    sign: {
      tokenHash: existing?.tokenHash || '',
      createdAt: existing?.createdAt || new Date().toISOString(),
      signedAt: new Date().toISOString(),
      signedBy: input.signedBy,
      signerEmail: input.signerEmail,
      signatureData: input.signatureData,
      consentText: input.consentText,
      deviceInfo: input.deviceInfo,
    } satisfies LetterSignState,
  };
}

export function isValidHmrc648Stage(value: string): value is Hmrc648Stage {
  return (HMRC_64_8_STAGES as readonly string[]).includes(value);
}

export function getHmrc648Track(meta: Record<string, unknown>): Hmrc648Track | null {
  const track = meta.hmrc64_8;
  if (!track || typeof track !== 'object' || Array.isArray(track)) return null;
  const rec = track as Partial<Hmrc648Track>;
  if (!rec.stage || !isValidHmrc648Stage(rec.stage)) return null;
  return {
    stage: rec.stage,
    updatedAt: typeof rec.updatedAt === 'string' ? rec.updatedAt : new Date().toISOString(),
    notes: typeof rec.notes === 'string' ? rec.notes : undefined,
    history: Array.isArray(rec.history) ? rec.history.slice(-20) : [],
  };
}

export function seedHmrc648Track(): Hmrc648Track {
  const at = new Date().toISOString();
  return {
    stage: 'PACK_DRAFT',
    updatedAt: at,
    history: [{ stage: 'PACK_DRAFT', at }],
  };
}

export function applyHmrc648Stage(
  meta: Record<string, unknown>,
  stage: Hmrc648Stage,
  note?: string
): Record<string, unknown> {
  const current = getHmrc648Track(meta) || seedHmrc648Track();
  const at = new Date().toISOString();
  const history = [...current.history, { stage, at, ...(note ? { note } : {}) }].slice(-20);
  const next: Hmrc648Track = {
    stage,
    updatedAt: at,
    notes: note || current.notes,
    history,
  };
  return { ...meta, hmrc64_8: next };
}
