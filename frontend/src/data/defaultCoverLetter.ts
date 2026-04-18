/**
 * Default cover letter when the user does not write their own in the proposal builder.
 */
export function generateDefaultCoverLetter(params: {
  clientName: string;
  practiceName: string;
}): string {
  const { clientName, practiceName } = params;

  return `Dear ${clientName},

Thank you for the opportunity to support you and your business. Following our recent discussions, we are pleased to set out this formal proposal for the professional services described in the following pages.

This document summarises the scope of work we propose to undertake, how our fees are calculated, the basis on which we will act, and the next steps if you wish to proceed. We have aimed to keep the layout clear so that you can review each service line, applicable VAT, and the overall investment required.

If anything is unclear or you would like to adjust the scope before committing, please contact us and we will be glad to discuss. We are committed to agreeing an engagement that is proportionate, transparent, and aligned with your needs.

Should you be happy to proceed, please complete the electronic acceptance attached to this proposal (or confirm in writing as agreed). Once accepted, we will agree timelines for onboarding, information we require from you, and how we will keep in touch through the year.

We appreciate your consideration and look forward to working with you.

Kind regards,

${practiceName}`;
}
