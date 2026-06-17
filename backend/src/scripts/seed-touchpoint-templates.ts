/**
 * Seed sensible default TouchpointTemplates for a tenant.
 * Run with: tsx src/scripts/seed-touchpoint-templates.ts <tenantId>
 */
import { prisma } from '../config/database.js';

const defaults = [
  {
    stage: 'PROPOSAL_ACCEPTED',
    subject: 'Welcome to {{practice_name}}, {{client_name}}',
    body: 'Hi {{contact_name}},<br/><br/>Thank you for choosing {{practice_name}}. We are excited to work with you.<br/>Next step: {{next_step}}.<br/><br/>Best,<br/>{{practice_name}}',
    tone: 'WARM',
    isMarketing: false,
  },
  {
    stage: 'AML_PENDING',
    subject: 'ID & AML verification – {{client_name}}',
    body: 'Hello {{contact_name}},<br/>To complete onboarding we need to verify your identity. Please upload the requested documents by {{due_date}}.<br/><br/>Regards,<br/>{{practice_name}}',
    tone: 'NEUTRAL',
    isMarketing: false,
  },
  {
    stage: 'ENGAGEMENT_LETTER_SENT',
    subject: 'Engagement letter from {{practice_name}}',
    body: 'Hi {{contact_name}},<br/><br/>Attached is your engagement letter. Please review, sign and return it.<br/>Next step: {{next_step}}.<br/><br/>Kind regards,<br/>{{practice_name}}',
    tone: 'NEUTRAL',
    isMarketing: false,
  },
  {
    stage: 'INFO_REQUESTED',
    subject: 'Information required for {{client_name}}',
    body: 'Hello {{contact_name}},<br/>We require a few additional pieces of information. Please reply by {{due_date}}.<br/><br/>Thank you,<br/>{{practice_name}}',
    tone: 'WARM',
    isMarketing: false,
  },
  {
    stage: 'SATISFACTION_CHECK',
    subject: 'How is everything going? – {{practice_name}}',
    body: 'Hi {{contact_name}},<br/><br/>We would really value your feedback on how we are doing. {{next_step}}<br/><br/>Warm regards,<br/>{{practice_name}}',
    tone: 'WARM',
    isMarketing: true,
  },
  {
    stage: 'KICKOFF_SENT',
    subject: 'Welcome aboard — kick-off for {{client_name}}',
    body: 'Hi {{contact_name}},<br/><br/>Your onboarding is complete and we are ready to get started. {{next_step}}<br/>We look forward to working with you.<br/><br/>Best,<br/>{{practice_name}}',
    tone: 'WARM',
    isMarketing: false,
  },
  {
    stage: 'MILESTONE_CHECK_IN',
    subject: '{{practice_name}} milestone check-in — {{due_date}}',
    body: 'Hello {{contact_name}},<br/>Just a quick note ahead of the upcoming deadline on {{due_date}}.<br/>{{next_step}}<br/><br/>Let us know if you need anything.<br/>Kind regards,<br/>{{practice_name}}',
    tone: 'NEUTRAL',
    isMarketing: false,
  },
  {
    stage: 'ANNUAL_REVIEW',
    subject: 'Time for your annual review with {{practice_name}}',
    body: 'Hi {{contact_name}},<br/><br/>It has been a year since we started working together. We would like to schedule your annual review.<br/>{{next_step}}<br/><br/>Speak soon,<br/>{{practice_name}}',
    tone: 'WARM',
    isMarketing: false,
  },
];

/**
 * Supported merge tags (use these in subject/body):
 *   {{client_name}}      - Client's company name
 *   {{contact_name}}     - Primary contact person (falls back to client name)
 *   {{practice_name}}    - Your firm's name
 *   {{next_step}}        - Suggested next action
 *   {{due_date}}         - Formatted date (when available)
 *
 * Example body:
 *   "Hi {{contact_name}}, your {{due_date}} deadline is approaching. {{next_step}}"
 */

async function main() {
  const tenantId = process.argv[2];
  if (!tenantId) {
    console.error('Usage: tsx src/scripts/seed-touchpoint-templates.ts <tenantId>');
    process.exit(1);
  }

  for (const d of defaults) {
    await prisma.touchpointTemplate.upsert({
      where: { tenantId_stage: { tenantId, stage: d.stage as any } },
      update: d as any,
      create: { tenantId, ...d } as any,
    });
  }

  console.log(`Seeded ${defaults.length} touchpoint templates for tenant ${tenantId}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
