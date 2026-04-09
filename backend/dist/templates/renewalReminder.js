"use strict";
/**
 * Renewal Reminder Email Template
 * Sent to practice 30 days before proposal renewal is due
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateRenewalReminder = generateRenewalReminder;
function generateRenewalReminder(data) {
    const formattedRenewalDate = new Date(data.renewalDate).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
    const formattedAcceptedDate = new Date(data.originalAcceptedAt).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
    const subject = `⏰ Renewal Due in ${data.daysUntilRenewal} Days: ${data.clientName}`;
    const frontendUrl = process.env.FRONTEND_URL || 'https://engage.capstone.co.uk';
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Renewal Reminder</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 600px; margin: 20px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: #f59e0b; color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .reminder-badge { display: inline-block; background: rgba(255,255,255,0.2); padding: 8px 16px; border-radius: 20px; margin-top: 10px; font-weight: 600; }
    .content { padding: 30px; }
    .alert { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .details { background: #f9fafb; padding: 20px; border-radius: 6px; margin: 20px 0; }
    .details table { width: 100%; border-collapse: collapse; }
    .details td { padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .details td:first-child { font-weight: 600; width: 40%; color: #6b7280; }
    .details tr:last-child td { border-bottom: none; }
    .amount { font-size: 20px; font-weight: 700; color: #059669; }
    .button { display: inline-block; background: #f59e0b; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 10px 5px; font-weight: 600; }
    .button-secondary { background: #6b7280; }
    .footer { background: #f9fafb; padding: 20px 30px; text-align: center; font-size: 12px; color: #6b7280; }
    .button-group { text-align: center; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⏰ Renewal Reminder</h1>
      <div class="reminder-badge">${data.daysUntilRenewal} days until renewal</div>
    </div>
    
    <div class="content">
      <div class="alert">
        <strong>Action Required:</strong> The proposal for <strong>${data.clientName}</strong> is due for renewal on <strong>${formattedRenewalDate}</strong>.
      </div>
      
      <p>This proposal was originally accepted on ${formattedAcceptedDate} and is now approaching its annual renewal date.</p>
      
      <div class="details">
        <table>
          <tr>
            <td>Client</td>
            <td>${data.clientName}</td>
          </tr>
          <tr>
            <td>Proposal</td>
            <td>${data.proposalTitle}</td>
          </tr>
          <tr>
            <td>Reference</td>
            <td>${data.proposalReference}</td>
          </tr>
          <tr>
            <td>Original Acceptance</td>
            <td>${formattedAcceptedDate}</td>
          </tr>
          <tr>
            <td>Renewal Date</td>
            <td><strong>${formattedRenewalDate}</strong></td>
          </tr>
          <tr>
            <td>Current Value</td>
            <td class="amount">${data.totalAmount}</td>
          </tr>
        </table>
      </div>
      
      <p>Would you like to create a renewal proposal for this client?</p>
      
      <div class="button-group">
        <a href="${frontendUrl}/proposals/create-renewal/${data.proposalReference}" class="button">Create Renewal Proposal</a>
        <a href="${frontendUrl}/proposals" class="button button-secondary">View All Proposals</a>
      </div>
      
      <p style="font-size: 12px; color: #6b7280; margin-top: 20px;">
        This is an automated reminder. You will not receive another reminder for this proposal.
      </p>
    </div>
    
    <div class="footer">
      <p>Sent by Engage by Capstone - Proposal Management System</p>
    </div>
  </div>
</body>
</html>
  `.trim();
    const text = `
RENEWAL REMINDER - ${data.daysUntilRenewal} DAYS UNTIL RENEWAL

Action Required: The proposal for ${data.clientName} is due for renewal on ${formattedRenewalDate}.

This proposal was originally accepted on ${formattedAcceptedDate} and is now approaching its annual renewal date.

PROPOSAL DETAILS
----------------
Client: ${data.clientName}
Proposal: ${data.proposalTitle}
Reference: ${data.proposalReference}
Original Acceptance: ${formattedAcceptedDate}
Renewal Date: ${formattedRenewalDate}
Current Value: ${data.totalAmount}

NEXT STEPS
----------
Create a renewal proposal for this client:
${frontendUrl}/proposals/create-renewal/${data.proposalReference}

View all proposals:
${frontendUrl}/proposals

This is an automated reminder. You will not receive another reminder for this proposal.

Sent by Engage by Capstone
  `.trim();
    return { html, text, subject };
}
exports.default = generateRenewalReminder;
//# sourceMappingURL=renewalReminder.js.map