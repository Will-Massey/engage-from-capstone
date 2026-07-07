/** Pure helpers for the public proposal signing flow (ProposalView). */

export type SigningStep =
  | 'review'
  | 'terms'
  | 'engagement'
  | 'identity'
  | 'sign'
  | 'payment'
  | 'confirmation';

export interface PublicSigningProposalInput {
  engagementLetter?: string | null;
}

export function buildSigningSteps(
  proposal: PublicSigningProposalInput
): { id: SigningStep; label: string }[] {
  const steps: { id: SigningStep; label: string }[] = [
    { id: 'review', label: 'Review' },
    { id: 'terms', label: 'Terms' },
  ];
  if (proposal.engagementLetter?.trim()) {
    steps.push({ id: 'engagement', label: 'Engagement' });
  }
  steps.push({ id: 'identity', label: 'Identity' }, { id: 'sign', label: 'Sign' });
  return steps;
}

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

export function getNextSigningStep(
  current: SigningStep,
  steps: { id: SigningStep; label: string }[]
): SigningStep | null {
  const idx = steps.findIndex((s) => s.id === current);
  if (idx < 0 || idx >= steps.length - 1) return null;
  return steps[idx + 1].id;
}

export function getPreviousSigningStep(
  current: SigningStep,
  steps: { id: SigningStep; label: string }[]
): SigningStep | 'exit' {
  if (current === 'review') return 'exit';
  const idx = steps.findIndex((s) => s.id === current);
  if (idx <= 0) return 'exit';
  return steps[idx - 1].id;
}

export interface SignatureFormInput {
  signatureData: string;
  signerName: string;
  signerRole: string;
  signerEmail: string;
  authorisedToSign: boolean;
}

export function collectSignatureValidationErrors(form: SignatureFormInput): string[] {
  const errors: string[] = [];
  if (!form.signatureData) errors.push('Please provide your signature');
  if (!form.signerName.trim()) errors.push('Please provide your name');
  if (!form.signerRole.trim()) errors.push('Please provide your role');
  if (!form.signerEmail.trim()) errors.push('Please provide your email');
  if (!form.authorisedToSign) {
    errors.push('Please confirm you are authorised to sign on behalf of the client');
  }
  return errors;
}

export function buildSignatureConsentText(clientName?: string): string {
  const subject = clientName?.trim() || 'the client';
  return `I confirm I am authorised to sign on behalf of ${subject} and agree to the terms of this proposal.`;
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
  termsAccepted: boolean;
  engagementLetterAccepted: boolean;
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
    agreementAccepted: input.termsAccepted,
    engagementLetterAccepted: input.hasEngagementLetter
      ? input.engagementLetterAccepted
      : undefined,
    authorisedToSign: input.authorisedToSign,
    deviceInfo: input.deviceInfo,
    consentText: buildSignatureConsentText(input.clientName),
    ...(input.selectedTierId ? { selectedTierId: input.selectedTierId } : {}),
  };
}
