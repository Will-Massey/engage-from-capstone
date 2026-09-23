/**
 * PDFKit's standard fonts (Helvetica) write each character as hex digits
 * (`code.toString(16)`) and concatenate them into one string. A code that is
 * not exactly two digits shifts every following glyph in that text run.
 *
 * A tab (9 → "9"), or any character outside Latin-1 that is not in the
 * WinAnsi extra map, does this. A pasted street, village, or phone number
 * then draws as symbol soup, while plain ASCII on the same page stays intact.
 */

/** Unicode points PDFKit's WinAnsi map already folds down to a single byte. */
const WIN_ANSI_EXTRA = new Set<number>([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0x017e, 0x0178,
]);

/** Make a string safe to draw with PDFKit's built-in fonts. */
export function toPdfWinAnsi(input: string): string {
  const text = input
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\u2026/g, '...');

  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0x0a || cp === 0x0d) {
      out += ch;
      continue;
    }
    if (cp === 0x09) {
      out += ' ';
      continue;
    }
    if ((cp >= 0x20 && cp <= 0xff) || WIN_ANSI_EXTRA.has(cp)) {
      out += ch;
    }
  }
  return out;
}

type PdfTextDoc = {
  text: (text: unknown, ...rest: unknown[]) => unknown;
};

/** Route every doc.text() call through toPdfWinAnsi. */
export function guardPdfText<T extends PdfTextDoc>(doc: T): T {
  const original = doc.text.bind(doc);
  doc.text = (text: unknown, ...rest: unknown[]) => {
    const safe = typeof text === 'string' ? toPdfWinAnsi(text) : text;
    return original(safe, ...rest);
  };
  return doc;
}
