import {
  letterSignConsentText,
  parseLetterMeta,
  readHmrc648Track,
  readLetterSign,
} from '../letterTrack';

describe('letterTrack helpers', () => {
  it('reads a stored signature and 64-8 stage', () => {
    const json = JSON.stringify({
      sign: { signedBy: 'Jane', signedAt: '2026-08-30T10:00:00.000Z' },
      hmrc64_8: { stage: 'LIVE', updatedAt: '2026-08-30T11:00:00.000Z' },
    });
    expect(readLetterSign(json)?.signedBy).toBe('Jane');
    expect(readHmrc648Track(json)?.stage).toBe('LIVE');
    expect(parseLetterMeta('not-json')).toEqual({});
  });

  it('names the client in the consent sentence', () => {
    expect(letterSignConsentText('Fortis Ltd')).toContain('Fortis Ltd');
  });
});
