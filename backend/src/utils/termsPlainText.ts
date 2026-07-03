/**
 * Proposal T&Cs are stored as plain text (no markdown). Helpers for normalisation and placeholders.
 */

export const TERMS_PLACEHOLDERS = {
  PRACTICE_NAME: '{{PRACTICE_NAME}}',
  PAYMENT_TERMS: '{{PAYMENT_TERMS}}',
  GOVERNING_LAW: '{{GOVERNING_LAW}}',
  CANCELLATION_NOTICE: '{{CANCELLATION_NOTICE}}',
} as const;

/** Strip markdown heading markers so raw # never appears in client-facing pre blocks. */
export function stripMarkdownHeadings(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const m = line.match(/^(#{1,6})\s+(.*)$/);
      if (m) {
        const title = m[2].trim();
        return title.toUpperCase() === title ? title : title;
      }
      return line.replace(/\*\*/g, '');
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function applyTermsPlaceholders(
  template: string,
  values: {
    practiceName: string;
    paymentTermsLabel: string;
    governingLaw: string;
    cancellationNotice: string;
  }
): string {
  return template
    .replace(/\{\{PRACTICE_NAME\}\}/g, values.practiceName)
    .replace(/\{\{PAYMENT_TERMS\}\}/g, values.paymentTermsLabel)
    .replace(/\{\{GOVERNING_LAW\}\}/g, values.governingLaw)
    .replace(/\{\{CANCELLATION_NOTICE\}\}/g, values.cancellationNotice)
    .replace(/within 30 days/gi, `within ${values.paymentTermsLabel}`)
    .replace(/the laws of England and Wales/gi, `the laws of ${values.governingLaw}`);
}