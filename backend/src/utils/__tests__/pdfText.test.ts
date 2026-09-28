import { guardPdfText, toPdfWinAnsi } from '../pdfText.js';

/**
 * Same encode PDFKit 0.14 uses for Helvetica: variable-length hex, then read
 * back as byte pairs. An odd-length code shifts the rest of the line.
 */
const WIN_ANSI_MAP: Record<number, number> = {
  402: 131,
  8211: 150,
  8212: 151,
  8216: 145,
  8217: 146,
  8218: 130,
  8220: 147,
  8221: 148,
  8222: 132,
  8224: 134,
  8225: 135,
  8226: 149,
  8230: 133,
  8364: 128,
  8240: 137,
  8249: 139,
  8250: 155,
  710: 136,
  8482: 153,
  338: 140,
  339: 156,
  732: 152,
  352: 138,
  353: 154,
  376: 159,
  381: 142,
  382: 158,
};

function pdfkitHelvetica(text: string): string {
  let hex = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const code = WIN_ANSI_MAP[cp] || cp;
    hex += code.toString(16);
  }
  let out = '';
  for (let i = 0; i + 1 < hex.length; i += 2) {
    out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  }
  return out;
}

describe('toPdfWinAnsi', () => {
  it('stops a leading tab from scrambling the rest of a street line', () => {
    const raw = '\t6 Ashby Road';
    expect(pdfkitHelvetica(raw)).not.toContain('Ashby');
    expect(pdfkitHelvetica(toPdfWinAnsi(raw))).toBe(' 6 Ashby Road');
  });

  it('turns a narrow no-break space in a phone number into a normal space', () => {
    const raw = '01788\u202F890123';
    expect(pdfkitHelvetica(raw)).not.toBe('01788 890123');
    expect(pdfkitHelvetica(toPdfWinAnsi(raw))).toBe('01788 890123');
  });

  it('stops a leading tab from scrambling a phone number', () => {
    const raw = '\t01788 890123';
    expect(pdfkitHelvetica(raw)).not.toContain('01788');
    expect(pdfkitHelvetica(toPdfWinAnsi(raw))).toBe(' 01788 890123');
  });

  it('drops a Latin-extended letter that would shift the following glyphs', () => {
    const raw = '\u0100Braunston';
    expect(pdfkitHelvetica(raw)).not.toContain('Braunston');
    expect(pdfkitHelvetica(toPdfWinAnsi(raw))).toBe('Braunston');
  });

  it('keeps pounds, accents, and straight punctuation', () => {
    expect(toPdfWinAnsi('£1,250 — café')).toBe('£1,250 - café');
  });

  it('rewrites strings passed to a PDF document', () => {
    const doc = {
      text(value: unknown) {
        return value;
      },
    };
    guardPdfText(doc);
    expect(doc.text('\tBraunston')).toBe(' Braunston');
    expect(doc.text(42)).toBe(42);
  });
});
