/**
 * UK Compliant Engagement Letter Template
 * Based on ACCA and ICAEW guidelines for professional engagement letters
 */

export interface EngagementLetterData {
  practiceName: string;
  practiceAddress: string;
  practiceRegulatoryBody: string;
  practiceRegistrationNumber: string;
  practiceVatNumber?: string;
  clientName: string;
  clientAddress: string;
  clientCompanyNumber?: string;
  services: string[];
  periodStart: string;
  periodEnd: string;
  fees: {
    description: string;
    amount: number;
    billingFrequency: string;
  }[];
  paymentTerms: string;
  commencementDate: string;
  vatApplicable: boolean;
  professionalIndemnityLimit?: number;
}

export function generateEngagementLetter(data: EngagementLetterData): string {
  const vatClause = data.vatApplicable
    ? `Our fees are subject to VAT at the prevailing rate (currently 20%). Our VAT registration number is ${data.practiceVatNumber || '[VAT NUMBER]'}.`
    : 'Our fees are not subject to VAT.';

  const feesTable = data.fees
    .map(
      (fee) => `
| ${fee.description} | £${fee.amount.toLocaleString()} | ${fee.billingFrequency} |
`
    )
    .join('');

  return `# LETTER OF ENGAGEMENT

**Professional Accountancy Services**

---

**Date:** ${data.commencementDate}

**To:** ${data.clientName}  
**Address:** ${data.clientAddress}
${data.clientCompanyNumber ? `**Company Number:** ${data.clientCompanyNumber}` : ''}

**From:** ${data.practiceName}  
**Address:** ${data.practiceAddress}

**Our Reference:** ENG-${Date.now().toString(36).toUpperCase()}

---

## 1. INTRODUCTION

Thank you for appointing ${data.practiceName} to act as your accountants. This letter sets out the terms of our engagement and the basis upon which we will provide our services to you.

We are registered with ${data.practiceRegulatoryBody} under registration number ${data.practiceRegistrationNumber}.

## 2. SCOPE OF SERVICES

We have agreed to provide the following professional services for the period ${data.periodStart} to ${data.periodEnd}:

${data.services.map((service) => `- ${service}`).join('\n')}

### 2.1 Specific Service Inclusions

**For Accounts Preparation:**
- Preparation of annual financial statements
- Filing with Companies House (where applicable)
- Director's report preparation
- Compliance with FRS 102 or applicable accounting framework

**For Tax Compliance:**
- Preparation and submission of relevant tax returns
- Tax computations and calculations
- Liaison with HMRC on routine matters
- Advice on payment dates and amounts

**For VAT Services:**
- VAT return preparation and submission
- Making Tax Digital (MTD) compliance
- VAT registration/deregistration assistance
- General VAT guidance

**For Payroll Services:**
- Monthly/weekly payroll processing
- RTI submissions to HMRC
- Auto-enrolment compliance
- P60 and P11D preparation

## 3. CLIENT RESPONSIBILITIES

As our client, you are responsible for:

### 3.1 Record Keeping
- Maintaining accurate and complete accounting records
- Retaining all source documents (invoices, receipts, bank statements)
- Providing records in a timely manner (minimum 4 weeks before statutory deadlines)
- Ensuring all transactions are properly authorised

### 3.2 Information Provision
- Providing complete and accurate information
- Notifying us promptly of any changes in circumstances
- Disclosing all relevant facts and transactions
- Informing us of any tax investigations or enquiries

### 3.3 Legal Compliance
- Ensuring compliance with all relevant legislation
- Payment of taxes and NICs when due
- Filing returns by statutory deadlines
- Maintaining proper business insurance

## 4. OUR RESPONSIBILITIES

We will:
- Carry out our work with reasonable skill and care
- Comply with applicable professional standards and ethical requirements
- Maintain appropriate professional indemnity insurance
- Maintain confidentiality of your affairs (subject to legal obligations)
- Provide advice based on information provided by you
- Notify you of relevant filing deadlines

## 5. FEES AND PAYMENT TERMS

### 5.1 Our Fees

| Service | Fee | Billing Frequency |
|---------|-----|-------------------|
${feesTable}

${vatClause}

### 5.2 Payment Terms
- Invoices are payable within ${data.paymentTerms} of the invoice date
- Late payments may incur interest at 8% above Bank of England base rate
- We reserve the right to suspend services for non-payment
- For recurring services, payment by Direct Debit is preferred

### 5.3 Additional Work
Any work outside the agreed scope will be charged at our standard hourly rates:
- Partner: £250 per hour
- Manager: £175 per hour
- Senior: £125 per hour
- Junior: £85 per hour

We will always seek your approval before undertaking additional work.

## 6. LIMITATION OF LIABILITY

### 6.1 Professional Indemnity Insurance
We maintain professional indemnity insurance in accordance with ${data.practiceRegulatoryBody} requirements.${data.professionalIndemnityLimit ? ` Our current cover is £${data.professionalIndemnityLimit.toLocaleString()}.` : ''}

### 6.2 Liability Cap
Our liability for any claim arising from our services is limited to:
- The fees paid for the specific service giving rise to the claim, or
- £1,000,000 (whichever is lower)

This does not apply to claims arising from fraud, dishonesty, or death/personal injury.

### 6.3 Time Limit
Any claim must be notified to us in writing within 6 months of the event giving rise to the claim.

## 7. CONFIDENTIALITY AND DATA PROTECTION

### 7.1 Confidentiality
We will keep your affairs confidential except where:
- Disclosure is required by law or regulatory authority
- Disclosure is necessary for the performance of our services
- You have given express consent

### 7.2 Data Protection (GDPR)
We process your personal data in accordance with our Privacy Notice (available on request). You have the right to:
- Access your personal data
- Request correction of inaccurate data
- Request deletion of data (subject to legal obligations)
- Object to processing in certain circumstances

## 8. MONEY LAUNDERING REGULATIONS

We are required by the Money Laundering, Terrorist Financing and Transfer of Funds (Information on the Payer) Regulations 2017 to:
- Verify your identity and address
- Identify beneficial owners
- Monitor transactions for suspicious activity
- Report suspicious activity to the National Crime Agency (without notifying you)

We may terminate this engagement immediately if satisfactory evidence of identity is not provided.

## 9. TAX PLANNING AND ADVICE

### 9.1 Tax Planning
Any tax planning advice will be based on legislation current at the time. We will not recommend aggressive tax avoidance schemes.

### 9.2 Tax Disclosures
You are responsible for ensuring accurate disclosure on all tax returns. We will not be responsible for penalties arising from:
- Incomplete or inaccurate information provided by you
- Failure to disclose relevant information to us
- Late submission due to delayed provision of records

## 10. RETENTION OF RECORDS

### 10.1 Our Records
We will retain your records for a minimum of 7 years in accordance with professional requirements.

### 10.2 Your Records
You must retain your original records for at least 6 years (HMRC may request them).

## 11. TERMINATION

Either party may terminate this engagement by giving 3 months' written notice.

We may terminate immediately if:
- Fees remain unpaid for more than 60 days
- You fail to provide required information
- There is a conflict of interest
- We are required to do so by our regulatory body

Upon termination:
- You must pay all outstanding fees
- We will provide reasonable handover to new accountants
- We retain lien over documents until fees are paid

## 12. COMPLAINTS PROCEDURE

If you are dissatisfied with our services:
1. Contact your relationship manager in the first instance
2. If unresolved, contact the Practice Manager
3. If still unresolved, you may contact ${data.practiceRegulatoryBody}

## 13. GOVERNING LAW

This agreement is governed by the laws of England and Wales. Any disputes will be subject to the exclusive jurisdiction of the English courts.

## 14. ENTIRE AGREEMENT

This letter constitutes the entire agreement between us. It supersedes all prior agreements, representations, or understandings.

## 15. ACCEPTANCE

Please confirm your acceptance of these terms by:
1. Signing and dating the duplicate copy of this letter
2. Returning it to us within 14 days
3. Making payment of the initial fee as specified in our invoice

**This agreement will not become effective until we have received your signed acceptance.**

---

## DECLARATION

I confirm that:
- I have read and understood this engagement letter
- I agree to the terms and conditions set out above
- I will provide complete and accurate information
- I understand my responsibilities as set out in this letter

**Signed:** _________________________ **Date:** _______________

**Name (Print):** _________________________ **Position:** _______________

**Company (if applicable):** _________________________

---

**For and on behalf of ${data.practiceName}:**

**Signed:** _________________________ **Date:** _______________

**Name (Print):** _________________________ **Position:** _______________

---

*Version: ENG-2024-001*  
*This document should be reviewed annually or when services change*
`;
}

// Standard proposal terms and conditions (shorter version for proposals)
export function generateProposalTerms(): string {
  return `# TERMS AND CONDITIONS OF SERVICE

## 1. Acceptance of Proposal

By accepting this proposal, you agree to engage ${'{{PRACTICE_NAME}}'} to provide the services detailed herein, subject to the terms and conditions set out below and our full Letter of Engagement to be provided upon acceptance.

## 2. Services

We will provide the services described in this proposal with reasonable skill and care, in accordance with applicable professional standards and the rules of our regulatory body.

## 3. Fees

### 3.1 Fee Structure
- Fees are as stated in this proposal
- VAT will be applied at the prevailing rate where applicable
- For recurring services, fees may be reviewed annually

### 3.2 Payment Terms
- Invoices are payable within 30 days
- Monthly/Quarterly services: billed in advance
- Annual/One-off services: billed on completion or as agreed
- Late payments subject to interest at 8% above Bank of England base rate

## 4. Client Obligations

You agree to:
- Provide complete and accurate information
- Supply records in a timely manner
- Notify us of any changes in circumstances
- Pay fees in accordance with these terms
- Maintain proper business records

## 5. Limitation of Liability

Our liability is limited to the fees paid for the specific service or £1,000,000, whichever is lower. This does not exclude liability for fraud, death, or personal injury.

## 6. Confidentiality

We maintain strict confidentiality of your affairs, subject to legal and regulatory obligations, including anti-money laundering regulations.

## 7. Termination

Either party may terminate by giving 3 months' written notice. We may terminate immediately for non-payment or failure to provide required information.

## 8. Governing Law

These terms are governed by the laws of England and Wales.

## 9. Acceptance

Your electronic or physical signature on this proposal constitutes acceptance of these terms and agreement to our full Letter of Engagement.

---

**Version:** PRO-2024-001  
**Date:** ${new Date().toLocaleDateString('en-GB')}
`;
}

// Generate email template for proposal sending
export function generateProposalEmailTemplate(data: {
  clientName: string;
  practiceName: string;
  proposalReference: string;
  proposalTitle: string;
  viewLink: string;
  senderName: string;
  senderPosition: string;
  validUntil: string;
}): { subject: string; html: string; text: string } {
  const subject = `Proposal: ${data.proposalTitle} - ${data.proposalReference}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Proposal from ${data.practiceName}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  
  <div style="background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">${data.practiceName}</h1>
    <p style="color: #e0f2fe; margin: 10px 0 0 0;">Professional Accountancy Services</p>
  </div>
  
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
    <p>Dear ${data.clientName},</p>
    
    <p>Thank you for considering ${data.practiceName} for your accountancy needs.</p>
    
    <p>We are pleased to present our proposal for:</p>
    
    <div style="background: #f8fafc; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #0ea5e9;">
      <h2 style="margin: 0 0 10px 0; color: #0f172a; font-size: 18px;">${data.proposalTitle}</h2>
      <p style="margin: 0; color: #64748b; font-size: 14px;">Reference: ${data.proposalReference}</p>
    </div>
    
    <p style="background: #fef3c7; padding: 15px; border-radius: 6px; border-left: 4px solid #f59e0b;">
      <strong>⏰ Valid Until:</strong> ${data.validUntil}
    </p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${data.viewLink}" style="background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
        View Full Proposal
      </a>
    </div>
    
    <p>You can review the full proposal, including detailed service descriptions and fees, by clicking the button above. The proposal can be accepted electronically or you can contact us to discuss any questions.</p>
    
    <p>We look forward to working with you.</p>
    
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0;"><strong>${data.senderName}</strong></p>
      <p style="margin: 5px 0 0 0; color: #64748b;">${data.senderPosition}</p>
      <p style="margin: 5px 0 0 0; color: #64748b;">${data.practiceName}</p>
    </div>
  </div>
  
  <div style="background: #f8fafc; padding: 20px; border-radius: 0 0 8px 8px; text-align: center; border: 1px solid #e5e7eb; border-top: none;">
    <p style="margin: 0; font-size: 12px; color: #94a3b8;">
      This email contains confidential information. If you received this in error, please delete it.<br>
      © ${new Date().getFullYear()} ${data.practiceName}. All rights reserved.
    </p>
  </div>
  
</body>
</html>
`;

  const text = `
${data.practiceName} - Professional Accountancy Services

Dear ${data.clientName},

Thank you for considering ${data.practiceName} for your accountancy needs.

We are pleased to present our proposal for:

${data.proposalTitle}
Reference: ${data.proposalReference}

Valid Until: ${data.validUntil}

View the full proposal here:
${data.viewLink}

You can review the full proposal, including detailed service descriptions and fees, by visiting the link above. The proposal can be accepted electronically or you can contact us to discuss any questions.

We look forward to working with you.

Best regards,

${data.senderName}
${data.senderPosition}
${data.practiceName}

---
This email contains confidential information. If you received this in error, please delete it.
© ${new Date().getFullYear()} ${data.practiceName}. All rights reserved.
`;

  return { subject, html, text };
}

export default {
  generateEngagementLetter,
  generateProposalTerms,
  generateProposalEmailTemplate,
};
