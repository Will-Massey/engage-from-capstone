import { getFrontendUrl } from '../config/urls.js';

/**
 * Acceptance Notification Email Template
 * Sent to practice when a client signs a proposal
 */

export interface AcceptanceNotificationData {
  clientName: string;
  proposalTitle: string;
  proposalReference: string;
  acceptedAt: Date;
  totalAmount: string;
  signedBy: string;
  signedByRole: string;
  tenantName?: string;
  /** Clara or rules-based personalised intro (greeting may be prepended by sender) */
  personalizedMessage?: string;
  proposalUrl?: string;
}

export function generateAcceptanceNotification(data: AcceptanceNotificationData): {
  html: string;
  text: string;
  subject: string;
} {
  const formattedDate = new Date(data.acceptedAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const subject = `✅ Proposal Accepted: ${data.proposalReference} - ${data.clientName}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Proposal Accepted</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 600px; margin: 20px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: #10b981; color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 30px; }
    .success-icon { font-size: 48px; margin-bottom: 10px; }
    .details { background: #f9fafb; padding: 20px; border-radius: 6px; margin: 20px 0; }
    .details table { width: 100%; border-collapse: collapse; }
    .details td { padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .details td:first-child { font-weight: 600; width: 40%; color: #6b7280; }
    .details tr:last-child td { border-bottom: none; }
    .amount { font-size: 24px; font-weight: 700; color: #10b981; }
    .footer { background: #f9fafb; padding: 20px 30px; text-align: center; font-size: 12px; color: #6b7280; }
    .button { display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="success-icon">✅</div>
      <h1>Proposal Accepted!</h1>
      <p>${data.clientName} has accepted your proposal</p>
    </div>
    
    <div class="content">
      ${
        data.personalizedMessage
          ? `<div style="background:#ecfdf5;border-left:4px solid #10b981;padding:16px 18px;border-radius:6px;margin-bottom:20px;">
        <p style="margin:0;white-space:pre-wrap;line-height:1.65;">${escapeHtml(data.personalizedMessage)}</p>
      </div>`
          : `<p>Great news! <strong>${data.clientName}</strong> has electronically signed and accepted your proposal.</p>`
      }
      
      <div class="details">
        <table>
          <tr>
            <td>Proposal</td>
            <td>${data.proposalTitle}</td>
          </tr>
          <tr>
            <td>Reference</td>
            <td>${data.proposalReference}</td>
          </tr>
          <tr>
            <td>Client</td>
            <td>${data.clientName}</td>
          </tr>
          <tr>
            <td>Signed By</td>
            <td>${data.signedBy} (${data.signedByRole})</td>
          </tr>
          <tr>
            <td>Accepted At</td>
            <td>${formattedDate}</td>
          </tr>
          <tr>
            <td>Total Value</td>
            <td class="amount">${data.totalAmount}</td>
          </tr>
        </table>
      </div>
      
      <p>The signed proposal and signature are attached to this email for your records.</p>
      
      <p>Next steps:</p>
      <ul>
        <li>Review the signed proposal in your Engage dashboard</li>
        <li>Set up the client onboarding process</li>
        <li>Schedule a kick-off call if needed</li>
      </ul>
      
      <center>
        <a href="${data.proposalUrl || `${getFrontendUrl()}/proposals`}" class="button">View proposal in Engage</a>
      </center>
    </div>
    
    <div class="footer">
      <p>Sent by Engage by Capstone - Proposal Management System</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
PROPOSAL ACCEPTED - ${data.proposalReference}

${data.personalizedMessage || `Great news! ${data.clientName} has electronically signed and accepted your proposal.`}

PROPOSAL DETAILS
----------------
Proposal: ${data.proposalTitle}
Reference: ${data.proposalReference}
Client: ${data.clientName}
Signed By: ${data.signedBy} (${data.signedByRole})
Accepted At: ${formattedDate}
Total Value: ${data.totalAmount}

The signed proposal and signature are attached to this email for your records.

Next steps:
- Review the signed proposal in your Engage dashboard
- Set up the client onboarding process
- Schedule a kick-off call if needed

View in Engage: ${data.proposalUrl || `${getFrontendUrl()}/proposals`}

Sent by Engage by Capstone
  `.trim();

  return { html, text, subject };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default generateAcceptanceNotification;
