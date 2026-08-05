/**
 * Cover-letter presentation helper.
 *
 * Cover letters are stored as free prose that (depending on the generator)
 * opens with its own greeting — and has been seen to open with TWO greetings
 * (e.g. "Hi Jon," followed by "Dear Jon,"). This normalises the header for
 * display everywhere (client preview, public view, PDF): strip the leading
 * salutation run from each source, then render the company name at the top
 * (where there's a distinct contact person) followed by a single greeting.
 * The letter's own salutation style is kept ("Hi Jon," stays "Hi Jon,");
 * "Dear <person>," is only the fallback when the prose had none.
 */

// A whole-line salutation: "Dear Jane,", "Hi Jane", "Hello," — the line is
// ONLY the greeting (up to a short name + optional comma), not "Dear X, <sentence>".
const PURE_GREETING_RE =
  /^(dear|hi|hello|greetings|good (?:morning|afternoon|evening))\b[^,\n]{0,40},?\s*$/i;

// A salutation sharing a paragraph with the first sentence: "Dear Jane, <sentence>".
// The comma must fall right after a 1–3 word name, so a real sentence opening
// with "Dear …" is left untouched.
const INLINE_SALUTATION_RE = /^(dear|hi|hello|greetings)\s+\S+(?:\s+\S+){0,2},\s*/i;

// Does the line open with a salutation word (as opposed to a bare name)?
const SALUTATION_OPENER_RE = /^(dear|hi|hello|greetings|good (?:morning|afternoon|evening))\b/i;

/** A standalone salutation paragraph like "Dear Jane,", "Hi Jane", or bare "Jane Smith,". */
function isGreetingParagraph(paragraph: string, names: string[]): boolean {
  const line = paragraph.trim();
  if (line.includes('\n')) return false;
  if (PURE_GREETING_RE.test(line)) return true;
  const bare = line.replace(/[,.\s]+$/, '').toLowerCase();
  return names.some((n) => n && bare === n.toLowerCase());
}

function splitParagraphs(text?: string | null): string[] {
  const trimmed = text?.trim();
  if (!trimmed) return [];
  return trimmed
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Remove the leading salutation run (standalone greeting paragraphs plus an
 * inline "Dear X," prefix on the first remaining paragraph). Mutates
 * `paragraphs`; returns what was removed so callers can re-use it.
 */
function consumeLeadingSalutations(
  paragraphs: string[],
  names: string[]
): { firstLine: string | null; salutation: string | null } {
  let firstLine: string | null = null;
  let salutation: string | null = null;

  while (paragraphs.length && isGreetingParagraph(paragraphs[0], names)) {
    const line = paragraphs.shift()!.trim();
    if (firstLine === null) firstLine = line;
    if (!salutation && SALUTATION_OPENER_RE.test(line)) {
      salutation = `${line.replace(/[,.\s]+$/, '')},`;
    }
  }

  if (paragraphs.length) {
    const m = paragraphs[0].match(INLINE_SALUTATION_RE);
    if (m) {
      const stripped = paragraphs[0].slice(m[0].length).trim();
      if (!salutation) salutation = m[0].trim();
      if (stripped) {
        paragraphs[0] = stripped;
      } else {
        paragraphs.shift();
      }
    }
  }

  return { firstLine, salutation };
}

/** Does raw letter text open with a salutation (standalone line or inline "Dear X, …")? */
export function startsWithSalutation(text: string, names: string[] = []): boolean {
  const paragraphs = splitParagraphs(text);
  if (!paragraphs.length) return false;
  return isGreetingParagraph(paragraphs[0], names) || INLINE_SALUTATION_RE.test(paragraphs[0]);
}

/** Remove every leading salutation from raw letter text. */
export function stripLeadingGreetings(text: string, names: string[] = []): string {
  const paragraphs = splitParagraphs(text);
  consumeLeadingSalutations(paragraphs, names);
  return paragraphs.join('\n\n');
}

/**
 * Collapse a leading run of salutations in raw letter text to just the first
 * one (the duplicate-greeting bug: "Hi Jon,\n\nDear Jon,\n\n…" → "Hi Jon,\n\n…").
 * Leaves text with at most one greeting untouched.
 */
export function dedupeLeadingGreetings(text: string, names: string[] = []): string {
  const paragraphs = splitParagraphs(text);
  if (!paragraphs.length) return text;
  const before = paragraphs.join('\n\n');
  const { firstLine } = consumeLeadingSalutations(paragraphs, names);
  if (firstLine === null) return text;
  const after = [firstLine, ...paragraphs].join('\n\n');
  return after === before ? text : after;
}

export interface FormattedCoverLetter {
  /** Company name shown above the greeting, or null when it would duplicate the addressee. */
  companyLine: string | null;
  /** Single greeting line, e.g. "Hi Jon," or "Dear Michelle Beesley,". */
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
  const contact = params.contactName?.trim() || '';
  const company = params.companyName?.trim() || '';
  const names = [contact, company].filter(Boolean);

  // Strip each source separately so a summary that re-greets doesn't smuggle
  // a second salutation into the middle of the merged letter.
  const bodyParagraphs = splitParagraphs(params.body);
  const summaryParagraphs = splitParagraphs(params.summary);
  const fromBody = consumeLeadingSalutations(bodyParagraphs, names);
  const fromSummary = consumeLeadingSalutations(summaryParagraphs, names);
  const paragraphs = [...bodyParagraphs, ...summaryParagraphs];

  const greetingName = contact || company || 'Sir/Madam';
  const greeting = fromBody.salutation || fromSummary.salutation || `Dear ${greetingName},`;
  const companyLine =
    contact && company && company.toLowerCase() !== contact.toLowerCase() ? company : null;

  return { companyLine, greeting, paragraphs };
}
