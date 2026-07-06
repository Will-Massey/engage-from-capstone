/**
 * Default client lifecycle email templates — UK English, warm and confidence-building.
 * Seeded per tenant; firms can customise in Settings → Automation.
 */

export type DefaultTouchpointTone = 'WARM' | 'NEUTRAL' | 'URGENT';

export interface DefaultTouchpointTemplateDef {
  stage: string;
  subject: string;
  body: string;
  tone: DefaultTouchpointTone;
  isMarketing: boolean;
}

export const DEFAULT_TOUCHPOINT_TEMPLATES: DefaultTouchpointTemplateDef[] = [
  {
    stage: 'PROPOSAL_ACCEPTED',
    subject: 'Welcome to {{practice_name}} — we are delighted to work with you',
    tone: 'WARM',
    isMarketing: false,
    body: `<p>Dear {{contact_name}},</p>
<p>Thank you for accepting our proposal — we are genuinely pleased to be working with <strong>{{client_name}}</strong>.</p>
<p>You have made a great decision. Over the coming days we will guide you through a simple, structured onboarding process so everything feels clear and stress-free.</p>
<p><strong>Your next step:</strong> {{next_step}}</p>
<p>If anything is unclear, simply reply to this email — we are here to help.</p>
<p>Warm regards,<br/>{{practice_name}}</p>`,
  },
  {
    stage: 'AML_PENDING',
    subject: 'Quick identity check — keeps everything compliant and secure',
    tone: 'NEUTRAL',
    isMarketing: false,
    body: `<p>Dear {{contact_name}},</p>
<p>To meet UK anti-money laundering requirements, we need to verify your identity for <strong>{{client_name}}</strong>. This is standard for all regulated firms and usually takes about five minutes.</p>
<p><strong>Please complete your secure form here:</strong><br/><a href="{{aml_portal_link}}">{{aml_portal_link}}</a></p>
<p>You will need photo ID and proof of address. Your information is encrypted and handled strictly in line with data protection law.</p>
<p><strong>Why this matters:</strong> completing this step unlocks your engagement letter and allows us to begin work without delay.</p>
<p>Questions? Reply to this email and we will walk you through it.</p>
<p>Kind regards,<br/>{{practice_name}}</p>`,
  },
  {
    stage: 'AML_COMPLETE',
    subject: 'Identity verification complete — thank you',
    tone: 'WARM',
    isMarketing: false,
    body: `<p>Dear {{contact_name}},</p>
<p>Thank you — we have received and reviewed your identity verification for <strong>{{client_name}}</strong>. That step is now complete.</p>
<p><strong>What happens next:</strong> {{next_step}}</p>
<p>You are making excellent progress. We will keep you updated at each stage so you always know where things stand.</p>
<p>Best wishes,<br/>{{practice_name}}</p>`,
  },
  {
    stage: 'ENGAGEMENT_LETTER_SENT',
    subject: 'Your engagement letter from {{practice_name}}',
    tone: 'NEUTRAL',
    isMarketing: false,
    body: `<p>Dear {{contact_name}},</p>
<p>Please find your formal engagement letter for <strong>{{client_name}}</strong>. It confirms the services, responsibilities, and fees you agreed when accepting our proposal.</p>
<p>If you have not yet signed, you can review and sign securely here:<br/><a href="{{portal_link}}">{{portal_link}}</a></p>
<p><strong>Next step:</strong> {{next_step}}</p>
<p>We have written this in plain English on purpose — if any clause needs explaining, ask us. There are no silly questions.</p>
<p>Kind regards,<br/>{{practice_name}}</p>`,
  },
  {
    stage: 'ENGAGEMENT_LETTER_SIGNED',
    subject: 'Engagement letter signed — we are officially underway',
    tone: 'WARM',
    isMarketing: false,
    body: `<p>Dear {{contact_name}},</p>
<p>Thank you for signing your engagement letter. Our working relationship with <strong>{{client_name}}</strong> is now formally in place.</p>
<p><strong>Next step:</strong> {{next_step}}</p>
<p>We will keep onboarding practical and paced — you will always know what we need from you and when.</p>
<p>We are looking forward to supporting you.</p>
<p>Best regards,<br/>{{practice_name}}</p>`,
  },
  {
    stage: 'INFO_REQUESTED',
    subject: 'A few details to help us hit the ground running',
    tone: 'WARM',
    isMarketing: false,
    body: `<p>Dear {{contact_name}},</p>
<p>To set up <strong>{{client_name}}</strong> properly, we need a short list of information from you. Gathering this now prevents delays later — especially around filing deadlines.</p>
<p><strong>Please send the requested items by {{due_date}}.</strong></p>
<p><strong>Next step:</strong> {{next_step}}</p>
<p>If you are unsure about any item, reply with a quick note and we will clarify. We would rather answer a question early than chase missing records later.</p>
<p>Thank you for your help,<br/>{{practice_name}}</p>`,
  },
  {
    stage: 'INFO_RECEIVED',
    subject: 'Thank you — we have everything we need for now',
    tone: 'WARM',
    isMarketing: false,
    body: `<p>Dear {{contact_name}},</p>
<p>Thank you for sending the information for <strong>{{client_name}}</strong>. We have received it and our team is reviewing everything.</p>
<p><strong>Next step:</strong> {{next_step}}</p>
<p>You have done your part — we will take it from here and come back if anything else is needed.</p>
<p>With thanks,<br/>{{practice_name}}</p>`,
  },
  {
    stage: 'ONBOARDING_SETUP',
    subject: 'We are setting up your account — almost ready to go',
    tone: 'WARM',
    isMarketing: false,
    body: `<p>Dear {{contact_name}},</p>
<p>We are now configuring your records, systems access, and internal workflows for <strong>{{client_name}}</strong>.</p>
<p><strong>Next step:</strong> {{next_step}}</p>
<p>This behind-the-scenes work means that when we start, everything is organised from day one — no scrambling, no surprises.</p>
<p>We will be in touch shortly with your kick-off details.</p>
<p>Best wishes,<br/>{{practice_name}}</p>`,
  },
  {
    stage: 'KICKOFF_SENT',
    subject: 'Welcome aboard — your kick-off with {{practice_name}}',
    tone: 'WARM',
    isMarketing: false,
    body: `<p>Dear {{contact_name}},</p>
<p>Onboarding for <strong>{{client_name}}</strong> is complete — welcome aboard.</p>
<p><strong>Next step:</strong> {{next_step}}</p>
<p>From here, you have a dedicated team behind you. We focus on proactive advice, clear deadlines, and plain-English explanations — so you can run your business with confidence.</p>
<p>We are genuinely glad to have you as a client.</p>
<p>Warm regards,<br/>{{practice_name}}</p>`,
  },
  {
    stage: 'MILESTONE_CHECK_IN',
    subject: 'Friendly reminder ahead of {{due_date}}',
    tone: 'NEUTRAL',
    isMarketing: false,
    body: `<p>Dear {{contact_name}},</p>
<p>A quick, friendly check-in for <strong>{{client_name}}</strong> ahead of <strong>{{due_date}}</strong>.</p>
<p><strong>Next step:</strong> {{next_step}}</p>
<p>We send reminders like this deliberately early — it is far easier to resolve small items now than rush at the deadline.</p>
<p>Reply if you would like us to walk through anything together.</p>
<p>Kind regards,<br/>{{practice_name}}</p>`,
  },
  {
    stage: 'SATISFACTION_CHECK',
    subject: 'How are we doing for you?',
    tone: 'WARM',
    isMarketing: true,
    body: `<p>Dear {{contact_name}},</p>
<p>We hope <strong>{{client_name}}</strong> is in good hands with {{practice_name}}.</p>
<p>Your feedback genuinely shapes how we work — if something could be better, we want to hear it. If we are doing well, that is equally helpful to know.</p>
<p><strong>Next step:</strong> {{next_step}}</p>
<p>Thank you for trusting us with your business.</p>
<p>Warm regards,<br/>{{practice_name}}</p>`,
  },
  {
    stage: 'ONGOING',
    subject: 'We are here whenever you need us',
    tone: 'WARM',
    isMarketing: false,
    body: `<p>Dear {{contact_name}},</p>
<p>A brief note to confirm that <strong>{{client_name}}</strong> remains fully active with {{practice_name}}.</p>
<p><strong>Next step:</strong> {{next_step}}</p>
<p>Whether you need ad hoc advice, a quick question answered, or help planning ahead, reply to this email or call your usual contact. No issue is too small.</p>
<p>We value the relationship and look forward to continuing to support you.</p>
<p>Best wishes,<br/>{{practice_name}}</p>`,
  },
  {
    stage: 'ANNUAL_REVIEW',
    subject: 'Time for your annual review — let us plan the year ahead',
    tone: 'WARM',
    isMarketing: false,
    body: `<p>Dear {{contact_name}},</p>
<p>It has been a year since we began working with <strong>{{client_name}}</strong> — thank you for your continued trust.</p>
<p>An annual review is a chance to step back, celebrate progress, and align services and fees for the year ahead. There is no pressure — just a constructive conversation.</p>
<p><strong>Next step:</strong> {{next_step}}</p>
<p>We will make scheduling simple and come prepared with insights relevant to your business.</p>
<p>We look forward to speaking with you.</p>
<p>Kind regards,<br/>{{practice_name}}</p>`,
  },
];

export const ALL_TOUCHPOINT_STAGES = DEFAULT_TOUCHPOINT_TEMPLATES.map((t) => t.stage);
