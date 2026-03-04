/**
 * Email Templates for Proposal Emails
 * Professional UK accounting firm templates
 */

export interface ProposalEmailData {
  clientName: string;
  proposalTitle: string;
  proposalReference: string;
  viewLink: string;
  senderName: string;
  senderPosition?: string;
  senderEmail: string;
  validUntil: string;
  tenantName: string;
  tenantLogo?: string;
  totalAmount?: string;
  serviceCount?: number;
}

/**
 * Generate professional HTML email template for proposal
 */
export function generateProposalEmailTemplate(data: ProposalEmailData): { html: string; text: string } {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Proposal from ${data.tenantName}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); padding: 30px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 24px; }
    .header p { color: #e0f2fe; margin: 10px 0 0 0; }
    .content { padding: 30px; }
    .greeting { font-size: 18px; margin-bottom: 20px; }
    .proposal-box { background: #f8fafc; border-left: 4px solid #0ea5e9; padding: 20px; margin: 20px 0; border-radius: 0 4px 4px 0; }
    .proposal-title { font-size: 20px; font-weight: bold; color: #0f172a; margin-bottom: 10px; }
    .proposal-ref { color: #64748b; font-size: 14px; }
    .cta-button { display: inline-block; background: #0ea5e9; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
    .cta-button:hover { background: #0284c7; }
    .validity { background: #fef3c7; border: 1px solid #fbbf24; padding: 12px; border-radius: 4px; margin: 20px 0; font-size: 14px; }
    .footer { background: #f8fafc; padding: 20px 30px; text-align: center; color: #64748b; font-size: 14px; }
    .footer a { color: #0ea5e9; }
    .signature { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${escapeHtml(data.tenantName)}</h1>
      <p>Professional Accounting Services</p>
    </div>
    
    <div class="content">
      <p class="greeting">Dear ${escapeHtml(data.clientName)},</p>
      
      <p>We are pleased to present you with a proposal for our accounting services. Please review the details below and let us know if you have any questions.</p>
      
      <div class="proposal-box">
        <div class="proposal-title">${escapeHtml(data.proposalTitle)}</div>
        <div class="proposal-ref">Reference: ${data.proposalReference}</div>
        ${data.totalAmount ? `<div style="margin-top: 10px; font-size: 18px; color: #0ea5e9; font-weight: bold;">Total: ${data.totalAmount}</div>` : ''}
        ${data.serviceCount ? `<div style="margin-top: 5px; color: #64748b;">${data.serviceCount} service${data.serviceCount > 1 ? 's' : ''} included</div>` : ''}
      </div>
      
      <div style="text-align: center;">
        <a href="${data.viewLink}" class="cta-button">View Full Proposal</a>
      </div>
      
      <div class="validity">
        <strong>⏰ Valid Until:</strong> ${data.validUntil}<br>
        Please review and respond before this date to ensure availability.
      </div>
      
      <p>If you have any questions about this proposal or would like to discuss any aspects of our services, please don't hesitate to contact us.</p>
      
      <div class="signature">
        <p>Best regards,</p>
        <p><strong>${escapeHtml(data.senderName)}</strong><br>
        ${data.senderPosition ? `${escapeHtml(data.senderPosition)}<br>` : ''}
        ${escapeHtml(data.tenantName)}<br>
        <a href="mailto:${data.senderEmail}">${data.senderEmail}</a></p>
      </div>
    </div>
    
    <div class="footer">
      <p>This proposal was sent via <strong>Engage by Capstone</strong></p>
      <p style="font-size: 12px; margin-top: 10px;">
        <a href="${data.viewLink}">View Proposal Online</a> | 
        <a href="https://engagebycapstone.co.uk">Learn More</a>
      </p>
    </div>
  </div>
</body>
</html>`;

  const text = `Dear ${data.clientName},

We are pleased to present you with a proposal for our accounting services.

PROPOSAL DETAILS
================
Title: ${data.proposalTitle}
Reference: ${data.proposalReference}
${data.totalAmount ? `Total: ${data.totalAmount}\n` : ''}${data.serviceCount ? `Services: ${data.serviceCount}\n` : ''}
Valid Until: ${data.validUntil}

View the full proposal here:
${data.viewLink}

Please review and respond before ${data.validUntil} to ensure availability.

If you have any questions, please don't hesitate to contact us.

Best regards,
${data.senderName}
${data.senderPosition || ''}
${data.tenantName}
${data.senderEmail}

---
Sent via Engage by Capstone
https://engagebycapstone.co.uk
`;

  return { html, text };
}

/**
 * Generate reminder email for pending proposals
 */
export function generateProposalReminderTemplate(data: ProposalEmailData): { html: string; text: string } {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reminder: Proposal from ${data.tenantName}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 24px; }
    .content { padding: 30px; }
    .reminder-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 0 4px 4px 0; }
    .cta-button { display: inline-block; background: #0ea5e9; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
    .footer { background: #f8fafc; padding: 20px 30px; text-align: center; color: #64748b; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⏰ Gentle Reminder</h1>
    </div>
    
    <div class="content">
      <p>Dear ${escapeHtml(data.clientName)},</p>
      
      <p>We hope this email finds you well. We wanted to follow up on the proposal we sent you recently.</p>
      
      <div class="reminder-box">
        <strong>Proposal:</strong> ${escapeHtml(data.proposalTitle)}<br>
        <strong>Reference:</strong> ${data.proposalReference}<br>
        <strong>Valid Until:</strong> ${data.validUntil}
      </div>
      
      <p>We understand you may be reviewing your options. If you have any questions or need any clarification, please don't hesitate to reach out.</p>
      
      <div style="text-align: center;">
        <a href="${data.viewLink}" class="cta-button">Review Proposal</a>
      </div>
      
      <p>We look forward to hearing from you.</p>
      
      <p>Best regards,<br>
      <strong>${escapeHtml(data.senderName)}</strong><br>
      ${escapeHtml(data.tenantName)}</p>
    </div>
    
    <div class="footer">
      <p>This reminder was sent via Engage by Capstone</p>
    </div>
  </div>
</body>
</html>`;

  const text = `GENTLE REMINDER

Dear ${data.clientName},

We hope this email finds you well. We wanted to follow up on the proposal we sent you recently.

Proposal: ${data.proposalTitle}
Reference: ${data.proposalReference}
Valid Until: ${data.validUntil}

Review the proposal here:
${data.viewLink}

We understand you may be reviewing your options. If you have any questions or need any clarification, please don't hesitate to reach out.

We look forward to hearing from you.

Best regards,
${data.senderName}
${data.tenantName}

---
Sent via Engage by Capstone
`;

  return { html, text };
}

/**
 * Generate acceptance confirmation email
 */
export function generateProposalAcceptedTemplate(data: ProposalEmailData & { acceptedBy: string; acceptedAt: string }): { html: string; text: string } {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Proposal Accepted - ${data.tenantName}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 24px; }
    .content { padding: 30px; }
    .success-box { background: #d1fae5; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 0 4px 4px 0; }
    .footer { background: #f8fafc; padding: 20px 30px; text-align: center; color: #64748b; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ Proposal Accepted</h1>
    </div>
    
    <div class="content">
      <p>Dear ${escapeHtml(data.clientName)},</p>
      
      <div class="success-box">
        <p><strong>Thank you!</strong> We have received your acceptance of our proposal.</p>
        <p style="margin-bottom: 0;"><strong>Proposal:</strong> ${escapeHtml(data.proposalTitle)}<br>
        <strong>Reference:</strong> ${data.proposalReference}</p>
      </div>
      
      <p>We are delighted to be working with you. Our team will be in touch within the next 24-48 hours to discuss the next steps and get everything set up for you.</p>
      
      <p>In the meantime, if you have any urgent questions, please contact us at ${data.senderEmail}.</p>
      
      <p>Welcome aboard!</p>
      
      <p>Best regards,<br>
      <strong>${escapeHtml(data.senderName)}</strong><br>
      ${escapeHtml(data.tenantName)}</p>
    </div>
    
    <div class="footer">
      <p>Thank you for choosing ${data.tenantName}</p>
    </div>
  </div>
</body>
</html>`;

  const text = `PROPOSAL ACCEPTED - THANK YOU!

Dear ${data.clientName},

Thank you! We have received your acceptance of our proposal.

Proposal: ${data.proposalTitle}
Reference: ${data.proposalReference}
Accepted by: ${data.acceptedBy}
Date: ${data.acceptedAt}

We are delighted to be working with you. Our team will be in touch within the next 24-48 hours to discuss the next steps and get everything set up for you.

In the meantime, if you have any urgent questions, please contact us at ${data.senderEmail}.

Welcome aboard!

Best regards,
${data.senderName}
${data.tenantName}
`;

  return { html, text };
}

// Helper function to escape HTML special characters
function escapeHtml(text: string): string {
  const div = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, (m) => div[m as keyof typeof div]);
}
