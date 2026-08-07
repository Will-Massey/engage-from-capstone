import { describe, expect, it } from 'vitest';
import {
  buildCombinedConsentText,
  buildPublicSignPayload,
  buildSignatureDeviceInfo,
  collectSignatureValidationErrors,
  isProposalExpired,
  splitCoverLetterParagraphs,
} from '../publicSigning';

describe('public signing page helpers (one-screen flow)', () => {
  describe('buildCombinedConsentText', () => {
    it('names terms only when there is no engagement letter', () => {
      expect(buildCombinedConsentText('Acme Ltd', false)).toBe(
        'I have read and agree to the terms and conditions, and I confirm I am authorised to sign on behalf of Acme Ltd.'
      );
    });

    it('names both documents when an engagement letter exists', () => {
      expect(buildCombinedConsentText('Acme Ltd', true)).toBe(
        'I have read and agree to the terms and conditions and the engagement letter, and I confirm I am authorised to sign on behalf of Acme Ltd.'
      );
    });

    it('falls back to "the client" when no client name', () => {
      expect(buildCombinedConsentText(undefined, false)).toContain('on behalf of the client.');
      expect(buildCombinedConsentText('   ', true)).toContain('on behalf of the client.');
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

  describe('collectSignatureValidationErrors', () => {
    const valid = {
      signatureData: 'data:image/png;base64,abc',
      signerName: 'Jane Client',
      signerRole: 'Director',
      signerEmail: 'jane@acme.test',
      consentAccepted: true,
    };

    it('returns no errors for a complete form', () => {
      expect(collectSignatureValidationErrors(valid)).toEqual([]);
    });

    it('flags every missing field including the single consent tick', () => {
      const errors = collectSignatureValidationErrors({
        signatureData: '',
        signerName: ' ',
        signerRole: '',
        signerEmail: '',
        consentAccepted: false,
      });
      expect(errors.length).toBe(5);
      expect(errors).toContain(
        'Please confirm you have read the documents and are authorised to sign'
      );
    });
  });

  describe('buildSignatureDeviceInfo', () => {
    it('serialises the forensic snapshot including signature method', () => {
      const json = buildSignatureDeviceInfo({
        platform: 'MacIntel',
        screenWidth: 1440,
        screenHeight: 900,
        colorDepth: 24,
        timezone: 'Europe/London',
        language: 'en-GB',
        hardwareConcurrency: 8,
        touch: false,
        signatureMethod: 'typed',
      });
      const parsed = JSON.parse(json);
      expect(parsed.screen).toBe('1440x900');
      expect(parsed.method).toBe('typed');
    });

    it('defaults method to drawn when unspecified', () => {
      const json = buildSignatureDeviceInfo({
        platform: 'Win32',
        screenWidth: 1920,
        screenHeight: 1080,
        colorDepth: 24,
        timezone: 'Europe/London',
        language: 'en-GB',
        touch: true,
      });
      expect(JSON.parse(json).method).toBe('drawn');
    });
  });

  describe('buildPublicSignPayload', () => {
    const base = {
      signatureData: 'sig',
      signerName: 'Jane Client',
      signerRole: 'Director',
      signerEmail: 'jane@acme.test',
      consentAccepted: true,
      clientName: 'Acme Ltd',
      deviceInfo: '{"platform":"test"}',
    };

    it('derives all three accept flags from the single tick (with letter)', () => {
      const payload = buildPublicSignPayload({
        ...base,
        hasEngagementLetter: true,
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
      expect(payload.consentText).toBe(
        'I have read and agree to the terms and conditions and the engagement letter, and I confirm I am authorised to sign on behalf of Acme Ltd.'
      );
    });

    it('omits engagement acceptance and tier when absent', () => {
      const payload = buildPublicSignPayload({ ...base, hasEngagementLetter: false });
      expect(payload.engagementLetterAccepted).toBeUndefined();
      expect(payload.selectedTierId).toBeUndefined();
      expect(payload.consentText).toBe(
        'I have read and agree to the terms and conditions, and I confirm I am authorised to sign on behalf of Acme Ltd.'
      );
    });
  });
});
