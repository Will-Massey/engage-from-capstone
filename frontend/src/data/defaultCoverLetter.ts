/**
 * Cover letter tone options (maps to backend CoverLetterTone)
 */
export type CoverLetterTone = 'PROFESSIONAL' | 'FRIENDLY' | 'MODERN';

export interface CoverLetterStyle {
  tone: CoverLetterTone;
  name: string;
  description: string;
  preview: string; // short label for the card
}

/**
 * The three built-in professional cover letter styles.
 * These match the seeded system templates.
 */
export const COVER_LETTER_STYLES: CoverLetterStyle[] = [
  {
    tone: 'PROFESSIONAL',
    name: 'Traditional & Formal',
    description:
      'Serious, established practice tone. Ideal for audit, corporate, regulated clients.',
    preview: 'Dear … — measured, precise, credentials-first',
  },
  {
    tone: 'FRIENDLY',
    name: 'Warm & Personable',
    description:
      'Relationship-led and conversational. Perfect for owner-managed businesses and SMEs.',
    preview: 'Hi … — friendly, reassuring, conversation-first',
  },
  {
    tone: 'MODERN',
    name: 'Modern, Direct & Confident',
    description: 'Expert recommendation style. Clear outcomes, no fluff. Suits growth businesses.',
    preview: 'Direct address — outcome focused, confident',
  },
];

/**
 * Compute a human-friendly services summary from selected services.
 */
export function buildServicesSummary(services: Array<{ name: string }>): string {
  if (!services || services.length === 0) return 'the proposed services';
  const names = services.map((s) => s.name);
  if (names.length === 1) return names[0].toLowerCase();
  if (names.length === 2) return `${names[0].toLowerCase()} and ${names[1].toLowerCase()}`;
  const head = names.slice(0, -1).map((n) => n.toLowerCase());
  const last = names[names.length - 1].toLowerCase();
  return `${head.join(', ')}, and ${last}`;
}

/**
 * Format a nice discussion date reference.
 */
export function formatDiscussionDate(date?: Date | string): string {
  if (!date) return 'our recent discussion';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return 'our recent discussion';
  }
}

/**
 * Generate a fully autofilled cover letter for a chosen tone.
 * All name fields etc are populated from the provided context.
 */
export function generateCoverLetterForTone(params: {
  tone: CoverLetterTone;
  /** Preferred salutation name (contact first name or full) */
  addresseeName: string;
  /** Client company / legal name */
  companyName?: string;
  practiceName: string;
  /** Current user name */
  senderName?: string;
  senderPosition?: string;
  /** Selected services for summary */
  services?: Array<{ name: string }>;
  /** Optional explicit discussion/meeting date */
  discussionDate?: Date | string;
  /** Optional monthly recurring total (formatted) */
  monthlyTotal?: string;
  /** Optional key outcome phrase for Modern tone */
  keyOutcome?: string;
}): string {
  const {
    tone,
    addresseeName,
    companyName,
    practiceName,
    senderName = '',
    senderPosition = '',
    services = [],
    discussionDate,
    monthlyTotal,
    keyOutcome,
  } = params;

  const clientName = addresseeName?.trim() || 'Client';
  const company = companyName?.trim() || clientName;
  const servicesSummary = buildServicesSummary(services);
  const when = formatDiscussionDate(discussionDate);
  // Omit the sign-off name line entirely when no sender name is set, rather
  // than printing a placeholder like "Your Name".
  const senderNameLine = senderName?.trim() ? `${senderName.trim()}\n\n` : '';
  const senderLine = senderPosition
    ? `${senderNameLine}${senderPosition}, ${practiceName}`
    : `${senderNameLine}${practiceName}`;

  if (tone === 'PROFESSIONAL') {
    return `Dear ${clientName},

Thank you for the opportunity to present this proposal for ${servicesSummary} to ${company}. Following our discussion on ${when}, we have set out below the scope of work, fee structure, and terms under which we would be pleased to act on your behalf.

${practiceName} has many years of experience supporting businesses in the UK, and we believe the approach outlined in this proposal reflects both the requirements you described and the standards we hold ourselves to as a professional practice.

We would welcome the opportunity to discuss this proposal further at your convenience, and to answer any questions you may have before proceeding.

Yours sincerely,

${senderLine}`;
  }

  if (tone === 'FRIENDLY') {
    const investment = monthlyTotal ? `\n\nThe monthly investment is ${monthlyTotal}.` : '';
    return `Hi ${clientName},

It was great speaking with you about ${company} — it's clear you've built something you care about, and I wanted to put together something that actually reflects what you need rather than a generic package.

Attached is our proposal for ${servicesSummary}. I've tried to keep it straightforward: what we'll do, what it costs, and what you can expect from us month to month. No surprises, no jargon you don't need.${investment}

If anything doesn't make sense, or you want to talk through any of it, just call or drop me a message — happy to go through it together.

Best,

${senderNameLine}${practiceName}`;
  }

  // MODERN
  const outcome = keyOutcome || 'clear financial visibility and full compliance';
  return `${clientName},

Based on what you've told us about ${company}, here's what we'd recommend and what it would look like working with us.

The short version: ${servicesSummary}. Full detail, pricing, and timelines are in the attached proposal.

We're confident this gets you ${outcome}. If you want to move forward, the next step is below — if you've got questions first, let's talk this week.

${senderNameLine}${practiceName}`;
}

/**
 * Legacy helper (kept for compatibility).
 * Returns the Professional style by default.
 */
export function generateDefaultCoverLetter(params: {
  addresseeName: string;
  practiceName: string;
  clientBusinessName?: string;
}): string {
  return generateCoverLetterForTone({
    tone: 'PROFESSIONAL',
    addresseeName: params.addresseeName,
    companyName: params.clientBusinessName,
    practiceName: params.practiceName,
  });
}

/** Helper to get style metadata by tone */
export function getStyleByTone(tone: CoverLetterTone): CoverLetterStyle | undefined {
  return COVER_LETTER_STYLES.find((s) => s.tone === tone);
}
