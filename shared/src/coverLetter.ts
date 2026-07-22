/**
 * Cover-letter presentation helper.
 *
 * Cover letters are stored as free prose that (depending on the generator)
 * opens with its own greeting — and has been seen to open with the SAME
 * greeting twice. This normalises the header for display everywhere (client
 * preview, public view, PDF): strip any leading salutation line(s) from the
 * body, then render the company name at the top (where there's a distinct
 * contact person) followed by a single "Dear <person>," greeting.
 */

// A whole-line salutation: "Dear Jane,", "Hi Jane", "Hello," — the line is
// ONLY the greeting (up to a short name + optional comma), not "Dear X, <sentence>".
const PURE_GREETING_RE =
  /^(dear|hi|hello|greetings|good (?:morning|afternoon|evening))\b[^,\n]{0,40},?\s*$/i;

/** A standalone salutation paragraph like "Dear Jane,", "Hi Jane", or bare "Jane Smith,". */
function isGreetingParagraph(paragraph: string, names: string[]): boolean {
  const line = paragraph.trim();
  if (line.includes('\n')) return false;
  if (PURE_GREETING_RE.test(line)) return true;
  const bare = line.replace(/[,.\s]+$/, '').toLowerCase();
  return names.some((n) => n && bare === n.toLowerCase());
}

export interface FormattedCoverLetter {
  /** Company name shown above the greeting, or null when it would duplicate the addressee. */
  companyLine: string | null;
  /** Single greeting line, e.g. "Dear Michelle Beesley,". */
  greeting: string;
  /** Body paragraphs with any leading greeting(s) removed. */
  paragraphs: string[];
}

export function formatCoverLetter(params: {
  body?: string | null;
  summary?: string | null;
  contactName?: string | null;
  companyName?: string | null;
}): FormattedCoverLetter {
  const merged = [params.body?.trim(), params.summary?.trim()].filter(Boolean).join('\n\n');
  const paragraphs = merged
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const contact = params.contactName?.trim() || '';
  const company = params.companyName?.trim() || '';
  const names = [contact, company].filter(Boolean);

  // Remove any run of leading salutation paragraphs (the duplicate-greeting bug).
  while (paragraphs.length && isGreetingParagraph(paragraphs[0], names)) {
    paragraphs.shift();
  }
  // Also strip an inline leading "Dear <name>," prefix if the greeting shares a
  // paragraph with the first sentence. The comma must fall right after a 1–3
  // word name, so a real sentence opening with "Dear …" is left untouched.
  if (paragraphs.length) {
    const stripped = paragraphs[0]
      .replace(/^(dear|hi|hello|greetings)\s+\S+(?:\s+\S+){0,2},\s*/i, '')
      .trim();
    if (stripped) {
      paragraphs[0] = stripped;
    } else {
      paragraphs.shift();
    }
  }

  const greetingName = contact || company || 'Sir/Madam';
  const greeting = `Dear ${greetingName},`;
  const companyLine =
    contact && company && company.toLowerCase() !== contact.toLowerCase() ? company : null;

  return { companyLine, greeting, paragraphs };
}
