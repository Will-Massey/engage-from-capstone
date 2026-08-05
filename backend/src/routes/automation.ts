import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/auth.js';
import { ApiError, asyncHandler } from '../middleware/errorHandler.js';
import { runEmailAutomation, testEmailAutomation } from '../jobs/emailAutomation.js';
import { runProposalChaseJob } from '../jobs/proposalChaseJob.js';
import logger from '../config/logger.js';
import { prisma } from '../config/database.js';
import { getProposalSettings } from '../utils/tenantProposalSettings.js';
import { listChasePacks } from '../services/chasePackService.js';
import {
  getAutomationRules,
  saveAutomationRules,
  runAutomationRules,
  type AutomationRule,
} from '../services/automationRulesService.js';

const router = Router();

/**
 * POST /api/automation/email-followup/run
 * Manually trigger the email follow-up automation job
 * Admin only
 */
router.post(
  '/email-followup/run',
  authenticate,
  authorize('ADMIN', 'PARTNER'),
  asyncHandler(async (req, res) => {
    logger.info('Manual email automation triggered by user:', req.user!.id);

    const result = await runEmailAutomation();

    res.json({
      success: result.success,
      data: {
        sent: result.sent,
        failed: result.failed,
        skipped: result.skipped,
      },
      message: result.success
        ? `Email automation completed: ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped`
        : 'Email automation failed or not configured',
    });
  })
);

/**
 * POST /api/automation/email-followup/test/:proposalId
 * Test email follow-up for a specific proposal
 * Admin only
 */
router.post(
  '/email-followup/test/:proposalId',
  authenticate,
  authorize('ADMIN', 'PARTNER'),
  asyncHandler(async (req, res) => {
    const { proposalId } = req.params;

    logger.info(`Test email follow-up triggered for proposal ${proposalId} by user:`, req.user!.id);

    const tenantId = req.tenantId!;
    const success = await testEmailAutomation(proposalId, tenantId);

    if (!success) {
      throw new ApiError(
        'EMAIL_FAILED',
        'Failed to send test follow-up email. Check logs for details.',
        500
      );
    }

    res.json({
      success: true,
      message: 'Test follow-up email sent successfully',
    });
  })
);

/**
 * GET /api/automation/settings
 * Get automation settings for the tenant
 */
router.get(
  '/settings',
  authenticate,
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const proposalSettings = getProposalSettings(tenant?.settings);

    res.json({
      success: true,
      data: {
        proposalChase: {
          enabled: proposalSettings.chaseSequenceEnabled,
          schedule: '0 9 * * *',
          chaseSequenceDays: proposalSettings.chaseSequenceDays,
        },
        emailFollowUp: {
          enabled: proposalSettings.chaseSequenceEnabled,
          schedule: '0 9 * * *',
          stages: proposalSettings.chaseSequenceDays.map((daysAfterSend) => ({
            daysAfterSend,
            template: daysAfterSend >= 14 ? 'urgent' : 'gentle',
          })),
        },
        proposalExpiry: {
          enabled: true,
          defaultExpiryDays: proposalSettings.defaultExpiryDays,
          reminderDaysBefore: proposalSettings.renewalReminderDays,
        },
        /** Practice delivery chase packs (Engager-style record request / deadline chases) */
        jobChasePacks: listChasePacks().map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          tone: p.tone,
          boardColumns: p.boardColumns || null,
        })),
        /** Server-side automation rules (synced from builder / UK packs) */
        automationRules: getAutomationRules(tenant?.settings),
      },
    });
  })
);

const rulesSchema = z.object({
  rules: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        trigger: z.string().min(1).max(80),
        action: z.string().min(1).max(80),
        enabled: z.boolean().optional(),
        source: z.string().max(80).optional(),
      })
    )
    .max(100),
});

/** PUT /api/automation/rules — persist builder rules on tenant */
router.put(
  '/rules',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MD', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const body = rulesSchema.parse(req.body);
    const saved = await saveAutomationRules(req.tenantId!, body.rules as AutomationRule[]);
    res.json({ success: true, data: { rules: saved } });
  })
);

/** GET /api/automation/rules */
router.get(
  '/rules',
  authenticate,
  asyncHandler(async (req, res) => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId! },
      select: { settings: true },
    });
    res.json({ success: true, data: { rules: getAutomationRules(tenant?.settings) } });
  })
);

/** GET /api/automation/schedule — opt-in state + last scheduled run */
router.get(
  '/schedule',
  authenticate,
  asyncHandler(async (req, res) => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId! },
      select: { settings: true },
    });
    let enabled = false;
    try {
      enabled = JSON.parse(tenant?.settings || '{}').automationSchedule === 'daily';
    } catch {
      /* malformed settings read as off */
    }
    const lastRun = await prisma.activityLog.findFirst({
      where: { tenantId: req.tenantId!, action: 'AUTOMATION_SCHEDULED_RUN' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, description: true },
    });
    res.json({
      success: true,
      data: {
        enabled,
        lastRunAt: lastRun?.createdAt || null,
        lastRunSummary: lastRun?.description || null,
      },
    });
  })
);

/**
 * PUT /api/automation/schedule — opt in/out of daily scheduled runs.
 * Client-facing actions fire automatically once enabled, so the change is
 * audited (AUTOMATION_SCHEDULE_CHANGED) and gated to senior roles.
 */
router.put(
  '/schedule',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MD'),
  asyncHandler(async (req, res) => {
    const body = z.object({ enabled: z.boolean() }).parse(req.body);
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId! },
      select: { settings: true },
    });
    let settings: Record<string, unknown> = {};
    try {
      settings = JSON.parse(tenant?.settings || '{}');
    } catch {
      settings = {};
    }
    const before = settings.automationSchedule === 'daily';
    if (body.enabled) settings.automationSchedule = 'daily';
    else delete settings.automationSchedule;
    await prisma.tenant.update({
      where: { id: req.tenantId! },
      data: { settings: JSON.stringify(settings) },
    });
    await prisma.activityLog.create({
      data: {
        action: 'AUTOMATION_SCHEDULE_CHANGED',
        entityType: 'Tenant',
        entityId: req.tenantId!,
        description: `Scheduled automations ${body.enabled ? 'ENABLED (daily)' : 'disabled'} (was ${before ? 'on' : 'off'})`,
        metadata: JSON.stringify({ enabled: body.enabled, before }),
        tenantId: req.tenantId!,
        userId: req.user?.id,
      },
    });
    res.json({ success: true, data: { enabled: body.enabled } });
  })
);

/** POST /api/automation/rules/run — dry-run or execute server rules */
router.post(
  '/rules/run',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MD', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const dryRun = req.body?.dryRun !== false; // default dry-run for safety
    const { results, dryRun: mode } = await runAutomationRules(req.tenantId!, { dryRun });
    const acted = results.reduce((s, r) => s + r.acted, 0);
    const matched = results.reduce((s, r) => s + r.matched, 0);
    res.json({
      success: true,
      data: { results, dryRun: mode, matched, acted },
      message: mode
        ? `Dry run: ${matched} matches across ${results.length} rules`
        : `Executed: ${acted} actions (${matched} matches)`,
    });
  })
);

/**
 * POST /api/automation/proposal-chase/run
 * Manually trigger the proposal chase job (admin/partner)
 */
router.post(
  '/proposal-chase/run',
  authenticate,
  authorize('ADMIN', 'PARTNER'),
  asyncHandler(async (req, res) => {
    logger.info('Manual proposal chase triggered by user:', req.user!.id);
    const result = await runProposalChaseJob();
    res.json({
      success: result.success,
      data: { sent: result.sent, failed: result.failed, skipped: result.skipped },
      message: `Proposal chase completed: ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped`,
    });
  })
);

/**
 * GET /api/automation/runs — recent AUTOMATION_RUN activity for the tenant.
 */
router.get(
  '/runs',
  authenticate,
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 50);
    const rows = await prisma.activityLog.findMany({
      where: {
        tenantId,
        action: { in: ['AUTOMATION_RUN', 'AUTOMATION_NOTIFY'] },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        action: true,
        description: true,
        metadata: true,
        createdAt: true,
      },
    });
    res.json({
      success: true,
      data: {
        runs: rows.map((r) => {
          let meta: unknown = {};
          try {
            meta = JSON.parse(r.metadata || '{}');
          } catch {
            /* ignore */
          }
          return {
            id: r.id,
            action: r.action,
            description: r.description,
            metadata: meta,
            at: r.createdAt.toISOString(),
          };
        }),
      },
    });
  })
);

export default router;
