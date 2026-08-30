export const HMRC_64_8_STAGES = [
  'PACK_DRAFT',
  'SENT_TO_CLIENT',
  'CLIENT_AUTHORISED',
  'SUBMITTED_HMRC',
  'LIVE',
] as const;

export type Hmrc648Stage = (typeof HMRC_64_8_STAGES)[number];

export const HMRC_64_8_STAGE_LABELS: Record<Hmrc648Stage, string> = {
  PACK_DRAFT: 'Pack drafted',
  SENT_TO_CLIENT: 'Sent to client',
  CLIENT_AUTHORISED: 'Client authorised',
  SUBMITTED_HMRC: 'Submitted to HMRC',
  LIVE: 'Live in Agent Services',
};

export type LetterSignState = {
  tokenHash?: string;
  createdAt?: string;
  signedAt?: string;
  signedBy?: string;
  signerEmail?: string;
};

export type Hmrc648Track = {
  stage: Hmrc648Stage;
  updatedAt: string;
  notes?: string;
};

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

export function readLetterSign(metaJson?: string | null): LetterSignState | null {
  const sign = parseLetterMeta(metaJson).sign;
  if (!sign || typeof sign !== 'object' || Array.isArray(sign)) return null;
  return sign as LetterSignState;
}

export function readHmrc648Track(metaJson?: string | null): Hmrc648Track | null {
  const track = parseLetterMeta(metaJson).hmrc64_8;
  if (!track || typeof track !== 'object' || Array.isArray(track)) return null;
  const rec = track as Partial<Hmrc648Track>;
  if (!rec.stage || !(HMRC_64_8_STAGES as readonly string[]).includes(rec.stage)) return null;
  return {
    stage: rec.stage,
    updatedAt: typeof rec.updatedAt === 'string' ? rec.updatedAt : '',
    notes: typeof rec.notes === 'string' ? rec.notes : undefined,
  };
}

export function letterSignConsentText(clientName: string): string {
  const subject = clientName.trim() || 'the client';
  return `I have read this letter and I am authorised to sign on behalf of ${subject}.`;
}
