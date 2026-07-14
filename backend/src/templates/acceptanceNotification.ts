import { getFrontendUrl } from '../config/urls.js';
import { escapeHtml } from '../utils/escapeHtml.js';

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

  const subject = `🎉 It's a win! ${data.clientName} just signed ${data.proposalReference}`;

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
    .header { background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: white; padding: 36px 30px; text-align: center; }
    .header h1 { margin: 0 0 6px; font-size: 26px; }
    .header p { margin: 0; opacity: 0.95; }
    .content { padding: 30px; }
    .success-icon { font-size: 52px; margin-bottom: 6px; letter-spacing: 4px; }
    .celebrate { background: #ecfdf5; border-left: 4px solid #10b981; padding: 16px 18px; border-radius: 6px; margin-bottom: 20px; font-size: 16px; }
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
      <div class="success-icon">🎉</div>
      <h1>Congratulations — it's a win!</h1>
      <p><strong>${escapeHtml(data.clientName)}</strong> just signed on the dotted line</p>
    </div>

    <div class="content">
      ${
        data.personalizedMessage
          ? `<div class="celebrate">
        <p style="margin:0;white-space:pre-wrap;line-height:1.65;">${escapeHtml(data.personalizedMessage)}</p>
      </div>`
          : `<div class="celebrate">
        <p style="margin:0;line-height:1.65;">🥳 <strong>Brilliant news!</strong> <strong>${escapeHtml(data.clientName)}</strong> has electronically signed and accepted your proposal — that's a new engagement in the bag. Time to celebrate, then let's get them onboarded. Well done!</p>
      </div>`
      }
      
      <div class="details">
        <table>
          <tr>
            <td>Proposal</td>
            <td>${escapeHtml(data.proposalTitle)}</td>
          </tr>
          <tr>
            <td>Reference</td>
            <td>${escapeHtml(data.proposalReference)}</td>
          </tr>
          <tr>
            <td>Client</td>
            <td>${escapeHtml(data.clientName)}</td>
          </tr>
          <tr>
            <td>Signed By</td>
            <td>${escapeHtml(data.signedBy)} (${escapeHtml(data.signedByRole)})</td>
          </tr>
          <tr>
            <td>Accepted At</td>
            <td>${formattedDate}</td>
          </tr>
          <tr>
            <td>Total Value</td>
            <td class="amount">${escapeHtml(data.totalAmount)}</td>
          </tr>
        </table>
      </div>
      
      <p>The signed proposal and signature are attached to this email for your records.</p>

      <p>Now the fun part — turning a yes into a great start:</p>
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
🎉 IT'S A WIN — ${data.proposalReference}

${data.personalizedMessage || `Brilliant news! ${data.clientName} has electronically signed and accepted your proposal — that's a new engagement in the bag. Well done!`}

PROPOSAL DETAILS
----------------
Proposal: ${data.proposalTitle}
Reference: ${data.proposalReference}
Client: ${data.clientName}
Signed By: ${data.signedBy} (${data.signedByRole})
Accepted At: ${formattedDate}
Total Value: ${data.totalAmount}

The signed proposal and signature are attached to this email for your records.

Now the fun part - turning a yes into a great start:
- Review the signed proposal in your Engage dashboard
- Set up the client onboarding process
- Schedule a kick-off call if needed

View in Engage: ${data.proposalUrl || `${getFrontendUrl()}/proposals`}

Sent by Engage by Capstone
  `.trim();

  return { html, text, subject };
}

export default generateAcceptanceNotification;
