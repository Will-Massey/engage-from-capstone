import {
  applyHmrc648Stage,
  applyLetterSignature,
  applySignLink,
  createLetterSignToken,
  getHmrc648Track,
  getLetterSign,
  hashLetterToken,
  letterIdFromSignToken,
  parseLetterMeta,
  seedHmrc648Track,
} from '../practiceLetterTrack.js';

describe('letter sign tokens', () => {
  it('encodes the letter id and verifies the hash', () => {
    const letterId = '11111111-1111-4111-8111-111111111111';
    const { token, tokenHash } = createLetterSignToken(letterId);
    expect(letterIdFromSignToken(token)).toBe(letterId);
    expect(hashLetterToken(token)).toBe(tokenHash);
    expect(letterIdFromSignToken('not-a-token')).toBeNull();
  });
});

describe('letter meta + signature', () => {
  it('rotates a sign link and records a signature', () => {
    const meta = applySignLink(parseLetterMeta('{"reason":"move"}'), 'abc123');
    expect(getLetterSign(meta)?.tokenHash).toBe('abc123');
    const signed = applyLetterSignature(meta, {
      signedBy: 'Jane Client',
      signerEmail: 'jane@example.com',
      signatureData: 'data:image/png;base64,xx',
      consentText: 'I agree',
    });
    expect(getLetterSign(signed)?.signedBy).toBe('Jane Client');
    expect(signed.reason).toBe('move');
  });
});

describe('64-8 track', () => {
  it('seeds draft and records history when advancing', () => {
    expect(seedHmrc648Track().stage).toBe('PACK_DRAFT');
    const next = applyHmrc648Stage({}, 'LIVE', 'Seen in Agent Services');
    const track = getHmrc648Track(next);
    expect(track?.stage).toBe('LIVE');
    expect(track?.history.some((h) => h.stage === 'LIVE' && h.note)).toBe(true);
  });
});
