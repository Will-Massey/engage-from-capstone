import { describe, expect, it } from 'vitest';
import {
  buildPublicSignPayload,
  buildSignatureConsentText,
  buildSignatureDeviceInfo,
  buildSigningSteps,
  collectSignatureValidationErrors,
  getNextSigningStep,
  getPreviousSigningStep,
  isProposalExpired,
  splitCoverLetterParagraphs,
} from '../publicSigning';

describe('public signing page helpers', () => {
  describe('buildSigningSteps', () => {
    it('includes engagement step only when letter content exists', () => {
      const without = buildSigningSteps({});
      expect(without.map((s) => s.id)).toEqual(['review', 'terms', 'identity', 'sign']);

      const withLetter = buildSigningSteps({ engagementLetter: '  Scope of work…  ' });
      expect(withLetter.map((s) => s.id)).toEqual([
        'review',
        'terms',
        'engagement',
        'identity',
        'sign',
      ]);
    });
  });

  describe('splitCoverLetterParagraphs', () => {
    it('splits on blank lines and trims empty paragraphs', () => {
      expect(splitCoverLetterParagraphs('Hello\n\nWorld', '  \n\nFooter ')).toEqual([
        'Hello',
        'World',
        'Footer',
      ]);
    });
  });

  describe('isProposalExpired', () => {
    it('returns true when validUntil is in the past', () => {
      expect(isProposalExpired('2020-01-01T00:00:00.000Z', new Date('2026-07-07'))).toBe(true);
      expect(isProposalExpired('2030-01-01T00:00:00.000Z', new Date('2026-07-07'))).toBe(false);
    });
  });

  describe('signing step navigation', () => {
    const steps = buildSigningSteps({ engagementLetter: 'Letter' });

    it('walks forward through the flow', () => {
      expect(getNextSigningStep('review', steps)).toBe('terms');
      expect(getNextSigningStep('sign', steps)).toBeNull();
    });

    it('walks backward and exits from review', () => {
      expect(getPreviousSigningStep('review', steps)).toBe('exit');
      expect(getPreviousSigningStep('identity', steps)).toBe('engagement');
    });
  });

  describe('collectSignatureValidationErrors', () => {
    const valid = {
      signatureData: 'data:image/png;base64,abc',
      signerName: 'Jane Client',
      signerRole: 'Director',
      signerEmail: 'jane@acme.test',
      authorisedToSign: true,
    };

    it('returns no errors for a complete form', () => {
      expect(collectSignatureValidationErrors(valid)).toEqual([]);
    });

    it('flags missing identity and authorisation fields', () => {
      const errors = collectSignatureValidationErrors({
        signatureData: '',
        signerName: ' ',
        signerRole: '',
        signerEmail: '',
        authorisedToSign: false,
      });
      expect(errors.length).toBeGreaterThanOrEqual(4);
      expect(errors).toContain('Please confirm you are authorised to sign on behalf of the client');
    });
  });

  describe('buildSignatureConsentText', () => {
    it('names the client when provided', () => {
      expect(buildSignatureConsentText('Acme Ltd')).toContain('Acme Ltd');
      expect(buildSignatureConsentText()).toContain('the client');
    });
  });

  describe('buildSignatureDeviceInfo', () => {
    it('serialises forensic device snapshot', () => {
      const json = buildSignatureDeviceInfo({
        platform: 'MacIntel',
        screenWidth: 1440,
        screenHeight: 900,
        colorDepth: 24,
        timezone: 'Europe/London',
        language: 'en-GB',
        hardwareConcurrency: 8,
        touch: false,
      });
      const parsed = JSON.parse(json);
      expect(parsed.screen).toBe('1440x900');
      expect(parsed.cores).toBe(8);
      expect(parsed.touch).toBe(false);
    });
  });

  describe('buildPublicSignPayload', () => {
    it('maps form state to the public sign API body', () => {
      const payload = buildPublicSignPayload({
        signatureData: 'sig',
        signerName: 'Jane Client',
        signerRole: 'Director',
        signerEmail: 'jane@acme.test',
        authorisedToSign: true,
        termsAccepted: true,
        engagementLetterAccepted: true,
        hasEngagementLetter: true,
        clientName: 'Acme Ltd',
        deviceInfo: '{"platform":"test"}',
        selectedTierId: 'silver',
      });

      expect(payload).toMatchObject({
        signedBy: 'Jane Client',
        signedByRole: 'Director',
        signerEmail: 'jane@acme.test',
        signatureData: 'sig',
        agreementAccepted: true,
        engagementLetterAccepted: true,
        authorisedToSign: true,
        selectedTierId: 'silver',
      });
      expect(payload.consentText).toContain('Acme Ltd');
    });

    it('omits engagement acceptance when no engagement letter', () => {
      const payload = buildPublicSignPayload({
        signatureData: 'sig',
        signerName: 'Jane',
        signerRole: 'Director',
        signerEmail: 'jane@acme.test',
        authorisedToSign: true,
        termsAccepted: true,
        engagementLetterAccepted: false,
        hasEngagementLetter: false,
        deviceInfo: '{}',
      });
      expect(payload.engagementLetterAccepted).toBeUndefined();
      expect(payload.selectedTierId).toBeUndefined();
    });
  });
});
