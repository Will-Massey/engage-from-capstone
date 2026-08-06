/** Pure helpers for the public proposal signing flow (ProposalView). */

export type SigningStep = 'sign' | 'payment' | 'confirmation';

export function splitCoverLetterParagraphs(...parts: Array<string | undefined>): string[] {
  const text = parts.filter(Boolean).join('\n\n');
  return text
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function isProposalExpired(validUntil: string, now: Date = new Date()): boolean {
  return new Date(validUntil) < now;
}

export interface SignatureFormInput {
  signatureData: string;
  signerName: string;
  signerRole: string;
  signerEmail: string;
  /** Single combined tick: documents read + authorised to sign. */
  consentAccepted: boolean;
}

export function collectSignatureValidationErrors(form: SignatureFormInput): string[] {
  const errors: string[] = [];
  if (!form.signatureData) errors.push('Please provide your signature');
  if (!form.signerName.trim()) errors.push('Please provide your name');
  if (!form.signerRole.trim()) errors.push('Please provide your role');
  if (!form.signerEmail.trim()) errors.push('Please provide your email');
  if (!form.consentAccepted) {
    errors.push('Please confirm you have read the documents and are authorised to sign');
  }
  return errors;
}

/**
 * The consent sentence shown next to the single checkbox AND stored on the
 * signature record as consentText — it must name every accepted document.
 */
export function buildCombinedConsentText(
  clientName: string | undefined,
  hasEngagementLetter: boolean
): string {
  const subject = clientName?.trim() || 'the client';
  const documents = hasEngagementLetter
    ? 'the terms and conditions and the engagement letter'
    : 'the terms and conditions';
  return `I have read and agree to ${documents}, and I confirm I am authorised to sign on behalf of ${subject}.`;
}

export interface DeviceInfoSnapshot {
  platform: string;
  screenWidth: number;
  screenHeight: number;
  colorDepth: number;
  timezone: string;
  language: string;
  hardwareConcurrency?: number | 'unknown';
  touch: boolean;
  /** How the signature image was produced. Defaults to 'drawn'. */
  signatureMethod?: 'drawn' | 'typed';
}

export function buildSignatureDeviceInfo(snapshot: DeviceInfoSnapshot): string {
  return JSON.stringify({
    platform: snapshot.platform,
    screen: `${snapshot.screenWidth}x${snapshot.screenHeight}`,
    colorDepth: snapshot.colorDepth,
    timezone: snapshot.timezone,
    language: snapshot.language,
    cores: snapshot.hardwareConcurrency ?? 'unknown',
    touch: snapshot.touch,
    method: snapshot.signatureMethod ?? 'drawn',
  });
}

export function readBrowserDeviceInfo(): DeviceInfoSnapshot {
  return {
    platform: navigator.platform,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    colorDepth: window.screen.colorDepth,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',
    touch: 'ontouchstart' in window,
  };
}

export interface PublicSignPayloadInput extends SignatureFormInput {
  hasEngagementLetter: boolean;
  clientName?: string;
  deviceInfo: string;
  selectedTierId?: string;
}

export function buildPublicSignPayload(input: PublicSignPayloadInput) {
  return {
    signedBy: input.signerName.trim(),
    signedByRole: input.signerRole.trim(),
    signerEmail: input.signerEmail.trim(),
    signatureData: input.signatureData,
    agreementAccepted: input.consentAccepted,
    engagementLetterAccepted: input.hasEngagementLetter ? input.consentAccepted : undefined,
    authorisedToSign: input.consentAccepted,
    deviceInfo: input.deviceInfo,
    consentText: buildCombinedConsentText(input.clientName, input.hasEngagementLetter),
    ...(input.selectedTierId ? { selectedTierId: input.selectedTierId } : {}),
  };
}
