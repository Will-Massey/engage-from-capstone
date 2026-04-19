/**
 * Default cover letter when the user does not write their own in the proposal builder.
 */
export function generateDefaultCoverLetter(params: {
  /** Salutation: main contact name when available, otherwise the client / business name */
  addresseeName: string;
  practiceName: string;
  /** Legal or trading name on the client record (for body copy when different from addressee) */
  clientBusinessName?: string;
}): string {
  const { addresseeName, practiceName, clientBusinessName } = params;
  const business = clientBusinessName?.trim();
  const opening =
    business && business !== addresseeName.trim()
      ? `Thank you for the opportunity to support you and ${business}. Following our recent discussions, we are pleased to set out this formal proposal for the professional services described in the following pages.`
      : `Thank you for the opportunity to support you and your business. Following our recent discussions, we are pleased to set out this formal proposal for the professional services described in the following pages.`;

  return `Dear ${addresseeName},

${opening}

This document summarises the scope of work we propose to undertake, how our fees are calculated, the basis on which we will act, and the next steps if you wish to proceed. We have aimed to keep the layout clear so that you can review each service line, applicable VAT, and the recurring monthly cost alongside any one-off charges.

If anything is unclear or you would like to adjust the scope before committing, please contact us and we will be glad to discuss. We are committed to agreeing an engagement that is proportionate, transparent, and aligned with your needs.

Should you be happy to proceed, please complete the electronic acceptance attached to this proposal (or confirm in writing as agreed). Once accepted, we will agree timelines for onboarding, information we require from you, and how we will keep in touch through the year.

We appreciate your consideration and look forward to working with you.

Kind regards,

${practiceName}`;
}

