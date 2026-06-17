/**
 * Client Touchpoint Workflow Engine
 *
 * Responsibilities:
 * - React to lifecycle events (proposal accepted, AML complete, etc.)
 * - Schedule time-delay and deadline-driven touchpoints
 * - Run periodic job to send due touchpoints
 * - Respect human approval gates
 * - Respect per-client pause + marketing consent
 * - Escalate info chase (up to 3 reminders)
 * - Log everything via ActivityLog for audit
 *
 * Templates live in the DB (TouchpointTemplate) so non-technical staff can edit copy.
 */

import { prisma } from '../config/database.js';
import { createEmailService } from '../services/emailService.js';
import logger from '../config/logger.js';
import { PDFGenerator } from '../services/pdfGenerator.js';
import { createClientPortalLink } from '../services/proposalSharingService.js';
import {
  buildMergeContext,
  renderTouchpointSubject,
  renderTouchpointTemplate,
} from '../templates/touchpoint.js';

import type {
  ClientLifecycleStage,
  TouchpointStatus,
  TouchpointTriggerType,
  TouchpointChannel,
  TouchpointTone,
} from '@prisma/client';

// Re-export for consumers
export {
  ClientLifecycleStage,
  TouchpointStatus,
  TouchpointTriggerType,
  TouchpointChannel,
  TouchpointTone,
};

const TOUCHPOINT_ACTION_PREFIX = 'TOUCHPOINT_';

interface SendResult {
  success: boolean;
  error?: string;
}

/**
 * Main entry point for the background job.
 * Should be called on a schedule (e.g. every 15-60 minutes) + on demand for events.
 */
export async function runTouchpointEngine(): Promise<{
  checked: number;
  sent: number;
  skipped: number;
  errors: number;
  humanApprovalQueued: number;
}> {
  const stats = { checked: 0, sent: 0, skipped: 0, errors: 0, humanApprovalQueued: 0 };

  try {
    const due = await findDueTouchpoints();
    stats.checked = due.length;

    for (const tp of due) {
      const result = await processDueTouchpoint(tp);
      if (result.sent) stats.sent++;
      if (result.humanApproval) stats.humanApprovalQueued++;
      if (result.skipped) stats.skipped++;
      if (result.error) stats.errors++;
    }

    logger.info('Touchpoint engine run complete', stats);
    return stats;
  } catch (err) {
    logger.error('Touchpoint engine failed', err);
    throw err;
  }
}

async function findDueTouchpoints() {
  const now = new Date();

  return prisma.touchpoint.findMany({
    where: {
      status: 'PENDING',
      scheduledFor: { lte: now },
      client: {
        touchpointsPaused: false,
        isActive: true,
      },
    },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          contactName: true,
          contactEmail: true,
          lifecycleStage: true,
          marketingConsent: true,
          touchpointsPaused: true,
          tenantId: true,
        },
      },
      template: true,
      tenant: { select: { id: true, name: true } },
    },
    orderBy: { scheduledFor: 'asc' },
    take: 200, // safety cap per run
  });
}

async function processDueTouchpoint(tp: Awaited<ReturnType<typeof findDueTouchpoints>>[number]) {
  const { client, template, tenant } = tp;

  // Per-client global pause
  if (client.touchpointsPaused) {
    await markSkipped(tp.id, 'Client has touchpoints paused');
    return { skipped: true };
  }

  // Marketing consent gate
  if (template?.isMarketing && !client.marketingConsent) {
    await markSkipped(tp.id, 'Marketing consent not granted');
    return { skipped: true };
  }

  // Human approval gate
  if (tp.requiresHumanApproval) {
    // Leave as PENDING; the approval queue UI will handle sending
    await logActivity({
      tenantId: tp.tenantId,
      action: `${TOUCHPOINT_ACTION_PREFIX}AWAITING_APPROVAL`,
      entityType: 'TOUCHPOINT',
      entityId: tp.id,
      clientId: client.id,
      description: `Touchpoint awaiting human approval: ${tp.stage}`,
    });
    return { humanApproval: true };
  }

  // Send it
  const result = await sendTouchpoint(tp);

    if (result.success) {
      await prisma.touchpoint.update({
        where: { id: tp.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
        },
      });

      if (tp.stage === 'ENGAGEMENT_LETTER_SENT') {
        await prisma.client.update({
          where: { id: client.id },
          data: { engagementLetterSentAt: new Date() },
        });
      }

      await logActivity({
      tenantId: tp.tenantId,
      action: `${TOUCHPOINT_ACTION_PREFIX}SENT`,
      entityType: 'TOUCHPOINT',
      entityId: tp.id,
      clientId: client.id,
      description: `Touchpoint sent via ${tp.channel}: ${tp.stage}`,
    });

    // Advance client stage if this was a terminal action for the stage
    const newStage = await maybeAdvanceLifecycle(client.id, tp.stage);

    // Fire external webhook if configured (for practice management sync)
    if (newStage) {
      await fireStageWebhook(tenant.id, client.id, tp.stage, newStage);
    }

    // For info chase escalation: flag human only after 3 sends
    if (tp.stage === 'INFO_REQUESTED') {
      await scheduleInfoChaseEscalation(client.id, tp);
    }

    return { sent: true };
  } else {
    logger.error(`Failed to send touchpoint ${tp.id}: ${result.error}`);
    return { error: true };
  }
}

async function sendTouchpoint(tp: any): Promise<SendResult> {
  const { client, template, tenant, channel } = tp;

  if (!template) {
    return { success: false, error: 'No template attached' };
  }

  const mergeExtras = await buildTouchpointMergeExtras(tp.stage, client.id, tp.tenantId);

  const context = buildMergeContext({
    client,
    tenant,
    nextStep: inferNextStep(tp.stage),
    dueDate: tp.scheduledFor,
    extra: mergeExtras,
  });

  const subject = renderTouchpointSubject(template.subject, context);
  const htmlBody = renderTouchpointTemplate(template.body, context);
  const textBody = htmlBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const attachments = await buildTouchpointAttachments(tp.stage, client.id, tp.tenantId);

  if (channel === 'EMAIL') {
    const emailService = createEmailService();
    if (!emailService) {
      return { success: false, error: 'Email service not configured' };
    }

    const res = await emailService.sendEmail({
      to: client.contactEmail,
      subject,
      html: htmlBody,
      text: textBody,
      attachments,
    });

    return res.success ? { success: true } : { success: false, error: res.error };
  }

  if (channel === 'SMS') {
    // Basic SMS support (stub). In production, integrate Twilio / similar here.
    const smsEnabled = process.env.SMS_PROVIDER === 'twilio' && process.env.TWILIO_ACCOUNT_SID;
    if (smsEnabled && client.contactPhone) {
      // TODO: integrate real Twilio client
      logger.info(`[SMS] (stub) Sending to ${client.contactPhone}: ${subject}`);
    } else {
      logger.info(`[SMS disabled or no phone] Would have sent: ${subject}`);
    }
    return { success: true };
  }

  if (channel === 'IN_APP') {
    // Future: create notification record for client portal
    logger.info(`[IN_APP] Touchpoint created for client portal: ${tp.stage}`);
    return { success: true };
  }

  return { success: false, error: `Unsupported channel: ${channel}` };
}

/* =====================
   EVENT TRIGGERS
   ===================== */

/**
 * Called when a proposal is accepted for a client.
 * Creates the welcome + AML pending touchpoints (in parallel as per spec).
 */
export async function triggerProposalAccepted(clientId: string, tenantId: string): Promise<void> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { tenant: { select: { id: true, name: true } } },
  });
  if (!client) return;

  // Update stage
  await prisma.client.update({
    where: { id: clientId },
    data: { lifecycleStage: 'PROPOSAL_ACCEPTED' },
  });

  // 1. Warm welcome (immediate, low friction)
  await createTouchpoint({
    clientId,
    tenantId,
    stage: 'PROPOSAL_ACCEPTED',
    triggerType: 'EVENT',
    scheduledFor: new Date(),
    requiresHumanApproval: false,
    channel: 'EMAIL',
    tone: 'WARM',
  });

  // 2. AML / ID verification (can run in parallel)
  await createTouchpoint({
    clientId,
    tenantId,
    stage: 'AML_PENDING',
    triggerType: 'EVENT',
    scheduledFor: new Date(Date.now() + 1000 * 60 * 10), // slight delay so welcome arrives first
    requiresHumanApproval: false,
    channel: 'EMAIL',
    tone: 'NEUTRAL',
  });

  await logActivity({
    tenantId,
    action: `${TOUCHPOINT_ACTION_PREFIX}TRIGGERED`,
    entityType: 'CLIENT',
    entityId: clientId,
    clientId,
    description: 'Proposal accepted — touchpoint sequence started',
  });
}

/**
 * Called when AML is marked complete (from UI or external system).
 */
export async function triggerAmlComplete(clientId: string, tenantId: string): Promise<void> {
  await prisma.client.update({
    where: { id: clientId },
    data: {
      lifecycleStage: 'AML_COMPLETE',
      amlCompletedAt: new Date(),
    },
  });

  // Queue engagement letter
  await createTouchpoint({
    clientId,
    tenantId,
    stage: 'ENGAGEMENT_LETTER_SENT',
    triggerType: 'EVENT',
    scheduledFor: new Date(),
    requiresHumanApproval: true, // often needs partner sign-off before sending
    channel: 'EMAIL',
    tone: 'NEUTRAL',
  });
}

/**
 * When client signs the engagement letter.
 */
export async function triggerEngagementLetterSigned(clientId: string, tenantId: string): Promise<void> {
  await prisma.client.update({
    where: { id: clientId },
    data: {
      lifecycleStage: 'ENGAGEMENT_LETTER_SIGNED',
      engagementLetterSignedAt: new Date(),
    },
  });

  await logActivity({
    tenantId,
    action: `${TOUCHPOINT_ACTION_PREFIX}TRIGGERED`,
    entityType: 'CLIENT',
    entityId: clientId,
    clientId,
    description: 'Engagement letter signed — starting information request sequence',
  });

  await createInfoRequestSequence(clientId);
}

/**
 * Called when staff confirms client information has been received.
 */
export async function triggerInfoReceived(clientId: string, tenantId: string): Promise<void> {
  await prisma.touchpoint.updateMany({
    where: {
      clientId,
      stage: 'INFO_REQUESTED',
      status: 'PENDING',
    },
    data: { status: 'SKIPPED' },
  });

  await prisma.client.update({
    where: { id: clientId },
    data: { lifecycleStage: 'INFO_RECEIVED' },
  });

  await createTouchpoint({
    clientId,
    tenantId,
    stage: 'ONBOARDING_SETUP',
    triggerType: 'EVENT',
    scheduledFor: new Date(),
    requiresHumanApproval: false,
    channel: 'EMAIL',
    tone: 'WARM',
  });

  await createTouchpoint({
    clientId,
    tenantId,
    stage: 'KICKOFF_SENT',
    triggerType: 'TIME_DELAY',
    scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000),
    requiresHumanApproval: false,
    channel: 'EMAIL',
    tone: 'WARM',
    notes: 'Kick-off email day after onboarding setup',
  });

  await logActivity({
    tenantId,
    action: 'CLIENT_INFO_RECEIVED',
    entityType: 'CLIENT',
    entityId: clientId,
    clientId,
    description: 'Information received — onboarding and kick-off touchpoints scheduled',
  });
}

/* =====================
   INFO CHASE + ESCALATION
   ===================== */

async function createInfoRequestSequence(clientId: string): Promise<void> {
  const client = await prisma.client.findUnique({ where: { id: clientId }, include: { tenant: true } });
  if (!client) return;

  const tenantId = client.tenantId;

  await prisma.client.update({
    where: { id: clientId },
    data: { lifecycleStage: 'INFO_REQUESTED' },
  });

  // First request
  await createTouchpoint({
    clientId,
    tenantId,
    stage: 'INFO_REQUESTED',
    triggerType: 'EVENT',
    scheduledFor: new Date(),
    requiresHumanApproval: false,
    channel: 'EMAIL',
    tone: 'WARM',
  });

  // Schedule two escalating reminders (time delay)
  const delays = [3, 7]; // days
  const tones: TouchpointTone[] = ['NEUTRAL', 'URGENT'];

  for (let i = 0; i < delays.length; i++) {
    const when = new Date(Date.now() + delays[i] * 24 * 60 * 60 * 1000);
    await createTouchpoint({
      clientId,
      tenantId,
      stage: 'INFO_REQUESTED',
      triggerType: 'TIME_DELAY',
      scheduledFor: when,
      requiresHumanApproval: false,
      channel: 'EMAIL',
      tone: tones[i],
      notes: `Escalation #${i + 1}`,
    });
  }
}

async function scheduleInfoChaseEscalation(clientId: string, previous: any) {
  const sentCount = await prisma.touchpoint.count({
    where: {
      clientId,
      stage: 'INFO_REQUESTED',
      status: 'SENT',
    },
  });

  if (sentCount < 3) return;

  const existingFlag = await prisma.touchpoint.findFirst({
    where: {
      clientId,
      stage: 'INFO_REQUESTED',
      requiresHumanApproval: true,
      status: 'PENDING',
    },
  });

  if (existingFlag) return;

  await createTouchpoint({
    clientId,
    tenantId: previous.tenantId,
    stage: 'INFO_REQUESTED',
    triggerType: 'EVENT',
    scheduledFor: new Date(),
    requiresHumanApproval: true,
    channel: 'IN_APP',
    tone: 'URGENT',
    notes: 'Info still outstanding after 3 attempts — needs human follow-up',
  });
}

/* =====================
   DEADLINE DRIVEN TOUCHPOINTS
   ===================== */

/**
 * Example: call this from a daily job or when client dates are updated.
 * Only creates if a due date is within the window and no active reminder exists.
 */
export async function scheduleDeadlineReminders(clientId: string, tenantId: string) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return;

  const dates = [
    { stage: 'MILESTONE_CHECK_IN' as ClientLifecycleStage, date: client.nextVatDueDate, label: 'VAT' },
    { stage: 'MILESTONE_CHECK_IN' as ClientLifecycleStage, date: client.nextAccountsDueDate, label: 'Accounts' },
    { stage: 'MILESTONE_CHECK_IN' as ClientLifecycleStage, date: client.nextConfirmationStatementDue, label: 'Confirmation Statement' },
  ];

  for (const d of dates) {
    if (!d.date) continue;

    const due = new Date(d.date);
    // Schedule 14 days before (example window)
    const scheduled = new Date(due.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Avoid duplicates
    const existing = await prisma.touchpoint.findFirst({
      where: {
        clientId,
        stage: d.stage,
        scheduledFor: { gte: new Date(scheduled.getTime() - 1000 * 60 * 60 * 24) },
        status: { in: ['PENDING', 'SENT'] },
      },
    });

    if (!existing) {
      await createTouchpoint({
        clientId,
        tenantId,
        stage: d.stage,
        triggerType: 'TIME_DELAY',
        scheduledFor: scheduled,
        requiresHumanApproval: false,
        channel: 'EMAIL',
        tone: 'NEUTRAL',
        notes: `${d.label} deadline reminder`,
      });
    }
  }
}

/* =====================
   PORTAL LINKS & ATTACHMENTS
   ===================== */

function frontendBaseUrl(): string {
  return (process.env.FRONTEND_URL || 'https://engage-frontend-0g6u.onrender.com').replace(/\/$/, '');
}

async function ensureClientPortalToken(clientId: string): Promise<string> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { portalToken: true, portalEnabled: true, portalTokenExpiry: true },
  });

  if (
    client?.portalToken &&
    client.portalEnabled &&
    client.portalTokenExpiry &&
    client.portalTokenExpiry > new Date()
  ) {
    return client.portalToken;
  }

  const { token } = await createClientPortalLink(clientId, 90);
  return token;
}

async function buildTouchpointMergeExtras(
  stage: ClientLifecycleStage,
  clientId: string,
  _tenantId: string
): Promise<Record<string, string>> {
  const base = frontendBaseUrl();
  const needsPortal = stage === 'AML_PENDING' || stage === 'ENGAGEMENT_LETTER_SENT';

  if (!needsPortal) return {};

  const token = await ensureClientPortalToken(clientId);
  return {
    aml_portal_link: `${base}/onboarding/aml/${token}`,
    portal_link: `${base}/portal/${token}`,
  };
}

async function buildTouchpointAttachments(
  stage: ClientLifecycleStage,
  clientId: string,
  tenantId: string
) {
  if (stage !== 'ENGAGEMENT_LETTER_SENT') return undefined;

  const proposal = await prisma.proposal.findFirst({
    where: { clientId, tenantId, status: 'ACCEPTED' },
    orderBy: { acceptedAt: 'desc' },
    select: { id: true, reference: true },
  });

  if (!proposal) return undefined;

  try {
    const pdf = await PDFGenerator.generateProposal(proposal.id);
    return [
      {
        filename: `engagement-letter-${proposal.reference}.pdf`,
        content: pdf,
        contentType: 'application/pdf',
      },
    ];
  } catch (err) {
    logger.warn(`Could not attach engagement PDF for client ${clientId}`, err);
    return undefined;
  }
}

/* =====================
   HELPERS
   ===================== */

async function createTouchpoint(params: {
  clientId: string;
  tenantId: string;
  stage: ClientLifecycleStage;
  triggerType: TouchpointTriggerType;
  scheduledFor: Date;
  requiresHumanApproval?: boolean;
  channel?: TouchpointChannel;
  tone?: TouchpointTone;
  notes?: string;
}) {
  // Find or create a default template for the stage if none exists for tenant
  let template = await prisma.touchpointTemplate.findFirst({
    where: { tenantId: params.tenantId, stage: params.stage, isActive: true },
  });

  if (!template) {
    template = await ensureDefaultTemplate(params.tenantId, params.stage);
  }

  return prisma.touchpoint.create({
    data: {
      clientId: params.clientId,
      tenantId: params.tenantId,
      stage: params.stage,
      triggerType: params.triggerType,
      scheduledFor: params.scheduledFor,
      requiresHumanApproval: params.requiresHumanApproval ?? false,
      channel: params.channel ?? 'EMAIL',
      templateId: template?.id,
      notes: params.notes,
    },
  });
}

async function ensureDefaultTemplate(tenantId: string, stage: ClientLifecycleStage) {
  // Very basic defaults — in real usage these would be seeded or edited in admin UI
  const defaults: Partial<Record<ClientLifecycleStage, { subject: string; body: string; tone: TouchpointTone; isMarketing?: boolean }>> = {
    PROPOSAL_ACCEPTED: {
      subject: 'Welcome to {{practice_name}}, {{client_name}}',
      body: 'Hi {{contact_name}},<br/><br/>Thank you for choosing {{practice_name}}. We are excited to work with you.<br/>Next step: {{next_step}}.<br/><br/>Best,<br/>{{practice_name}}',
      tone: 'WARM',
    },
    AML_PENDING: {
      subject: 'ID & AML verification for {{client_name}}',
      body: 'Hello {{contact_name}},<br/>To proceed with onboarding we need to complete our AML checks.<br/><br/><strong>Please submit your details securely using this link:</strong><br/><a href="{{aml_portal_link}}">{{aml_portal_link}}</a><br/><br/>You will need: photo ID, proof of address, and basic business information. This usually takes about 5 minutes.<br/><br/>If you have any questions, reply to this email.<br/><br/>Thank you,<br/>{{practice_name}}',
      tone: 'NEUTRAL',
    },
    ENGAGEMENT_LETTER_SENT: {
      subject: 'Your engagement letter from {{practice_name}}',
      body: 'Hello {{contact_name}},<br/><br/>Please find your engagement letter attached to this email (PDF). It reflects the services and fees you agreed when signing your proposal.<br/><br/>If you have already signed, no further action is needed — otherwise please review and sign via your client portal:<br/><a href="{{portal_link}}">{{portal_link}}</a><br/><br/>Next step: {{next_step}}<br/><br/>Kind regards,<br/>{{practice_name}}',
      tone: 'NEUTRAL',
    },
    INFO_REQUESTED: {
      subject: 'Information required for {{client_name}}',
      body: 'Hi {{contact_name}},<br/>We need a few more details to complete your onboarding. Please send the information by {{due_date}}.<br/><br/>Thank you,<br/>{{practice_name}}',
      tone: 'WARM',
    },
    ONBOARDING_SETUP: {
      subject: 'Setting up your account — {{client_name}}',
      body: 'Hi {{contact_name}},<br/><br/>Thank you for providing your information. We are now setting up your records and systems with {{practice_name}}.<br/>{{next_step}}<br/><br/>We will be in touch shortly with your kick-off details.<br/><br/>Best,<br/>{{practice_name}}',
      tone: 'WARM',
    },
    SATISFACTION_CHECK: {
      subject: 'How are we doing? — {{practice_name}}',
      body: 'Hi {{contact_name}},<br/><br/>We would love to know how your experience has been so far. Your feedback helps us improve.<br/>{{next_step}}<br/><br/>Warm regards,<br/>{{practice_name}}',
      tone: 'WARM',
      isMarketing: true,
    },
    KICKOFF_SENT: {
      subject: 'Welcome aboard — kick-off for {{client_name}}',
      body: 'Hi {{contact_name}},<br/><br/>Your onboarding is complete and we are ready to get started. {{next_step}}<br/>We look forward to working with you.<br/><br/>Best,<br/>{{practice_name}}',
      tone: 'WARM',
    },
    MILESTONE_CHECK_IN: {
      subject: '{{practice_name}} milestone check-in — {{due_date}}',
      body: 'Hello {{contact_name}},<br/>Just a quick note ahead of the upcoming deadline on {{due_date}}.<br/>{{next_step}}<br/><br/>Let us know if you need anything.<br/>Kind regards,<br/>{{practice_name}}',
      tone: 'NEUTRAL',
    },
    ANNUAL_REVIEW: {
      subject: 'Time for your annual review with {{practice_name}}',
      body: 'Hi {{contact_name}},<br/><br/>It has been a year since we started working together. We would like to schedule your annual review.<br/>{{next_step}}<br/><br/>Speak soon,<br/>{{practice_name}}',
      tone: 'WARM',
    },
  };

  const def = defaults[stage];
  if (!def) return null;

  return prisma.touchpointTemplate.create({
    data: {
      tenantId,
      stage,
      subject: def.subject,
      body: def.body,
      tone: def.tone,
      isMarketing: def.isMarketing ?? false,
      isActive: true,
    },
  });
}

async function markSkipped(id: string, reason: string) {
  await prisma.touchpoint.update({
    where: { id },
    data: { status: 'SKIPPED' },
  });
  await logActivity({
    tenantId: (await prisma.touchpoint.findUnique({ where: { id }, select: { tenantId: true } }))!.tenantId,
    action: `${TOUCHPOINT_ACTION_PREFIX}SKIPPED`,
    entityType: 'TOUCHPOINT',
    entityId: id,
    description: reason,
  });
}

async function maybeAdvanceLifecycle(clientId: string, stage: ClientLifecycleStage): Promise<ClientLifecycleStage | undefined> {
  const nextStageMap: Partial<Record<ClientLifecycleStage, ClientLifecycleStage>> = {
    PROPOSAL_ACCEPTED: 'AML_PENDING',
    ENGAGEMENT_LETTER_SENT: 'ENGAGEMENT_LETTER_SENT',
    INFO_REQUESTED: 'INFO_REQUESTED',
    ONBOARDING_SETUP: 'ONBOARDING_SETUP',
    KICKOFF_SENT: 'ONGOING',
  };

  const next = nextStageMap[stage];
  if (next) {
    await prisma.client.update({
      where: { id: clientId },
      data: { lifecycleStage: next },
    });
    return next;
  }
  return undefined;
}

async function logActivity(data: {
  tenantId: string;
  action: string;
  entityType: string;
  entityId?: string;
  clientId?: string;
  description?: string;
}) {
  await prisma.activityLog.create({
    data: {
      tenantId: data.tenantId,
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      description: data.description,
      metadata: JSON.stringify({ clientId: data.clientId }),
    },
  });
}

function inferNextStep(stage: ClientLifecycleStage): string {
  const map: Partial<Record<ClientLifecycleStage, string>> = {
    PROPOSAL_ACCEPTED: 'Complete AML verification',
    AML_PENDING: 'Submit ID documents',
    AML_COMPLETE: 'Sign engagement letter',
    ENGAGEMENT_LETTER_SENT: 'Return signed letter',
    INFO_REQUESTED: 'Provide requested information',
    ONBOARDING_SETUP: 'We are setting up your account',
    KICKOFF_SENT: 'Your kick-off call or welcome pack',
  };
  return map[stage] || 'Next step in onboarding';
}

/**
 * Admin helper: approve and immediately send a human-gated touchpoint
 */
export async function approveAndSendTouchpoint(touchpointId: string, userId?: string): Promise<boolean> {
  const tp = await prisma.touchpoint.findUnique({
    where: { id: touchpointId },
    include: { client: true, tenant: true, template: true },
  });
  if (!tp || tp.status !== 'PENDING' || !tp.requiresHumanApproval) return false;

  const result = await sendTouchpoint(tp);
  if (result.success) {
    await prisma.touchpoint.update({
      where: { id: touchpointId },
      data: { status: 'SENT', sentAt: new Date() },
    });

    if (tp.stage === 'ENGAGEMENT_LETTER_SENT') {
      await prisma.client.update({
        where: { id: tp.clientId },
        data: { engagementLetterSentAt: new Date() },
      });
    }

    const newStage = await maybeAdvanceLifecycle(tp.clientId, tp.stage);
    if (newStage) {
      await fireStageWebhook(tp.tenantId, tp.clientId, tp.stage, newStage);
    }

    await logActivity({
      tenantId: tp.tenantId,
      action: `${TOUCHPOINT_ACTION_PREFIX}APPROVED_AND_SENT`,
      entityType: 'TOUCHPOINT',
      entityId: touchpointId,
      description: `Approved by user ${userId || 'unknown'}`,
    });
    return true;
  }
  return false;
}

/**
 * Fire a webhook when a lifecycle stage advances.
 * Configure via TENANT settings or env var TOUCHPOINT_WEBHOOK_URL for simplicity.
 */
async function fireStageWebhook(
  tenantId: string,
  clientId: string,
  fromStage: ClientLifecycleStage,
  toStage: ClientLifecycleStage
) {
  try {
    const webhookUrl =
      process.env.TOUCHPOINT_WEBHOOK_URL ||
      (await prisma.tenant.findUnique({ where: { id: tenantId } }))?.settings
        ? JSON.parse(
            (await prisma.tenant.findUnique({ where: { id: tenantId } }))!.settings || '{}'
          ).touchpointWebhookUrl
        : null;

    if (!webhookUrl) return;

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'client.lifecycle.stage_changed',
        tenantId,
        clientId,
        from: fromStage,
        to: toStage,
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {}); // fire and forget, don't block
  } catch (e) {
    logger.warn('Webhook fire failed (non-fatal)', e);
  }
}

export default {
  runTouchpointEngine,
  triggerProposalAccepted,
  triggerAmlComplete,
  triggerEngagementLetterSigned,
  triggerInfoReceived,
  scheduleDeadlineReminders,
  approveAndSendTouchpoint,
  fireStageWebhook,
};
